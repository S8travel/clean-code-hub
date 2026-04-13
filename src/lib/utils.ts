import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Chuẩn hóa chuỗi email: tách bởi dấu phẩy / chấm phẩy / khoảng trắng / xuống dòng
 * → trả về dạng "a@x.com, b@x.com" để dùng trong trường To của email
 */
export function normalizeEmails(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .split(/[,;\s\n]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"))
    .join(", ");
}
