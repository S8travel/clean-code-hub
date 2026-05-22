// Helper dùng chung cho các edge function đồng bộ Google Sheet
// (sync-dntt-to-sheet, sync-dntt-du-chi-to-sheet, sync-chi-phi-to-sheet).
// Sửa logic Sheets API ở ĐÂY — không lặp lại trong từng function.

/** Một ô trong Google Sheet — chuỗi hoặc số. */
export type SheetCell = string | number;
/** Một ma trận giá trị (rows × cols) gửi lên Sheets API. */
export type SheetValues = SheetCell[][];

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Convert PEM private key string → ArrayBuffer cho crypto.subtle.importKey. */
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

/** Tạo JWT ký bằng service account → đổi lấy OAuth2 access token cho Sheets API. */
export async function getAccessToken(
  saJson: { client_email: string; private_key: string },
): Promise<string> {
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

/** Đảm bảo tab tồn tại — nếu chưa thì tạo. */
export async function ensureSheetTab(
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
  const meta = (await metaRes.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const exists = (meta.sheets ?? []).some(
    (s) => s?.properties?.title === tabName,
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

/** Đảm bảo row 1 = header. Rewrite nếu length hoặc nội dung khác. */
export async function ensureHeader(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  header: string[],
  lastCol: string,
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
    existing.length === header.length &&
    header.every((h, i) => existing[i] === h);
  if (matches) return;

  const putRange = `${tabName}!A1:${lastCol}1`;
  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(putRange)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [header] }),
    },
  );
  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`Sheet PUT header failed: ${err}`);
  }
}

/** Đọc cột A từ row 2 trở đi → map id (number) → rowIndex (1-based) trong sheet. */
export async function readExistingIdRowMap(
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
    if (Number.isFinite(id)) map.set(id, i + 2); // row 1 = header → data từ row 2
  });
  return map;
}

/** Batch update nhiều range cùng lúc qua values:batchUpdate. */
export async function batchUpdateRows(
  accessToken: string,
  spreadsheetId: string,
  updates: { range: string; values: SheetValues }[],
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
      body: JSON.stringify({ valueInputOption: "RAW", data: updates }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sheet batchUpdate failed: ${err}`);
  }
}

/** Append rows vào cuối sheet. */
export async function appendRows(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  lastCol: string,
  rows: SheetValues,
): Promise<void> {
  if (rows.length === 0) return;
  const range = `${tabName}!A:${lastCol}`;
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

/** Format ISO date → "dd/mm/yyyy". */
export function fmtDate(s: string | null): string {
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

/** Format ISO date → "dd/mm/yyyy HH:MM". */
export function fmtDateTime(s: string | null): string {
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

// ─── Báo cáo dạng tab mới mỗi lần chạy (sync-chi-phi-to-sheet) ───────────────

/**
 * Tạo 1 tab mới tên `baseTitle`. Nếu tab trùng tên đã tồn tại → thêm hậu tố
 * " (2)", " (3)"… Trả về { sheetId, title } thực tế đã tạo.
 */
export async function createDatedTab(
  accessToken: string,
  spreadsheetId: string,
  baseTitle: string,
): Promise<{ sheetId: number; title: string }> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!metaRes.ok) {
    throw new Error(`Sheet metadata failed: ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const existing = new Set(
    (meta.sheets ?? []).map((s) => s?.properties?.title ?? ""),
  );

  let title = baseTitle;
  let n = 2;
  while (existing.has(title)) {
    title = `${baseTitle} (${n})`;
    n += 1;
  }

  const addRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title } } }],
      }),
    },
  );
  if (!addRes.ok) {
    throw new Error(`Sheet addSheet failed: ${await addRes.text()}`);
  }
  const addJson = (await addRes.json()) as {
    replies?: Array<{ addSheet?: { properties?: { sheetId?: number; title?: string } } }>;
  };
  const props = addJson.replies?.[0]?.addSheet?.properties;
  if (!props || typeof props.sheetId !== "number") {
    throw new Error("Sheet addSheet không trả về sheetId");
  }
  return { sheetId: props.sheetId, title: props.title ?? title };
}

/**
 * Ghi 1 khối giá trị 2D vào `range` (vd "'2026-05-22'!A1:I20").
 * Tên tab có ký tự đặc biệt (gạch ngang, khoảng trắng) PHẢI bọc nháy đơn.
 */
export async function writeValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: SheetValues,
): Promise<void> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values }),
    },
  );
  if (!res.ok) {
    throw new Error(`Sheet writeValues failed: ${await res.text()}`);
  }
}

/**
 * Gửi mảng request tùy ý lên spreadsheets:batchUpdate — dùng cho định dạng ô
 * (repeatCell, autoResizeDimensions, updateSpreadsheetProperties…).
 */
export async function batchUpdateSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  requests: Record<string, unknown>[],
): Promise<void> {
  if (requests.length === 0) return;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    },
  );
  if (!res.ok) {
    throw new Error(`Sheet batchUpdate failed: ${await res.text()}`);
  }
}
