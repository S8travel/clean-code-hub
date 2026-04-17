import { useEffect, useReducer } from "react";

/**
 * Override translations for strings that Google Translate gets wrong.
 * Key = Vietnamese string, Value = correct Traditional Chinese.
 */
const ZH_OVERRIDES: Record<string, string> = {
  "Lock Phòng": "鎖房",
  "Danh sách đoàn": "團表",
  "Người lớn": "大人",
  "Lớn": "大人",
};

export function isZhTW(): boolean {
  return document.cookie.includes("googtrans=/vi/zh-TW");
}

/** Returns correct text based on current language */
export function t(vi: string): string {
  if (isZhTW() && ZH_OVERRIDES[vi] !== undefined) {
    return ZH_OVERRIDES[vi];
  }
  return vi;
}

const LANG_CHANGE_EVENT = "app:languagechange";

/** Fire this after changing language so components using t() re-render */
export function notifyLanguageChange() {
  window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
}

/** Use in any component that calls t() to auto-update on language switch */
export function useTranslate() {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    window.addEventListener(LANG_CHANGE_EVENT, forceUpdate);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, forceUpdate);
  }, []);
}
