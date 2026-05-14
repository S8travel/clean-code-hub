// Edge function: đồng bộ DNTT đã thanh toán sang Google Sheet (append-only).
// Trigger: cron 30' hoặc manual từ HoaDonUNCPage.
// Auth: service account JSON (lưu trong env GCP_SA_JSON), spreadsheet_id qua env SHEET_ID,
//       tab name qua env SHEET_TAB (mặc định "Sheet1").
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SHEET_HEADER = [
  "ID DNTT",
  "Đoàn",
  "Loại",
  "Mô tả",
  "Nhà cung cấp",
  "Số tiền",
  "Ngày cần TT",
  "Ngày thanh toán",
  "Nguồn TT",
  "Hóa đơn URL",
  "UNC URL",
  "Sync lúc",
];

/** Convert PEM private key string → ArrayBuffer for crypto.subtle.importKey */
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

/** Tạo JWT signed by service account → đổi lấy OAuth2 access token cho Sheets API. */
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

/** Kiểm tra sheet đã có header chưa; nếu chưa → ghi vào A1. */
async function ensureHeader(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
): Promise<void> {
  const range = `${tabName}!A1:L1`;
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
  if (existing.length > 0 && existing[0] === SHEET_HEADER[0]) return; // đã có

  // Ghi header (UPDATE A1 row)
  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
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

/** Append rows vào sheet. Trả số row đã ghi. */
async function appendRows(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  rows: any[][],
): Promise<number> {
  if (rows.length === 0) return 0;
  const range = `${tabName}!A:L`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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
  return rows.length;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GCP_SA_JSON = Deno.env.get("GCP_SA_JSON");
    const SHEET_ID = Deno.env.get("SHEET_ID");
    const SHEET_TAB = Deno.env.get("SHEET_TAB") || "Sheet1";

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

    // 1. Lấy DNTT đã paid + chưa export
    const { data: rows, error: rpcErr } = await supabase.rpc("get_dntt_pending_export");
    if (rpcErr) throw rpcErr;
    const pending = (rows ?? []) as any[];

    if (pending.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, synced: 0, message: "Không có DNTT mới cần sync" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Auth + đảm bảo header
    const accessToken = await getAccessToken(saJson);
    await ensureHeader(accessToken, SHEET_ID, SHEET_TAB);

    // 3. Build rows
    const syncedAt = new Date().toISOString();
    const sheetRows = pending.map((r) => [
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
      fmtDate(syncedAt),
    ]);

    const appended = await appendRows(accessToken, SHEET_ID, SHEET_TAB, sheetRows);

    // 4. Mark exported
    const ids = pending.map((r) => r.id);
    const { error: updErr } = await supabase
      .from("de_nghi_thanh_toan")
      .update({ exported_to_sheet_at: syncedAt })
      .in("id", ids);
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({ ok: true, synced: appended, ids }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
