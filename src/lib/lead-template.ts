// Phase B — điền placeholder cho template lead. THUẦN.

export const TEMPLATE_PLACEHOLDERS = [
  "{{ten_khach}}", "{{sales_name}}", "{{diem_den}}",
  "{{so_khach}}", "{{ngay_di}}", "{{ngan_sach}}", "{{quote_link}}",
];

export interface TemplateCtx {
  ten_khach?: string | null;
  sales_name?: string | null;
  diem_den?: string | null;
  so_khach?: string | number | null;
  ngay_di?: string | null;
  ngan_sach?: string | number | null;
  quote_link?: string | null;
}

export function fillTemplate(text: string | null | undefined, ctx: TemplateCtx): string {
  if (!text) return "";
  const map: Record<string, string> = {
    ten_khach: String(ctx.ten_khach ?? ""),
    sales_name: String(ctx.sales_name ?? ""),
    diem_den: String(ctx.diem_den ?? ""),
    so_khach: ctx.so_khach != null ? String(ctx.so_khach) : "",
    ngay_di: String(ctx.ngay_di ?? ""),
    ngan_sach: ctx.ngan_sach != null && ctx.ngan_sach !== ""
      ? Number(ctx.ngan_sach).toLocaleString("vi-VN") + " ₫" : "",
    quote_link: String(ctx.quote_link ?? ""),
  };
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m));
}

// next-action channel → template channel
export function templateChannelOf(actionChannel: string): string | null {
  if (actionChannel === "call") return "call_script";
  if (actionChannel === "zalo") return "zalo";
  if (actionChannel === "email") return "email";
  return null; // meeting/note: không có template
}

export function htmlFromText(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#222;white-space:pre-wrap">${esc}</div>`;
}
