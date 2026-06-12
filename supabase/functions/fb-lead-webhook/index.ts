// FB Lead Ads → CRM. Webhook nhận leadgen từ Facebook, fetch chi tiết qua Graph
// API rồi gọi RPC create_lead_from_form (đã có auto-assign round-robin + log).
//
// 2 mode:
//  - GET  : Facebook verify webhook (hub.mode/hub.verify_token/hub.challenge).
//  - POST : leadgen event → mỗi leadgen_id → GET graph → map field → tạo lead.
//
// Public-callable (FB gọi không có JWT) → đặt verify_jwt=false trong config.toml.
// Bảo vệ: (1) verify_token khi đăng ký; (2) chữ ký X-Hub-Signature-256 (nếu set
// FB_APP_SECRET); (3) fetch leadgen cần FB_PAGE_ACCESS_TOKEN hợp lệ → POST giả
// không lấy được data.
//
// Secrets cần set (supabase secrets):
//   FB_VERIFY_TOKEN        — chuỗi tự chọn, khớp với cấu hình webhook trên FB.
//   FB_PAGE_ACCESS_TOKEN   — long-lived Page Access Token (quyền leads_retrieval).
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

  // ── POST: leadgen event ───────────────────────────────────────────────────
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

  const pageToken = Deno.env.get("FB_PAGE_ACCESS_TOKEN");
  if (!pageToken) {
    console.error("Thiếu FB_PAGE_ACCESS_TOKEN");
    return new Response("OK", { status: 200 }); // 200 để FB không retry dồn
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("OK", { status: 200 });
  }

  // Cấu trúc: { object:'page', entry:[{ changes:[{ field:'leadgen', value:{ leadgen_id,... } }] }] }
  const entries = (payload as { entry?: { changes?: { field?: string; value?: { leadgen_id?: string } }[] }[] }).entry ?? [];
  const leadgenIds: string[] = [];
  for (const e of entries) {
    for (const c of e.changes ?? []) {
      if (c.field === "leadgen" && c.value?.leadgen_id) leadgenIds.push(c.value.leadgen_id);
    }
  }

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

  // Luôn trả 200 để FB không retry (đã log lỗi để theo dõi).
  return new Response("OK", { status: 200 });
});
