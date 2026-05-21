// Edge function: đồng bộ DNTT (Đề nghị thanh toán) sang Google Sheet — tab "Du chi".
// Trigger: chỉ manual từ DNTTPage. Nhận filter từ client (giống bộ lọc đang hiển thị).
// Auth: service account JSON (env GCP_SA_JSON), spreadsheet_id qua env SHEET_ID,
//       tab name qua env SHEET_TAB_DU_CHI (mặc định "Du chi").
//
// Helper Sheets API dùng chung ở ../_shared/sheets.ts.
// Hành vi: full re-sync theo filter. Mỗi DNTT = 1 row identified by ID cột A.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  getAccessToken,
  ensureSheetTab,
  ensureHeader,
  readExistingIdRowMap,
  batchUpdateRows,
  appendRows,
  fmtDate,
  fmtDateTime,
} from "../_shared/sheets.ts";

const SHEET_HEADER = [
  "ID DNTT",          // A
  "Mã đoàn",          // B
  "Loại",             // C
  "Mô tả",            // D
  "Nhà cung cấp",     // E
  "Số tiền",          // F
  "Ngày cần TT",      // G
  "Ngày tạo",         // H
  "Người đề nghị",    // I
  "Kế toán Trưởng",   // J — cấp 3
  "Trạng thái duyệt", // K
  "Ghi chú",          // L
  "Sync lúc",         // M
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
  tra_truoc: "Trả trước",
  hoan_ung: "Hoàn ứng",
};

const TRANG_THAI_DUYET_LABEL: Record<string, string> = {
  cho_duyet: "Chờ duyệt",
  da_duyet: "Đã duyệt",
  tu_choi: "Từ chối",
  da_huy: "Đã hủy",
};

function fmtApprovalCell(
  uuid: string | null,
  luc: string | null,
  userMap: Map<string, string>,
): string {
  if (!uuid && !luc) return "";
  const name = uuid ? (userMap.get(uuid) ?? "—") : "—";
  const time = luc ? fmtDateTime(luc) : "";
  return time ? `${name} — ${time}` : name;
}

function buildRow(r: any, userMap: Map<string, string>, syncedAtStr: string): any[] {
  const tenNcc = r.nha_cung_cap?.ten ?? r.ten_nha_cung_cap ?? "";
  const tenDoan = r.doan?.ten_doan ?? "";
  const nguoiDeNghi = r.tao_boi ? (userMap.get(r.tao_boi) ?? "") : "";
  return [
    r.id,
    tenDoan,
    LOAI_LABEL[r.loai] ?? r.loai,
    r.mo_ta ?? "",
    tenNcc,
    Number(r.so_tien) || 0,
    fmtDate(r.ngay_can_thanh_toan),
    fmtDate(r.created_at),
    nguoiDeNghi,
    fmtApprovalCell(r.ktt_duyet_boi, r.ktt_duyet_luc, userMap),
    TRANG_THAI_DUYET_LABEL[r.trang_thai_duyet] ?? r.trang_thai_duyet ?? "",
    r.ghi_chu ?? "",
    syncedAtStr,
  ];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    // SB_SECRET_KEY = secret key mới; fallback legacy cho tới khi disable legacy keys.
    const SERVICE_ROLE_KEY = Deno.env.get("SB_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GCP_SA_JSON = Deno.env.get("GCP_SA_JSON")?.trim();
    const SHEET_ID = Deno.env.get("SHEET_ID")?.trim();
    const SHEET_TAB = (Deno.env.get("SHEET_TAB_DU_CHI")?.trim()) || "Du chi";

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

    // Parse filter body (POST). GET/empty body → fallback {} = không filter.
    let filters: {
      doanId?: number | null;
      fromDate?: string | null;
      toDate?: string | null;
      trangThaiDuyet?: string | null;
      loai?: string | null;
    } = {};
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body === "object") filters = body;
      } catch {
        // body trống / không phải JSON → bỏ qua, sync tất cả
      }
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Query dntt_with_payment_status view với filter — mirror useDNTTList
    let q = supabase
      .from("dntt_with_payment_status")
      .select(`
        *,
        doan:doan_id(ten_doan),
        nha_cung_cap:nha_cung_cap_id(ten)
      `)
      .order("ngay_can_thanh_toan", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (filters.doanId) q = q.eq("doan_id", filters.doanId);
    if (filters.fromDate) q = q.gte("created_at", filters.fromDate);
    if (filters.toDate) q = q.lte("created_at", filters.toDate + "T23:59:59");
    if (filters.trangThaiDuyet) q = q.eq("trang_thai_duyet", filters.trangThaiDuyet);
    if (filters.loai) q = q.eq("loai", filters.loai);

    const { data: rows, error: qErr } = await q;
    if (qErr) throw qErr;
    const pending = (rows ?? []) as any[];

    if (pending.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, updated: 0, inserted: 0, synced: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Resolve uuid → ho_ten cho tao_boi + cấp KTT (cấp 3)
    const uuids = new Set<string>();
    for (const r of pending) {
      [r.tao_boi, r.ktt_duyet_boi].forEach((u) => {
        if (u) uuids.add(u);
      });
    }
    const userMap = new Map<string, string>();
    if (uuids.size > 0) {
      const { data: users } = await supabase
        .from("user_roles")
        .select("user_id, ho_ten")
        .in("user_id", [...uuids]);
      (users || []).forEach((u: any) => {
        if (u.user_id && u.ho_ten) userMap.set(u.user_id, u.ho_ten);
      });
    }

    // 3. Auth + ensure tab + header
    const accessToken = await getAccessToken(saJson);
    await ensureSheetTab(accessToken, SHEET_ID, SHEET_TAB);
    await ensureHeader(accessToken, SHEET_ID, SHEET_TAB, SHEET_HEADER, LAST_COL);

    // 4. Read existing IDs → upsert by ID
    const idRowMap = await readExistingIdRowMap(accessToken, SHEET_ID, SHEET_TAB);

    // 5. Partition pending → toUpdate vs toInsert
    const syncedAt = new Date().toISOString();
    const syncedAtStr = fmtDateTime(syncedAt);
    const toUpdate: { range: string; values: any[][] }[] = [];
    const toInsert: any[][] = [];
    for (const r of pending) {
      const rowValues = buildRow(r, userMap, syncedAtStr);
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

    await batchUpdateRows(accessToken, SHEET_ID, toUpdate);
    await appendRows(accessToken, SHEET_ID, SHEET_TAB, LAST_COL, toInsert);

    return new Response(
      JSON.stringify({
        ok: true,
        total: pending.length,
        updated: toUpdate.length,
        inserted: toInsert.length,
        synced: pending.length,
        tab: SHEET_TAB,
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
