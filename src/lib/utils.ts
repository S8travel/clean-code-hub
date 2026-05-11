import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format số nguyên thành chuỗi có dấu chấm phân cách hàng nghìn (vi-VN).
 * "850000" → "850.000", "" → "", "abc850def" → "850".
 * Dùng cho input tiền — display khi không focus và sau khi user nhập.
 */
export function formatThousands(s: string | number): string {
  const digits = String(s).replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("vi-VN");
}

/** Parse chuỗi có dấu chấm (vi-VN format) hoặc raw digits về number. "850.000" → 850000. */
export function parseThousands(s: string): number {
  const digits = s.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

/**
 * Format số (có thể decimal) → vi-VN với "." thousand sep + "," decimal sep.
 * 1500.5 → "1.500,5", 1500 → "1.500", 0 → "".
 */
export function formatThousandsDec(value: number): string {
  if (!value) return "";
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 10 });
}

/**
 * Parse input string có thể chứa "." và "," (cả thousand sep và decimal sep).
 * Heuristic: separator cuối cùng có 1-2 ký tự đứng sau → decimal sep,
 *            các separator khác → thousand sep.
 *            Single separator + 3 ký tự sau → thousand sep (ambiguous case, default VN convention).
 *
 * "1.500"   → 1500 (thousand)        "150,5"   → 150.5 (decimal)
 * "1.500,5" → 1500.5                 "1500.5"  → 1500.5
 * "1,500"   → 1500 (thousand)        "150.5"   → 150.5
 */
export function parseThousandsDec(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.,]/g, "");
  if (!cleaned) return 0;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);

  if (lastSep === -1) {
    return Number(cleaned) || 0;
  }

  const afterSep = cleaned.slice(lastSep + 1);
  if (!/^\d+$/.test(afterSep)) {
    return Number(cleaned.replace(/[.,]/g, "")) || 0;
  }

  const otherSep = lastDot > lastComma ? lastComma : lastDot;
  if (afterSep.length === 3 && otherSep === -1) {
    // Single separator + 3 digits after → thousand sep (default)
    return Number(cleaned.replace(/[.,]/g, "")) || 0;
  }

  // Last separator is decimal; others are thousand sep
  const intPart = cleaned.slice(0, lastSep).replace(/[.,]/g, "") || "0";
  return parseFloat(`${intPart}.${afterSep}`) || 0;
}

/**
 * Chuẩn hóa chuỗi email: tách bởi dấu phẩy / chấm phẩy / khoảng trắng / xuống dòng
 * → trả về dạng "a@x.com, b@x.com" để dùng trong trường To của email
 */
// UTC-safe parse "yyyy-mm-dd" → Date instance ở UTC midnight (tránh timezone-shift bug)
function parseISODateUTC(yyyymmdd: string): Date | null {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Default deadline = service date − 7 days, moved back to Friday if it lands on Sat/Sun.
 */
export function getDefaultDeadline(serviceDate: string): string {
  if (!serviceDate) return "";
  try {
    const d = parseISODateUTC(serviceDate);
    if (!d) return "";
    d.setUTCDate(d.getUTCDate() - 7);
    const day = d.getUTCDay();
    if (day === 6) d.setUTCDate(d.getUTCDate() - 1);
    else if (day === 0) d.setUTCDate(d.getUTCDate() - 2);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/**
 * Blocks Saturday (6) and Sunday (0) by snapping to the previous Friday.
 */
export function blockWeekendDate(val: string): string {
  if (!val) return "";
  try {
    const d = parseISODateUTC(val);
    if (!d) return val;
    const day = d.getUTCDay();
    if (day === 6) d.setUTCDate(d.getUTCDate() - 1);
    else if (day === 0) d.setUTCDate(d.getUTCDate() - 2);
    return d.toISOString().slice(0, 10);
  } catch {
    return val;
  }
}

export function normalizeEmails(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .split(/[,;\s\n]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"))
    .join(", ");
}
