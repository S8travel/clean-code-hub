import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Chuẩn hóa chuỗi email: tách bởi dấu phẩy / chấm phẩy / khoảng trắng / xuống dòng
 * → trả về dạng "a@x.com, b@x.com" để dùng trong trường To của email
 */
/**
 * Default deadline = service date − 7 days, moved back to Friday if it lands on Sat/Sun.
 */
export function getDefaultDeadline(serviceDate: string): string {
  if (!serviceDate) return "";
  try {
    const d = new Date(serviceDate + "T00:00:00");
    d.setDate(d.getDate() - 7);
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() - 1);
    else if (day === 0) d.setDate(d.getDate() - 2);
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
    const d = new Date(val + "T00:00:00");
    const day = d.getDay();
    if (day === 6) d.setDate(d.getDate() - 1);
    else if (day === 0) d.setDate(d.getDate() - 2);
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
