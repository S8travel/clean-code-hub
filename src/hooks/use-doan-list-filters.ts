import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const STORAGE_KEY = "doan_list_filters_v1";

export const DOAN_LIST_DEFAULTS = {
  search: "",
  dateFrom: "",
  dateTo: "",
  agentFilter: "all",
  diaDiemFilter: "all",
  trangThaiFilter: "all",
  loaiTourFilter: "all",
  xeFilter: "all",
  page: "1",
  pageSize: "5",
  sortKey: "ngay_di",
  sortDir: "asc",
} as const;

export type DoanListFilterKey = keyof typeof DOAN_LIST_DEFAULTS;

/**
 * Hybrid persistence: URL query params (primary) + sessionStorage (fallback).
 * - Khi mount: URL trống → restore từ sessionStorage → push vào URL.
 * - Mỗi lần set: update URL (replace, không pollute history) + sync sessionStorage.
 * - Defaults bị omit khỏi URL để URL ngắn gọn.
 */
export function useDoanListFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Mount: restore từ sessionStorage nếu URL trống
  useEffect(() => {
    if (searchParams.toString() !== "") return;
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (!cached) return;
      const obj = JSON.parse(cached) as Record<string, string>;
      const next = new URLSearchParams();
      Object.entries(obj).forEach(([k, v]) => {
        const def = DOAN_LIST_DEFAULTS[k as DoanListFilterKey];
        if (v && def !== undefined && v !== def) next.set(k, String(v));
      });
      if (next.toString()) setSearchParams(next, { replace: true });
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const get = (k: DoanListFilterKey): string => searchParams.get(k) ?? DOAN_LIST_DEFAULTS[k];

  const set = (updates: Partial<Record<DoanListFilterKey, string>>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      (Object.entries(updates) as [DoanListFilterKey, string | undefined][]).forEach(([k, v]) => {
        if (v == null || v === "" || v === DOAN_LIST_DEFAULTS[k]) {
          next.delete(k);
        } else {
          next.set(k, v);
        }
      });
      try {
        const obj: Record<string, string> = {};
        next.forEach((v, k) => { obj[k] = v; });
        if (Object.keys(obj).length === 0) {
          sessionStorage.removeItem(STORAGE_KEY);
        } else {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
        }
      } catch {
        // ignore
      }
      return next;
    }, { replace: true });
  };

  const clear = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  return { get, set, clear };
}
