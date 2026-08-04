// FB Lead Ads + Messenger → CRM. Meta chỉ cho 1 callback URL cho object `page`
// → MỌI field (leadgen, messages...) cùng đổ về webhook này.
//
//  - Leadgen  : entry[].changes[] field='leadgen' → GET graph → RPC
//               create_lead_from_form (auto-assign round-robin + log).
//  - Messenger: entry[].messaging[] có message → RPC upsert_lead_from_messenger
//               (PSID mới → tạo lead 'fb_messenger' + thông báo lead_moi qua
//               trigger; PSID cũ → log lead_activity + thông báo lead_tin_nhan_fb).
//               Lead mới: fetch tên profile qua Graph để đặt ho_ten.
//
// 2 mode:
//  - GET  : Facebook verify webhook (hub.mode/hub.verify_token/hub.challenge).
//  - POST : sự kiện page (leadgen + messages).
//
// Public-callable (FB gọi không có JWT) → đặt verify_jwt=false trong config.toml.
// Bảo vệ: (1) verify_token khi đăng ký; (2) chữ ký X-Hub-Signature-256 (nếu set
// FB_APP_SECRET); (3) fetch leadgen cần FB_PAGE_ACCESS_TOKEN hợp lệ → POST giả
// không lấy được data; (4) RPC messenger chỉ GRANT cho service_role.
//
// Secrets cần set (supabase secrets):
//   FB_VERIFY_TOKEN        — chuỗi tự chọn, khớp với cấu hình webhook trên FB.
//   FB_PAGE_ACCESS_TOKEN   — long-lived Page Access Token (quyền leads_retrieval;
//                            thêm pages_messaging để đọc tên profile người nhắn).
//   FB_PAGE_TOKENS         — (khi nối NHIỀU fanpage) JSON {"<page_id>":"<token>"};
//                            PSID là page-scoped nên fetch profile phải đúng token
//                            của trang đó. Chưa set → dùng FB_PAGE_ACCESS_TOKEN.
//                            Hoặc: dán token trang mới vào secret FB_* tùy tên —
//                            fn tự dò token thuộc trang nào qua Graph /me.
//   FB_APP_SECRET          — (tùy chọn) để verify chữ ký webhook.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — tự có sẵn trong môi trường edge fn.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GRAPH_VERSION = "v21.0";

// FB field name chuẩn → param RPC. Field tùy biến (câu hỏi riêng) gộp vào ghi_chu.
const STD_FIELDS = new Set([
  "full_name", "first_name", "last_name", "email", "phone_number",
]);

interface LeadFieldData {
  name: string;
  values: string[];
}

function firstVal(fields: LeadFieldData[], name: string): string | null {
  const f = fields.find((x) => x.name === name);
  return f && f.values.length > 0 ? String(f.values[0]).trim() : null;
}

function buildHoTen(fields: LeadFieldData[]): string {
  const full = firstVal(fields, "full_name");
  if (full) return full;
  const first = firstVal(fields, "first_name") ?? "";
  const last = firstVal(fields, "last_name") ?? "";
  return `${first} ${last}`.trim() || "Khách FB Lead";
}

// Câu hỏi tùy biến → text gộp vào ghi_chu để sales không mất thông tin.
function buildGhiChu(fields: LeadFieldData[], formName: string | null): string {
  const custom = fields
    .filter((f) => !STD_FIELDS.has(f.name) && f.values.length > 0)
    .map((f) => `${f.name}: ${f.values.join(", ")}`);
  const parts = [`Nguồn: FB Lead Ads${formName ? ` (form: ${formName})` : ""}`, ...custom];
  return parts.join("\n");
}

// Verify chữ ký FB (X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(body, app_secret)).
async function verifySignature(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = header.slice("sha256=".length);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // So sánh thời gian hằng (tránh timing attack).
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Lấy chi tiết 1 lead từ Graph API.
async function fetchLeadFields(leadgenId: string, token: string): Promise<{ fields: LeadFieldData[]; formName: string | null } | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${leadgenId}?fields=field_data,form_id&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Graph fetch lead ${leadgenId} fail: ${res.status} ${await res.text()}`);
    return null;
  }
  const data = await res.json();
  const fields: LeadFieldData[] = Array.isArray(data.field_data) ? data.field_data : [];
  return { fields, formName: data.form_id ?? null };
}

// Gọi RPC create_lead_from_form qua REST (service role).
async function createLead(fields: LeadFieldData[], formName: string | null): Promise<boolean> {
  const supaUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supaUrl || !serviceKey) {
    console.error("Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return false;
  }
  const hoTen = buildHoTen(fields);
  const sdt = firstVal(fields, "phone_number");
  const email = firstVal(fields, "email");
  if (!sdt && !email) {
    console.error("Lead FB thiếu cả SDT lẫn email → bỏ qua");
    return false;
  }
  const res = await fetch(`${supaUrl}/rest/v1/rpc/create_lead_from_form`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      p_ho_ten: hoTen,
      p_so_dien_thoai: sdt,
      p_email: email,
      p_loai_tour: "outbound",
      p_ghi_chu: buildGhiChu(fields, formName),
      p_nguon: "fb_lead_ads",
    }),
  });
  if (!res.ok) {
    console.error(`RPC create_lead fail: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

// ── Messenger ────────────────────────────────────────────────────────────────

interface MessengerEvent {
  sender?: { id?: string };
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type?: string }[];
  };
}

// ── Token theo trang ──────────────────────────────────────────────────────────
// PSID là page-scoped → fetch profile PHẢI dùng đúng token của trang đó.
// Nguồn token (không cần khai page id thủ công):
//   1. FB_PAGE_TOKENS = JSON {"<page_id>":"<token>"} (map tường minh — ưu tiên)
//   2. TỰ DÒ: mọi secret tên FB_* có giá trị dạng page token (EAA...) — gọi Graph
//      /me?fields=id để biết token thuộc trang nào, cache lại (per warm instance).
//      → Thêm fanpage mới = tạo token + dán vào secret FB_<tên tuỳ ý> là chạy.
//   3. Fallback FB_PAGE_ACCESS_TOKEN (trang đầu tiên / khi không dò ra).
const pageTokenCache = new Map<string, string>();

function candidateTokens(): string[] {
  const env = Deno.env.toObject();
  const out: string[] = [];
  const raw = env["FB_PAGE_TOKENS"];
  if (raw) {
    try {
      const v = JSON.parse(raw) as unknown;
      if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === "string"));
      else if (v && typeof v === "object") {
        out.push(...Object.values(v).filter((x): x is string => typeof x === "string"));
      }
    } catch {
      console.error("FB_PAGE_TOKENS không phải JSON hợp lệ — bỏ qua");
    }
  }
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith("FB_") && typeof v === "string" && v.startsWith("EAA")) out.push(v);
  }
  return [...new Set(out)];
}

// Token này của trang nào? (Graph /me với page token trả về chính trang đó.)
async function tokenPageId(token: string): Promise<string | null> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id&access_token=${encodeURIComponent(token)}`,
  );
  if (!res.ok) return null;
  const d = await res.json();
  return typeof d.id === "string" ? d.id : null;
}

async function pageTokenFor(pageId: string | null): Promise<string | undefined> {
  const fallback = Deno.env.get("FB_PAGE_ACCESS_TOKEN") ?? undefined;
  if (!pageId) return fallback;
  const cached = pageTokenCache.get(pageId);
  if (cached) return cached;
  // Map tường minh trước (không tốn call Graph)
  const raw = Deno.env.get("FB_PAGE_TOKENS");
  if (raw) {
    try {
      const m = JSON.parse(raw) as Record<string, unknown>;
      if (!Array.isArray(m) && typeof m[pageId] === "string") {
        pageTokenCache.set(pageId, m[pageId] as string);
        return m[pageId] as string;
      }
    } catch { /* đã log ở candidateTokens */ }
  }
  // Tự dò trong các secret FB_* — chỉ tốn call Graph lần đầu mỗi trang (có cache)
  for (const t of candidateTokens()) {
    if ((await tokenPageId(t)) === pageId) {
      pageTokenCache.set(pageId, t);
      return t;
    }
  }
  return fallback;
}

// Tên profile người nhắn (cần pages_messaging đã duyệt; fail → null, giữ tên mặc định).
async function fetchProfileName(psid: string, token: string): Promise<string | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${psid}?fields=name&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Graph fetch profile ${psid} fail: ${res.status} ${await res.text()}`);
    return null;
  }
  const data = await res.json();
  return typeof data.name === "string" && data.name.trim() ? data.name.trim() : null;
}

// Tên fanpage (để lưu lead thuộc trang nào — hệ thống có thể nối nhiều trang).
async function fetchPageName(pageId: string, token: string): Promise<string | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}?fields=name&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Graph fetch page ${pageId} fail: ${res.status} ${await res.text()}`);
    return null;
  }
  const data = await res.json();
  return typeof data.name === "string" && data.name.trim() ? data.name.trim() : null;
}

// Lead theo PSID đã tồn tại chưa — chỉ để quyết định có fetch tên profile không
// (RPC tự chống race bằng advisory lock, check này không cần chính xác tuyệt đối).
async function psidHasLead(psid: string, supaUrl: string, serviceKey: string): Promise<boolean> {
  const res = await fetch(
    `${supaUrl}/rest/v1/lead?fb_psid=eq.${encodeURIComponent(psid)}&select=id&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

// Xử lý 1 tin nhắn Messenger → RPC upsert_lead_from_messenger.
async function handleMessengerEvent(
  ev: MessengerEvent,
  pageId: string | null,
  supaUrl: string,
  serviceKey: string,
): Promise<boolean> {
  const psid = ev.sender?.id;
  const m = ev.message;
  if (!psid || !m || m.is_echo) return false; // echo = tin page tự gửi → bỏ qua

  const attachTypes = (m.attachments ?? []).map((a) => a.type || "file");
  const text = m.text?.trim() ||
    (attachTypes.length ? `[Đính kèm: ${attachTypes.join(", ")}]` : "");

  // PSID chưa có lead → lấy tên profile + tên trang TRƯỚC khi tạo, để thông báo
  // "Lead mới" (trigger bắn ngay trong RPC) mang tên thật thay vì "Khách Messenger".
  const pageToken = await pageTokenFor(pageId);
  let hoTen: string | null = null;
  let pageTen: string | null = null;
  if (pageToken && !(await psidHasLead(psid, supaUrl, serviceKey))) {
    hoTen = await fetchProfileName(psid, pageToken);
    if (pageId) pageTen = await fetchPageName(pageId, pageToken);
  }

  const res = await fetch(`${supaUrl}/rest/v1/rpc/upsert_lead_from_messenger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      p_psid: psid,
      p_message: text || null,
      p_mid: m.mid ?? null,
      p_ho_ten: hoTen,
      p_page_id: pageId,
      p_page_ten: pageTen,
    }),
  });
  if (!res.ok) {
    console.error(`RPC upsert_lead_from_messenger fail: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

serve(async (req) => {
  const url = new URL(req.url);

  // ── GET: Facebook verify webhook ──────────────────────────────────────────
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const verifyToken = Deno.env.get("FB_VERIFY_TOKEN");
    if (mode === "subscribe" && token && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ── POST: sự kiện page (leadgen + messages) ──────────────────────────────
  const rawBody = await req.text();

  // Verify chữ ký nếu có FB_APP_SECRET (khuyến nghị bật cho production).
  const appSecret = Deno.env.get("FB_APP_SECRET");
  if (appSecret) {
    const ok = await verifySignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret);
    if (!ok) {
      console.error("Chữ ký webhook FB không hợp lệ");
      return new Response("Invalid signature", { status: 401 });
    }
  }

  // Token chỉ BẮT BUỘC cho leadgen (fetch chi tiết); Messenger vẫn chạy được
  // không token (chỉ mất phần lấy tên profile) → không early-return ở đây.
  const pageToken = Deno.env.get("FB_PAGE_ACCESS_TOKEN");

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("OK", { status: 200 });
  }

  // Cấu trúc: { object:'page', entry:[{
  //   id: '<page_id>',                                           ← trang nhận sự kiện
  //   changes:[{ field:'leadgen', value:{ leadgen_id,... } }],   ← Lead Ads
  //   messaging:[{ sender:{id}, message:{mid,text,...} }],       ← Messenger
  // }] }
  const entries = (payload as {
    entry?: {
      id?: string;
      changes?: { field?: string; value?: { leadgen_id?: string } }[];
      messaging?: MessengerEvent[];
    }[];
  }).entry ?? [];

  const leadgenIds: string[] = [];
  const msgEvents: { ev: MessengerEvent; pageId: string | null }[] = [];
  for (const e of entries) {
    for (const c of e.changes ?? []) {
      if (c.field === "leadgen" && c.value?.leadgen_id) leadgenIds.push(c.value.leadgen_id);
    }
    for (const m of e.messaging ?? []) {
      if (m?.message && !m.message.is_echo && m.sender?.id) {
        msgEvents.push({ ev: m, pageId: e.id ?? null });
      }
    }
  }

  // ── Messenger ──
  if (msgEvents.length > 0) {
    const supaUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !serviceKey) {
      console.error("Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    } else {
      let mOk = 0, mFail = 0;
      for (const { ev, pageId } of msgEvents) {
        try {
          if (await handleMessengerEvent(ev, pageId, supaUrl, serviceKey)) mOk++;
          else mFail++;
        } catch (err) {
          console.error("Xử lý messenger event lỗi:", err);
          mFail++;
        }
      }
      console.log(`FB messenger: ${mOk} xử lý, ${mFail} lỗi/bỏ qua (tổng ${msgEvents.length})`);
    }
  }

  // ── Leadgen ──
  if (leadgenIds.length > 0) {
    if (!pageToken) {
      console.error("Thiếu FB_PAGE_ACCESS_TOKEN — bỏ qua leadgen");
    } else {
      let ok = 0, fail = 0;
      for (const id of leadgenIds) {
        try {
          const detail = await fetchLeadFields(id, pageToken);
          if (detail && (await createLead(detail.fields, detail.formName))) ok++;
          else fail++;
        } catch (err) {
          console.error(`Xử lý leadgen ${id} lỗi:`, err);
          fail++;
        }
      }
      console.log(`FB leadgen: ${ok} tạo, ${fail} lỗi/bỏ qua (tổng ${leadgenIds.length})`);
    }
  }

  // Luôn trả 200 để FB không retry (đã log lỗi để theo dõi).
  return new Response("OK", { status: 200 });
});
