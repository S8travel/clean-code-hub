import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

const STORAGE_KEY = "bao_gia_list_filters_v1";

export const BAO_GIA_LIST_DEFAULTS = {
  q: "",
  tt: "",
  loai: "",
  agent: "",
  tu: "",
  den: "",
} as const;

export type BaoGiaListFilterKey = keyof typeof BAO_GIA_LIST_DEFAULTS;

const KEYS = Object.keys(BAO_GIA_LIST_DEFAULTS) as BaoGiaListFilterKey[];

/** Ghi bộ lọc vào bộ nhớ tạm.
 *
 *  CHỈ gọi từ `set` / `clear` — tức đúng lúc NGƯỜI DÙNG đổi bộ lọc. Tuyệt đối
 *  không ghi theo mọi lần URL đổi: bấm chuông (mở /bao-gia?tab=yeu-cau) hay bấm
 *  mục "Báo Giá" ở menu trái đều đổi URL mà KHÔNG dựng lại trang, lúc đó URL
 *  không còn key lọc nào → sẽ xoá mất bộ lọc vừa đặt.
 *
 *  Gọi bên trong updater của setSearchParams là cố ý: nó bảo đảm luôn ghi đúng
 *  URL cuối cùng. React có thể gọi updater hai lần ở chế độ Strict, nhưng ghi
 *  cùng một giá trị hai lần thì vô hại. */
function luuTam(sp: URLSearchParams) {
  try {
    const obj: Record<string, string> = {};
    KEYS.forEach((k) => { const v = sp.get(k); if (v) obj[k] = v; });
    if (Object.keys(obj).length === 0) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Trình duyệt chặn storage (cửa sổ ẩn danh) — mất bộ nhớ tạm thôi, không sao.
  }
}

/**
 * Giữ bộ lọc danh sách báo giá qua URL (chính) + sessionStorage (dự phòng) —
 * cùng lối với `useDoanListFilters` của danh sách đoàn.
 *
 * Vì sao phải có: việc chính của trang này là lọc còn vài dòng rồi mở lần lượt
 * từng cái. Riêng URL không đủ, vì nút "← Quay lại danh sách" ở trang chi tiết
 * đẩy về `/bao-gia` TRỐNG param — không có sessionStorage là mất bộ lọc.
 */
export function useBaoGiaListFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const daKhoiPhuc = useRef(false);

  // Mount: lấy lại bộ lọc lần trước nếu URL chưa mang sẵn cái nào.
  useEffect(() => {
    if (daKhoiPhuc.current) return;
    daKhoiPhuc.current = true;
    // CHỈ xét các key lọc, KHÔNG xét "URL có param hay không": chuông mở
    // /bao-gia?tab=yeu-cau là URL có param nhưng không có bộ lọc nào — vẫn phải khôi phục.
    if (KEYS.some((k) => searchParams.has(k))) return;
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (!cached) return;
      const obj = JSON.parse(cached) as Record<string, string>;
      const next = new URLSearchParams(searchParams); // giữ nguyên tab đang mở
      let coGi = false;
      KEYS.forEach((k) => {
        const v = obj[k];
        if (v && v !== BAO_GIA_LIST_DEFAULTS[k]) { next.set(k, v); coGi = true; }
      });
      if (coGi) setSearchParams(next, { replace: true });
    } catch {
      // Bộ nhớ tạm hỏng / bị chặn — coi như không có bộ lọc cũ.
    }
  }, [searchParams, setSearchParams]);

  const get = (k: BaoGiaListFilterKey): string => searchParams.get(k) ?? BAO_GIA_LIST_DEFAULTS[k];

  const set = (updates: Partial<Record<BaoGiaListFilterKey, string>>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      (Object.entries(updates) as [BaoGiaListFilterKey, string | undefined][]).forEach(([k, v]) => {
        if (v == null || v === "" || v === BAO_GIA_LIST_DEFAULTS[k]) next.delete(k);
        else next.set(k, v);
      });
      luuTam(next);
      return next;
    }, { replace: true });
  };

  const clear = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      // CHỈ xoá các key lọc. Xoá sạch sẽ cuốn theo cả ?tab=yeu-cau, người đang
      // đứng ở tab khác sẽ bị đá ngược về tab đầu.
      KEYS.forEach((k) => next.delete(k));
      luuTam(next);
      return next;
    }, { replace: true });
  };

  return { get, set, clear };
}
