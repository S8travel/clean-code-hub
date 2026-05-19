import { useEffect, useReducer } from "react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import zhTW from "@/locales/zh-TW.json";

// ─────────────────────────────────────────────────────────────────────────────
// i18n: react-i18next, KEY = chuỗi tiếng Việt gốc (natural key).
// Bản dịch zh-TW nằm ở src/locales/zh-TW.json (sửa value để chỉnh).
// GT (Google Translate) GIỮ làm fallback TẠM trong lúc di trú: chuỗi đã t()
// dùng bản chuẩn từ i18next; chuỗi CHƯA wrap thì GT vẫn dịch như cũ.
// ─────────────────────────────────────────────────────────────────────────────

// ZH_OVERRIDES cũ — gộp vào resource zh-TW để giữ tương thích hành vi cũ.
const ZH_OVERRIDES: Record<string, string> = {
  "Lock Phòng": "鎖房",
  "Danh sách đoàn": "團表",
  "Người lớn": "大人",
  "Lớn": "大人",
};

// ─────────────────────────────────────────────────────────────────────────────
// Bảng sửa SAU khi Google Translate dịch (fallback tạm). Key = chữ GT dịch
// sai, Value = chữ đúng. MutationObserver quét text node thay lại.
// ─────────────────────────────────────────────────────────────────────────────
export const ZH_CORRECTIONS: Record<string, string> = {
  "更衣室": "鎖房",
  "參與者名單": "團表",
  "大的": "大人",
  "全部的": "總",
  "集團管理": "團體管理",
  "S8 旅行": "雙發旅行社",
  "S8旅行社": "雙發旅行社",
  "S8旅遊有限公司": "雙發旅遊有限公司",
  "城市青年聯盟": "成團",
  "程式碼": "團號",
};

export function isZhTW(): boolean {
  return typeof document !== "undefined" && document.cookie.includes("googtrans=/vi/zh-TW");
}

// ── Khởi tạo i18next (1 lần) ────────────────────────────────────────────────
if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources: {
      "zh-TW": { translation: { ...ZH_OVERRIDES, ...(zhTW as Record<string, string>) } },
    },
    lng: isZhTW() ? "zh-TW" : "vi",
    fallbackLng: "vi",
    keySeparator: false,   // key có "." vẫn là 1 key phẳng
    nsSeparator: false,    // key có ":" vẫn là 1 key phẳng
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  });
}

/**
 * Giữ API cũ: đang ở zh-TW → trả bản dịch (hoặc nguyên VN nếu chưa có trong
 * zh-TW.json); ngược lại trả nguyên tiếng Việt.
 */
export function t(vi: string): string {
  if (!isZhTW()) return vi;
  const tr = i18next.t(vi, { defaultValue: vi }) as string;
  return tr || vi;
}

/** Quét toàn bộ text nodes trong DOM và áp dụng ZH_CORRECTIONS */
function applyCorrectionsToNode(root: Node) {
  if (Object.keys(ZH_CORRECTIONS).length === 0) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node as Text);
    node = walker.nextNode();
  }
  for (const textNode of nodes) {
    const original = textNode.nodeValue ?? "";
    let updated = original;
    for (const [wrong, correct] of Object.entries(ZH_CORRECTIONS)) {
      if (updated.includes(wrong)) {
        updated = updated.split(wrong).join(correct);
      }
    }
    if (updated !== original) {
      textNode.nodeValue = updated;
    }
  }
}

let correctionObserver: MutationObserver | null = null;

/**
 * Bắt đầu theo dõi DOM — mỗi khi GT thêm/sửa text, tự động áp lại corrections.
 * Gọi sau khi kích hoạt Google Translate.
 */
export function startZhCorrectionObserver() {
  if (correctionObserver) return;
  setTimeout(() => applyCorrectionsToNode(document.body), 1500);
  setTimeout(() => applyCorrectionsToNode(document.body), 3000);

  correctionObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "characterData") {
        applyCorrectionsToNode(m.target);
      } else {
        m.addedNodes.forEach((n) => applyCorrectionsToNode(n));
      }
    }
  });
  correctionObserver.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
}

/** Dừng observer khi quay về tiếng Việt */
export function stopZhCorrectionObserver() {
  correctionObserver?.disconnect();
  correctionObserver = null;
}

const LANG_CHANGE_EVENT = "app:languagechange";

/**
 * Đồng bộ i18next theo trạng thái GT cookie (single source = cookie) rồi
 * báo các component re-render. Toggle ở AppSidebar đã gọi hàm này sẵn.
 */
export function notifyLanguageChange() {
  const lng = isZhTW() ? "zh-TW" : "vi";
  if (i18next.language !== lng) void i18next.changeLanguage(lng);
  window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
}

export function useTranslate() {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const onChange = () => forceUpdate();
    window.addEventListener(LANG_CHANGE_EVENT, onChange);
    i18next.on("languageChanged", onChange);
    return () => {
      window.removeEventListener(LANG_CHANGE_EVENT, onChange);
      i18next.off("languageChanged", onChange);
    };
  }, []);
}

export default i18next;
