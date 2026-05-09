import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
