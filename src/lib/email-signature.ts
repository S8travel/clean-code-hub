// Chữ ký email cá nhân — dùng chung EmailPreviewModal (flow lẻ) + batch send.
// Storage: localStorage per máy (cùng key với use-email-signatures.ts).
// EmailPreviewModal khi mở tự áp chữ ký mặc định: body(html) + SIG_HR + sig.html
// → mail thật gửi đi là BODY-ONLY (không còn wrapper <html>). Batch phải làm y hệt
// để mail hàng loạt không mất chữ ký và không khác format flow lẻ.

export const SIG_HR = `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">`;

export function extractBody(fullHtml: string): string {
  const match = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1] : fullHtml;
}

/** Cắt chữ ký cũ (từ SIG_HR trở đi) để tránh chèn trùng. */
export function stripSig(html: string): string {
  const idx = html.indexOf(SIG_HR);
  return idx >= 0 ? html.slice(0, idx) : html;
}

const STORAGE_KEY = "s8_email_signatures";
const DEFAULT_KEY = "s8_email_signatures_default_id";

/** HTML chữ ký mặc định của user trên máy này — null nếu chưa đặt. */
export function getDefaultSignatureHtml(): string | null {
  try {
    const defaultId = localStorage.getItem(DEFAULT_KEY);
    if (!defaultId) return null;
    const sigs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as {
      id: string; html: string;
    }[];
    return sigs.find((s) => s.id === defaultId)?.html ?? null;
  } catch {
    return null;
  }
}

/**
 * Áp chữ ký mặc định vào mail (giống EmailPreviewModal lúc mở):
 * có sig → trả body + SIG_HR + sig (body-only); không có → trả nguyên fullHtml.
 */
export function applyDefaultSignature(fullHtml: string): string {
  const sig = getDefaultSignatureHtml();
  if (!sig) return fullHtml;
  return stripSig(extractBody(fullHtml)) + SIG_HR + sig;
}
