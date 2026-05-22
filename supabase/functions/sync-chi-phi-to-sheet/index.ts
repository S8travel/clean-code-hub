// Edge function: xuất báo cáo chi phí các đoàn sắp khởi hành sang Google Sheet.
// SPEC: SPEC_chi-phi-sheet-sync.md
//
// Trigger: pg_cron '0 9 * * 4' (9h UTC thứ 5 = 16h00 thứ 5 giờ VN).
//          Gọi tay được: POST { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }.
// Auth:    verify_jwt=false (xem supabase/config.toml) + header 'x-cron-secret'
//          phải khớp env CHI_PHI_CRON_SECRET → chặn người lạ gọi.
// Hành vi: CHỈ ĐỌC DB (RPC get_chi_phi_doan_summary) + GHI Google Sheet.
//          Mỗi lần chạy tạo 1 tab mới tên = ngày chạy (YYYY-MM-DD).
//          KHÔNG đụng dữ liệu kế toán → rủi ro thấp.
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
  buildChiPhiReport,
  type ChiPhiDoanRow,
  type ChiPhiReport,
} from "../_shared/chi-phi-sheet-report.ts";

// ── Hằng số chỉnh tay ───────────────────────────────────────────────────────
// Ngưỡng cảnh báo "nghi thiếu chi phí": đoàn có số dòng doan_chi_phi
// < số đêm × WARN_FACTOR → gắn cờ ⚠ ở cột Ghi chú. Tăng/giảm tại đây.
const WARN_FACTOR = 3;
// Cửa sổ ngày khởi hành (SPEC §3): [run, run+6] — chạy thứ 5 → quét thứ 5 đến
// thứ 4 tuần sau (7 ngày). Chỉnh nếu đổi ngày chạy cron.
const WINDOW_DAYS_BEFORE = 0;
const WINDOW_DAYS_AFTER = 6;
// Số cột bảng chi tiết (A..I) — dùng cho range định dạng.
const LAST_COL = 9;
// Màu nền (Google Sheets API: kênh màu 0..1).
const COLOR_HEADER = { red: 0.902, green: 0.945, blue: 0.984 }; // #E6F1FB
const COLOR_TOTAL = { red: 0.949, green: 0.949, blue: 0.949 }; // #F2F2F2

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

// ── Dựng request định dạng cho Sheets API ───────────────────────────────────
function buildFormatRequests(
  sheetId: number,
  report: ChiPhiReport,
): Record<string, unknown>[] {
  const requests: Record<string, unknown>[] = [];

  // Locale VN → dấu phân cách hàng nghìn là '.'
  requests.push({
    updateSpreadsheetProperties: {
      properties: { locale: "vi_VN" },
      fields: "locale",
    },
  });

  // Tiêu đề lớn — in đậm, cỡ 12.
  for (const row of report.titleRows) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: LAST_COL },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
        fields: "userEnteredFormat.textFormat",
      },
    });
  }

  // Header bảng — in đậm + nền xanh.
  for (const h of report.headerRows) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: h.row, endRowIndex: h.row + 1, startColumnIndex: 0, endColumnIndex: h.colEnd },
        cell: { userEnteredFormat: { backgroundColor: COLOR_HEADER, textFormat: { bold: true } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
  }

  // Dòng tổng — in đậm + nền nhạt.
  for (const t of report.totalRows) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: t.row, endRowIndex: t.row + 1, startColumnIndex: 0, endColumnIndex: t.colEnd },
        cell: { userEnteredFormat: { backgroundColor: COLOR_TOTAL, textFormat: { bold: true } } },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    });
  }

  // Cột tiền — định dạng phân cách hàng nghìn.
  for (const mr of report.moneyRanges) {
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: mr.rowStart, endRowIndex: mr.rowEnd, startColumnIndex: mr.colStart, endColumnIndex: mr.colEnd },
        cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    });
  }

  // Cột A (STT): cố định hẹp — KHÔNG auto-resize vì tiêu đề dài ở A1 sẽ kéo cột rộng ra.
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 70 },
      fields: "pixelSize",
    },
  });
  // Cột B..I: tự dãn theo nội dung.
  requests.push({
    autoResizeDimensions: {
      dimensions: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: LAST_COL },
    },
  });

  return requests;
}

// ── Gửi email (best-effort: lỗi chỉ log, không làm hỏng cả lần chạy) ─────────
async function sendEmail(subject: string, html: string): Promise<void> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const TO = Deno.env.get("CHI_PHI_REPORT_EMAIL");
  if (!RESEND_API_KEY || !TO) {
    console.warn("Bỏ qua email: thiếu RESEND_API_KEY hoặc CHI_PHI_REPORT_EMAIL");
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
    // ── Auth: kiểm tra cron secret ──
    const CRON_SECRET = Deno.env.get("CHI_PHI_CRON_SECRET")?.trim();
    if (!CRON_SECRET) {
      return json({ error: "Chưa cấu hình CHI_PHI_CRON_SECRET trong Supabase secrets" }, 500);
    }
    if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── Env ──
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GCP_SA_JSON = Deno.env.get("GCP_SA_JSON")?.trim();
    const SHEET_ID = Deno.env.get("CHI_PHI_SHEET_ID")?.trim();
    if (!GCP_SA_JSON || !SHEET_ID) {
      return json({ error: "Thiếu GCP_SA_JSON hoặc CHI_PHI_SHEET_ID trong Supabase secrets" }, 500);
    }
    let saJson: { client_email: string; private_key: string };
    try {
      saJson = JSON.parse(GCP_SA_JSON);
    } catch {
      return json({ error: "GCP_SA_JSON không phải JSON hợp lệ" }, 500);
    }

    // ── Khoảng ngày: lấy từ body nếu có, ngược lại dùng cửa sổ [run, run+6] ──
    let from = "";
    let to = "";
    if (req.method === "POST") {
      try {
        const body = (await req.json()) as { from?: unknown; to?: unknown };
        if (typeof body?.from === "string") from = body.from;
        if (typeof body?.to === "string") to = body.to;
      } catch {
        // body trống / không phải JSON → dùng cửa sổ mặc định
      }
    }
    if (!from || !to) {
      const today = vnToday();
      from = shiftDate(today, -WINDOW_DAYS_BEFORE);
      to = shiftDate(today, WINDOW_DAYS_AFTER);
    }

    // ── Lấy dữ liệu qua RPC ──
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabase.rpc("get_chi_phi_doan_summary", {
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`RPC get_chi_phi_doan_summary: ${error.message}`);
    const rows = (data ?? []) as ChiPhiDoanRow[];

    // ── Dựng báo cáo ──
    const report = buildChiPhiReport(rows, { from, to, warnFactor: WARN_FACTOR });

    // ── Ghi Google Sheet: tab mới tên = ngày chạy ──
    const accessToken = await getAccessToken(saJson);
    const { sheetId, title } = await createDatedTab(accessToken, SHEET_ID, vnToday());
    // Tên tab có gạch ngang → BẮT BUỘC bọc nháy đơn trong A1 notation.
    const range = `'${title}'!A1:I${report.values.length}`;
    await writeValues(accessToken, SHEET_ID, range, report.values);
    await batchUpdateSpreadsheet(accessToken, SHEET_ID, buildFormatRequests(sheetId, report));

    // ── Email báo cáo xong ──
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=${sheetId}`;
    const totalChiPhi = rows.reduce((s, r) => s + (Number(r.tong_chi_phi) || 0), 0);
    await sendEmail(
      `[S8] Báo cáo chi phí đoàn khởi hành ${from} → ${to}`,
      `<p>Đã xuất báo cáo chi phí lên Google Sheet.</p>
       <ul>
         <li>Khoảng ngày khởi hành: <b>${from}</b> → <b>${to}</b></li>
         <li>Số đoàn: <b>${report.doanCount}</b></li>
         <li>Tổng chi phí: <b>${totalChiPhi.toLocaleString("vi-VN")} VND</b></li>
         <li>Đoàn nghi thiếu chi phí: <b>${report.warnCount}</b></li>
         <li>Tab mới: <b>${title}</b></li>
       </ul>
       <p><a href="${sheetUrl}">Mở Google Sheet</a></p>`,
    );

    return json({
      ok: true,
      tab: title,
      from,
      to,
      doanCount: report.doanCount,
      warnCount: report.warnCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync-chi-phi-to-sheet lỗi:", message);
    // Email báo lỗi để cron không "xanh giả" (SPEC §7).
    await sendEmail(
      "[S8] LỖI xuất báo cáo chi phí đoàn",
      `<p>Edge function <b>sync-chi-phi-to-sheet</b> chạy thất bại.</p><pre>${message}</pre>`,
    );
    return json({ error: message }, 500);
  }
});
