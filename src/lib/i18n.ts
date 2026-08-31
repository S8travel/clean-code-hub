import { useEffect, useReducer } from "react";
import type { Locale } from "date-fns";
import { vi as viDate, enUS as enUSDate, zhTW as zhTWDate } from "date-fns/locale";
import zhTW from "@/locales/zh-TW.json";
import enUS from "@/locales/en.json";

// ─────────────────────────────────────────────────────────────────────────────
// i18n: KEY = chuỗi tiếng Việt gốc (natural key). Lookup synchronous từ
// src/locales/*.json. KHÔNG dùng i18next/react-i18next nữa và đã gỡ
// Google Translate widget (race condition + GT đoán sai từ "Loại xe" → "男友").
//
// 3 ngôn ngữ: vi (mặc định, không cookie) · zh-TW · en.
// Cookie `googtrans=/vi/<lang>` giữ tên cũ để backward-compat user session đã
// bật zh-TW từ trước.
//
// en.json là locale PARTIAL — chỉ phủ các màn cần cho App Review của Meta
// (sidebar, chuông, Lead). Key chưa dịch tự fallback về tiếng Việt.
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

const EN_MAP: Record<string, string> = enUS as Record<string, string>;

export type Lang = "vi" | "zh-TW" | "en";

/** Cookie tương ứng mỗi ngôn ngữ (vi = xoá cookie). */
export const LANG_COOKIE: Record<Exclude<Lang, "vi">, string> = {
  "zh-TW": "/vi/zh-TW",
  en: "/vi/en",
};

const ZH_COOKIE = `googtrans=${LANG_COOKIE["zh-TW"]}`;
const EN_COOKIE = `googtrans=${LANG_COOKIE.en}`;

/** Ngôn ngữ đang bật, đọc từ cookie. Không cookie → vi. */
export function getLang(): Lang {
  if (typeof document === "undefined") return "vi";
  const cookie = document.cookie;
  if (cookie.includes(ZH_COOKIE)) return "zh-TW";
  if (cookie.includes(EN_COOKIE)) return "en";
  return "vi";
}

export function isZhTW(): boolean {
  return getLang() === "zh-TW";
}

/**
 * Trả bản dịch theo ngôn ngữ đang bật (hoặc nguyên tiếng Việt nếu locale chưa
 * có key đó). Đồng bộ hoàn toàn.
 */
export function t(vi: string): string {
  switch (getLang()) {
    case "zh-TW":
      return ZH_MAP[vi] ?? vi;
    case "en":
      return EN_MAP[vi] ?? vi;
    default:
      return vi;
  }
}

/**
 * Locale date-fns tương ứng ngôn ngữ đang bật — cho `format` /
 * `formatDistanceToNow` (vd "2 giờ trước" ↔ "2 hours ago").
 */
export function getDateLocale(): Locale {
  switch (getLang()) {
    case "zh-TW":
      return zhTWDate;
    case "en":
      return enUSDate;
    default:
      return viDate;
  }
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
