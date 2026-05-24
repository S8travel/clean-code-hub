import { useEffect, useReducer } from "react";
import zhTW from "@/locales/zh-TW.json";

// ─────────────────────────────────────────────────────────────────────────────
// i18n: KEY = chuỗi tiếng Việt gốc (natural key). Lookup synchronous từ
// src/locales/zh-TW.json. KHÔNG dùng i18next/react-i18next nữa và đã gỡ
// Google Translate widget (race condition + GT đoán sai từ "Loại xe" → "男友").
//
// Cookie `googtrans=/vi/zh-TW` giữ tên cũ để backward-compat user session đã
// bật zh-TW từ trước.
// ─────────────────────────────────────────────────────────────────────────────

// ZH_OVERRIDES cũ — gộp với zh-TW.json (override thắng nếu cùng key).
const ZH_OVERRIDES: Record<string, string> = {
  "Lock Phòng": "鎖房",
  "Danh sách đoàn": "團表",
  "Người lớn": "大人",
  "Lớn": "大人",
};

// Map cuối: zh-TW.json + ZH_OVERRIDES (override thắng).
const ZH_MAP: Record<string, string> = {
  ...(zhTW as Record<string, string>),
  ...ZH_OVERRIDES,
};

const ZH_COOKIE = "googtrans=/vi/zh-TW";

export function isZhTW(): boolean {
  return typeof document !== "undefined" && document.cookie.includes(ZH_COOKIE);
}

/**
 * Đang ở zh-TW → trả bản dịch (hoặc nguyên VN nếu chưa có trong zh-TW.json).
 * Ngược lại trả nguyên tiếng Việt. Đồng bộ hoàn toàn.
 */
export function t(vi: string): string {
  if (!isZhTW()) return vi;
  return ZH_MAP[vi] ?? vi;
}

const LANG_CHANGE_EVENT = "app:languagechange";

/**
 * Báo các component re-render sau khi cookie đổi.
 * Toggle ở AppSidebar gọi hàm này sau khi set/clear cookie.
 */
export function notifyLanguageChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
  }
}

export function useTranslate(): void {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const onChange = () => forceUpdate();
    window.addEventListener(LANG_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, onChange);
  }, []);
}
