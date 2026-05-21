// Edge function: đồng bộ DNTT đã duyệt sang Google Sheet.
// Trigger: cron 30' hoặc manual từ HoaDonUNCPage.
// Auth: service account JSON (lưu trong env GCP_SA_JSON), spreadsheet_id qua env SHEET_ID,
//       tab name qua env SHEET_TAB (mặc định "Sheet1").
//
// Helper Sheets API dùng chung ở ../_shared/sheets.ts.
// Hành vi: full re-sync. Mỗi DNTT (da_duyet) = 1 row duy nhất, identified by ID cột A.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  getAccessToken,
  ensureHeader,
  readExistingIdRowMap,
  batchUpdateRows,
  appendRows,
  fmtDate,
} from "../_shared/sheets.ts";

const SHEET_HEADER = [
  "ID DNTT",         // A
  "Đoàn",            // B
  "Loại",            // C
  "Mô tả",           // D
  "Nhà cung cấp",    // E
  "Số tiền",         // F
  "Ngày cần TT",     // G
  "Ngày thanh toán", // H
  "Nguồn TT",        // I
  "Hóa đơn URL",     // J
  "UNC URL",         // K
  "Sync lúc",        // L
  "Trạng thái",      // M
];
const LAST_COL = "M";

const LOAI_LABEL: Record<string, string> = {
  khach_san: "KS",
  nha_hang: "NH",
  dich_vu: "DV",
  xe: "Xe",
  visa: "Visa",
  bao_hiem: "BH",
  hdv: "HDV",
  dinh_ky: "Định kỳ",
};

const STATUS_LABEL: Record<string, string> = {
  unpaid: "Chưa TT",
  partial: "Một phần",
  paid: "Đã TT",
};

function buildRow(r: any, syncedAtStr: string): any[] {
  return [
    r.id,
    r.ten_doan ?? "",
    LOAI_LABEL[r.loai] ?? r.loai,
    r.mo_ta ?? "",
    r.ten_nha_cung_cap ?? "",
    Number(r.so_tien) || 0,
    fmtDate(r.ngay_can_thanh_toan),
    fmtDate(r.thanh_toan_luc),
    r.nguon ?? "",
    r.hoa_don_url ?? "",
    r.unc_url ?? "",
    syncedAtStr,
    STATUS_LABEL[r.payment_status] ?? r.payment_status ?? "",
  ];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GCP_SA_JSON = Deno.env.get("GCP_SA_JSON")?.trim();
    const SHEET_ID = Deno.env.get("SHEET_ID")?.trim();
    const SHEET_TAB = (Deno.env.get("SHEET_TAB")?.trim()) || "Sheet1";

    if (!GCP_SA_JSON || !SHEET_ID) {
      return new Response(
        JSON.stringify({ error: "Thiếu GCP_SA_JSON hoặc SHEET_ID trong Supabase secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let saJson: { client_email: string; private_key: string };
    try {
      saJson = JSON.parse(GCP_SA_JSON);
    } catch {
      return new Response(
        JSON.stringify({ error: "GCP_SA_JSON không phải JSON hợp lệ" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Lấy tất cả DNTT da_duyet (paid + partial + unpaid)
    const { data: rows, error: rpcErr } = await supabase.rpc("get_dntt_pending_export");
    if (rpcErr) throw rpcErr;
    const pending = (rows ?? []) as any[];

    if (pending.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, updated: 0, inserted: 0, message: "Không có DNTT đã duyệt nào" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Auth + ensure header
    const accessToken = await getAccessToken(saJson);
    await ensureHeader(accessToken, SHEET_ID, SHEET_TAB, SHEET_HEADER, LAST_COL);

    // 3. Read existing IDs trong sheet → map id → rowIndex
    const idRowMap = await readExistingIdRowMap(accessToken, SHEET_ID, SHEET_TAB);

    // 4. Partition pending → toUpdate vs toInsert
    const syncedAt = new Date().toISOString();
    const syncedAtStr = fmtDate(syncedAt);
    const toUpdate: { range: string; values: any[][] }[] = [];
    const toInsert: any[][] = [];
    const allIds: number[] = [];
    for (const r of pending) {
      allIds.push(r.id);
      const rowValues = buildRow(r, syncedAtStr);
      const existingRowIdx = idRowMap.get(r.id);
      if (existingRowIdx) {
        toUpdate.push({
          range: `${SHEET_TAB}!A${existingRowIdx}:${LAST_COL}${existingRowIdx}`,
          values: [rowValues],
        });
      } else {
        toInsert.push(rowValues);
      }
    }

    // 5. Apply batch update + append
    await batchUpdateRows(accessToken, SHEET_ID, toUpdate);
    await appendRows(accessToken, SHEET_ID, SHEET_TAB, LAST_COL, toInsert);

    // 6. Mark exported (cập nhật mọi lần sync để theo dõi)
    if (allIds.length > 0) {
      const { error: updErr } = await supabase
        .from("de_nghi_thanh_toan")
        .update({ exported_to_sheet_at: syncedAt })
        .in("id", allIds);
      if (updErr) throw updErr;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: pending.length,
        updated: toUpdate.length,
        inserted: toInsert.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
