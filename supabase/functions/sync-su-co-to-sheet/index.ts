// Edge function: xuất báo cáo "Phát sinh sự cố" theo tuần sang Google Sheet.
//
// Trigger: pg_cron '0 1 * * 1' (1h UTC thứ 2 = 8h00 thứ 2 giờ VN) → báo cáo
//          tuần TRƯỚC (thứ 2 → CN). Gọi tay được: POST { from, to }.
// Auth:    verify_jwt=false (xem supabase/config.toml) + header 'x-cron-secret'
//          phải khớp env SU_CO_CRON_SECRET → chặn người lạ gọi.
// Hành vi: CHỈ ĐỌC DB (RPC get_su_co_weekly) + GHI Google Sheet (tab mới mỗi
//          tuần). KHÔNG đụng dữ liệu nghiệp vụ → rủi ro thấp.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  getAccessToken,
  createDatedTab,
  writeValues,
  batchUpdateSpreadsheet,
} from "../_shared/sheets.ts";
import {
  buildSuCoReport,
  SU_CO_COL_COUNT,
  type SuCoRow,
  type SuCoReport,
} from "../_shared/su-co-sheet-report.ts";

// ── Hằng số ─────────────────────────────────────────────────────────────────
const LAST_COL = SU_CO_COL_COUNT; // số cột bảng (A..F)
const COLOR_HEADER = { red: 0.902, green: 0.945, blue: 0.984 }; // #E6F1FB
// Bề rộng cột (px): Code, OP, HDV, Số khách, Vấn đề, Phương án.
const COL_WIDTHS = [150, 130, 120, 70, 360, 360];

// ── Helpers ngày ────────────────────────────────────────────────────────────
/** Ngày theo lịch VN (UTC+7) dạng 'YYYY-MM-DD'. */
function vnToday(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
/** Cộng/trừ `days` ngày cho chuỗi 'YYYY-MM-DD'. */
function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Tuần TRƯỚC (thứ 2 → CN) so với `ymd`. Mon=0..Sun=6. */
function prevWeekRange(ymd: string): { from: string; to: string } {
  const d = new Date(`${ymd}T00:00:00Z`);
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // Mon=0
  const thisMonday = shiftDate(ymd, -daysSinceMonday);
  return { from: shiftDate(thisMonday, -7), to: shiftDate(thisMonday, -1) };
}
/** Nhãn tab Sheet — KHÔNG dùng '/' (ký tự cấm trong tên tab). VD "Tuần 18.05-24.05.2026". */
function tabLabel(from: string, to: string): string {
  const dm = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? `${m[3]}.${m[2]}` : s;
  };
  const year = /^(\d{4})/.exec(to)?.[1] ?? "";
  return `Tuần ${dm(from)}-${dm(to)}.${year}`;
}

// ── Dựng request định dạng cho Sheets API ───────────────────────────────────
function buildFormatRequests(sheetId: number, report: SuCoReport): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];

  // Locale VN.
  requests.push({
    updateSpreadsheetProperties: { properties: { locale: "vi_VN" }, fields: "locale" },
  });

  // Tiêu đề lớn — in đậm cỡ 12.
  for (const row of report.titleRows) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: LAST_COL },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
        fields: "userEnteredFormat.textFormat",
      },
    });
  }

  // Header bảng — in đậm + nền xanh + canh giữa.
  for (const h of report.headerRows) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: h.row, endRowIndex: h.row + 1, startColumnIndex: 0, endColumnIndex: h.colEnd },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLOR_HEADER,
            textFormat: { bold: true },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
      },
    });
  }

  // Vùng data: wrap text + canh trên (Vấn đề / Phương án dài).
  if (report.dataStart >= 0) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: report.dataStart, endRowIndex: report.dataEnd, startColumnIndex: 0, endColumnIndex: LAST_COL },
        cell: { userEnteredFormat: { wrapStrategy: "WRAP", verticalAlignment: "TOP" } },
        fields: "userEnteredFormat(wrapStrategy,verticalAlignment)",
      },
    });
  }

  // Bề rộng cột cố định (KHÔNG auto-resize: cột mô tả dài sẽ kéo quá rộng).
  COL_WIDTHS.forEach((px, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: "pixelSize",
      },
    });
  });

  return requests;
}

// ── Gửi email (best-effort: lỗi chỉ log, không làm hỏng cả lần chạy) ─────────
async function sendEmail(subject: string, html: string): Promise<void> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const TO = Deno.env.get("SU_CO_REPORT_EMAIL");
  if (!RESEND_API_KEY || !TO) {
    console.warn("Bỏ qua email: thiếu RESEND_API_KEY hoặc SU_CO_REPORT_EMAIL");
    return;
  }
  const toList = TO.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
  if (toList.length === 0) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "S8 Travel <booking@email.s8travel.com>", to: toList, subject, html }),
    });
    if (!res.ok) console.error("Gửi email thất bại:", await res.text());
  } catch (e) {
    console.error("Gửi email lỗi:", e instanceof Error ? e.message : String(e));
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── Auth: cron secret ──
    const CRON_SECRET = Deno.env.get("SU_CO_CRON_SECRET")?.trim();
    if (!CRON_SECRET) {
      return json({ error: "Chưa cấu hình SU_CO_CRON_SECRET trong Supabase secrets" }, 500);
    }
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── Env ──
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GCP_SA_JSON = Deno.env.get("GCP_SA_JSON")?.trim();
    const SHEET_ID = Deno.env.get("SU_CO_SHEET_ID")?.trim();
    const NGUOI_BAO_CAO = Deno.env.get("SU_CO_REPORT_NGUOI_BAO_CAO")?.trim() || "";
    const BO_PHAN = Deno.env.get("SU_CO_REPORT_BO_PHAN")?.trim() || "";
    if (!GCP_SA_JSON || !SHEET_ID) {
      return json({ error: "Thiếu GCP_SA_JSON hoặc SU_CO_SHEET_ID trong Supabase secrets" }, 500);
    }
    let saJson: { client_email: string; private_key: string };
    try {
      saJson = JSON.parse(GCP_SA_JSON);
    } catch {
      return json({ error: "GCP_SA_JSON không phải JSON hợp lệ" }, 500);
    }

    // ── Khoảng ngày: body nếu có, ngược lại tuần trước (T2 → CN) ──
    let from = "";
    let to = "";
    if (req.method === "POST") {
      try {
        const body = (await req.json()) as { from?: unknown; to?: unknown };
        if (typeof body?.from === "string") from = body.from;
        if (typeof body?.to === "string") to = body.to;
      } catch {
        // body trống → dùng tuần trước
      }
    }
    if (!from || !to) {
      const w = prevWeekRange(vnToday());
      from = w.from;
      to = w.to;
    }

    // ── Lấy dữ liệu qua RPC ──
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase.rpc("get_su_co_weekly", { p_from: from, p_to: to });
    if (error) throw new Error(`RPC get_su_co_weekly: ${error.message}`);
    const rows = (data ?? []) as SuCoRow[];

    // ── Dựng báo cáo ──
    const report = buildSuCoReport(rows, { from, to, nguoiBaoCao: NGUOI_BAO_CAO, boPhan: BO_PHAN });

    // ── Ghi Google Sheet: tab mới tên = khoảng tuần ──
    const accessToken = await getAccessToken(saJson);
    const { sheetId, title } = await createDatedTab(accessToken, SHEET_ID, tabLabel(from, to));
    const range = `'${title}'!A1:F${report.values.length}`;
    await writeValues(accessToken, SHEET_ID, range, report.values);
    await batchUpdateSpreadsheet(accessToken, SHEET_ID, buildFormatRequests(sheetId, report));

    // ── Email báo cáo xong ──
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${sheetId}`;
    await sendEmail(
      `[S8] Báo cáo phát sinh sự cố tuần ${from} → ${to}`,
      `<p>Đã xuất báo cáo phát sinh sự cố lên Google Sheet.</p>
       <ul>
         <li>Tuần: <b>${from}</b> → <b>${to}</b></li>
         <li>Số sự cố: <b>${report.suCoCount}</b></li>
         <li>Tab mới: <b>${title}</b></li>
       </ul>
       <p><a href="${sheetUrl}">Mở Google Sheet</a></p>`,
    );

    return json({ ok: true, tab: title, from, to, suCoCount: report.suCoCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-su-co-to-sheet lỗi:", message);
    await sendEmail(
      "[S8] LỖI xuất báo cáo phát sinh sự cố",
      `<p>Edge function <b>sync-su-co-to-sheet</b> chạy thất bại.</p><pre>${message}</pre>`,
    );
    return json({ error: message }, 500);
  }
});
