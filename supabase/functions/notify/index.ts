// Edge Function notify - goi boi Database Webhook (AFTER INSERT). Xac thuc bang WEBHOOK_SECRET header.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "s8travel.op1.05@gmail.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "S8 Travel <onboarding@resend.dev>";
const SEND_CUSTOMER_COPY = (Deno.env.get("SEND_CUSTOMER_COPY") ?? "false") === "true";

const ALLOWED_TABLES = ["web_bookings", "contact_messages"] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function escapeHtml(s: unknown): string {
  return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return iso; }
}

async function fetchRow(table: AllowedTable, id: string): Promise<Record<string, unknown> | null> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=*`;
  const res = await fetch(url, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
  if (!res.ok) { console.error("[notify] doc ban ghi that bai:", res.status, await res.text()); return null; }
  const rows = (await res.json()) as Record<string, unknown>[];
  return rows[0] ?? null;
}

type Email = { to: string; subject: string; html: string; replyTo?: string };
type SendResult = { ok: boolean; status?: number; error?: string };

async function sendEmail({ to, subject, html, replyTo }: Email): Promise<SendResult> {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY chua dat" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) { const error = await res.text(); console.error("[notify] Resend loi:", res.status, error); return { ok: false, status: res.status, error }; }
  return { ok: true, status: res.status };
}

function row(label: string, value: unknown): string {
  return `<tr><td style="padding:6px 12px;color:#64748b;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 12px;color:#0f172a;font-weight:500">${escapeHtml(value)}</td></tr>`;
}

function wrap(title: string, bodyRows: string, intro: string): string {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto"><h2 style="color:#0f172a;margin:0 0 8px">${escapeHtml(title)}</h2><p style="color:#475569;margin:0 0 16px">${escapeHtml(intro)}</p><table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px;overflow:hidden">${bodyRows}</table><p style="color:#94a3b8;font-size:12px;margin-top:20px">Email tu dong tu website S8 Travel.</p></div>`;
}

function buildBookingEmails(r: Record<string, unknown>): { admin: Email; customer?: Email } {
  const adminRows = row("Tour", r.tour_title) + row("Khach hang", r.customer_name) + row("Email", r.customer_email) + row("Dien thoai", r.customer_phone || "-") + row("Ngay khoi hanh", formatDate(String(r.travel_date))) + row("So khach", r.guests) + (r.note ? row("Ghi chu", r.note) : "");
  const admin: Email = { to: ADMIN_EMAIL, subject: `[S8 Travel] Don dat tour moi: ${String(r.tour_title)}`, html: wrap("Don dat tour moi", adminRows, "Co khach vua dat tour tren website."), replyTo: String(r.customer_email) };
  let customer: Email | undefined;
  if (SEND_CUSTOMER_COPY && r.customer_email) {
    const custRows = row("Tour", r.tour_title) + row("Ngay khoi hanh", formatDate(String(r.travel_date))) + row("So khach", r.guests);
    customer = { to: String(r.customer_email), subject: `Da nhan yeu cau dat tour - ${String(r.tour_title)}`, html: wrap(`Cam on ${String(r.customer_name)}!`, custRows, "Chung toi da nhan yeu cau dat tour va se lien he lai som nhat.") };
  }
  return { admin, customer };
}

function buildContactEmails(r: Record<string, unknown>): { admin: Email; customer?: Email } {
  const adminRows = row("Ho ten", r.name) + row("Email", r.email) + (r.interest ? row("Quan tam", r.interest) : "") + row("Noi dung", r.message);
  const admin: Email = { to: ADMIN_EMAIL, subject: `[S8 Travel] Lien he moi tu ${String(r.name)}`, html: wrap("Tin lien he moi", adminRows, "Co khach vua gui lien he qua website."), replyTo: String(r.email) };
  let customer: Email | undefined;
  if (SEND_CUSTOMER_COPY && r.email) {
    customer = { to: String(r.email), subject: "Da nhan lien he cua quy khach - S8 Travel", html: wrap(`Cam on ${String(r.name)}!`, row("Noi dung", r.message), "Chung toi da nhan lien he va se phan hoi trong vong 24 gio.") };
  }
  return { admin, customer };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) return json({ ok: false, error: "unauthorized" }, 401);
  let payload: { table?: string; id?: string; record?: { id?: string } };
  try { payload = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, 400); }
  const table = payload.table;
  const id = payload.record?.id ?? payload.id;
  if (!table || !id || !ALLOWED_TABLES.includes(table as AllowedTable)) return json({ ok: false, error: "table/id khong hop le" }, 400);
  const record = await fetchRow(table as AllowedTable, id);
  if (!record) return json({ ok: false, error: "khong tim thay ban ghi" }, 404);
  const { admin, customer } = table === "web_bookings" ? buildBookingEmails(record) : buildContactEmails(record);
  const adminResult = await sendEmail(admin);
  const customerResult = customer ? await sendEmail(customer) : null;
  return json({ ok: true, to: ADMIN_EMAIL, from: FROM_EMAIL, adminResult, customerResult });
});
