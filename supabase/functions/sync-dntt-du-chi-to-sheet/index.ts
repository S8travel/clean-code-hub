// Edge function: đồng bộ DNTT (Đề nghị thanh toán) sang Google Sheet — tab "Du chi".
// Trigger: chỉ manual từ DNTTPage. Nhận filter từ client (giống bộ lọc đang hiển thị).
// Auth: service account JSON (env GCP_SA_JSON), spreadsheet_id qua env SHEET_ID,
//       tab name qua env SHEET_TAB_DU_CHI (mặc định "Du chi").
//
// Hành vi: full re-sync theo filter. Mỗi DNTT = 1 row identified by ID cột A.
// - DNTT chưa có trong sheet → append vào cuối
// - DNTT đã có → update tại đúng row
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
const LAST_COL = "M"; // = column thứ 13

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncode(input: ArrayBuffer | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(saJson: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: saJson.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signInput = `${headerB64}.${payloadB64}`;

  const keyBuf = pemToArrayBuffer(saJson.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBuf,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput),
  );
  const jwt = `${signInput}.${base64UrlEncode(sigBuf)}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`OAuth token exchange failed: ${err}`);
  }
  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

async function ensureHeader(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
): Promise<void> {
  const range = `${tabName}!A1:Z1`;
  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!getRes.ok) {
    const err = await getRes.text();
    throw new Error(`Sheet GET header failed: ${err}`);
  }
  const data = await getRes.json();
  const existing = (data.values?.[0] ?? []) as string[];
  const matches =
    existing.length === SHEET_HEADER.length &&
    SHEET_HEADER.every((h, i) => existing[i] === h);
  if (matches) return;

  const putRange = `${tabName}!A1:${LAST_COL}1`;
  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(putRange)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [SHEET_HEADER] }),
    },
  );
  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`Sheet PUT header failed: ${err}`);
  }
}

/** Đảm bảo tab tồn tại — nếu chưa thì tạo. */
async function ensureSheetTab(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
): Promise<void> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) {
    const err = await metaRes.text();
    throw new Error(`Sheet metadata failed: ${err}`);
  }
  const meta = await metaRes.json();
  const exists = (meta.sheets ?? []).some(
    (s: any) => s?.properties?.title === tabName,
  );
  if (exists) return;

  const addRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: tabName } } }],
      }),
    },
  );
  if (!addRes.ok) {
    const err = await addRes.text();
    throw new Error(`Sheet addSheet failed: ${err}`);
  }
}

async function readExistingIdRowMap(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
): Promise<Map<number, number>> {
  const range = `${tabName}!A2:A`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheet GET ids failed: ${err}`);
  }
  const data = await res.json();
  const rows = (data.values ?? []) as string[][];
  const map = new Map<number, number>();
  rows.forEach((r, i) => {
    const id = Number(r?.[0]);
    if (Number.isFinite(id)) map.set(id, i + 2);
  });
  return map;
}

async function batchUpdateRows(
  accessToken: string,
  spreadsheetId: string,
  updates: { range: string; values: any[][] }[],
): Promise<void> {
  if (updates.length === 0) return;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: updates,
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheet batchUpdate failed: ${err}`);
  }
}

async function appendRows(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  rows: any[][],
): Promise<void> {
  if (rows.length === 0) return;
  const range = `${tabName}!A:${LAST_COL}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheet append failed: ${err}`);
  }
}

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

function fmtDate(s: string | null): string {
  if (!s) return "";
  try {
    const d = new Date(s);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch {
    return s;
  }
}

function fmtDateTime(s: string | null): string {
  if (!s) return "";
  try {
    const d = new Date(s);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
  } catch {
    return s;
  }
}

function fmtApprovalCell(uuid: string | null, luc: string | null, userMap: Map<string, string>): string {
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
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    await ensureHeader(accessToken, SHEET_ID, SHEET_TAB);

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
    await appendRows(accessToken, SHEET_ID, SHEET_TAB, toInsert);

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
