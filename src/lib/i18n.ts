import { useEffect, useReducer } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Bảng dịch cứng: dùng cho các component gọi t()
// Key = tiếng Việt gốc, Value = tiếng Trung đúng
// ─────────────────────────────────────────────────────────────────────────────
const ZH_OVERRIDES: Record<string, string> = {
  "Lock Phòng": "鎖房",
  "Danh sách đoàn": "團表",
  "Người lớn": "大人",
  "Lớn": "大人",
};

// ─────────────────────────────────────────────────────────────────────────────
// Bảng sửa sau khi Google Translate dịch xong
// Key = chữ Google Translate dịch ra (sai), Value = chữ đúng cần thay vào
// Ví dụ: nếu GT dịch "Khách sạn" thành "旅館" nhưng bạn muốn "酒店":
//   "旅館": "酒店",
// ─────────────────────────────────────────────────────────────────────────────
export const ZH_CORRECTIONS: Record<string, string> = {
  // Thêm cặp sửa lỗi của bạn vào đây:
  // "bản dịch sai của GT": "bản dịch đúng bạn muốn",
   "更衣室": "鎖房",
   "參與者名單": "團表",
   "大的": "大人",
   "全部的": "總",
    "集團管理": "團體管理",
    "S8 旅行": "雙發旅行社",
    "S8旅行社": "雙發旅行社",
    "S8旅遊有限公司": "雙發旅遊有限公司",
};

export function isZhTW(): boolean {
  return document.cookie.includes("googtrans=/vi/zh-TW");
}

/** Dùng trong component gọi t() để bypass Google Translate */
export function t(vi: string): string {
  if (isZhTW() && ZH_OVERRIDES[vi] !== undefined) {
    return ZH_OVERRIDES[vi];
  }
  return vi;
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
  // Áp lần đầu ngay sau khi GT dịch xong (GT thường xong trong 1–2s)
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

export function notifyLanguageChange() {
  window.dispatchEvent(new Event(LANG_CHANGE_EVENT));
}

export function useTranslate() {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    window.addEventListener(LANG_CHANGE_EVENT, forceUpdate);
    return () => window.removeEventListener(LANG_CHANGE_EVENT, forceUpdate);
  }, []);
}
