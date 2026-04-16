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

function isZhTW(): boolean {
  return document.cookie.includes("googtrans=/vi/zh-TW");
}

/** Returns correct text based on current language */
export function t(vi: string): string {
  if (isZhTW() && ZH_OVERRIDES[vi] !== undefined) {
    return ZH_OVERRIDES[vi];
  }
  return vi;
}
