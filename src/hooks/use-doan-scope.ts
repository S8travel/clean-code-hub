import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDoanList } from "@/hooks/use-doan";

/**
 * Scope phân quyền data của user — Phase 1 (client-side enforcement).
 *
 * Rule chuẩn áp dụng MỌI trang:
 * - `role IN (admin, giam_doc)` → bypass mọi filter (xem hết)
 * - Khác → chỉ filter theo `phan_loai_tour`
 *   (`NULL` = xem mọi loại; mảng = chỉ thấy `doan.thi_truong IN array`)
 *
 * Note: VP scope đã được gỡ — VP2 ↔ VP3 (và tương lai mọi VP) cross lẫn nhau.
 * Cột `van_phong_id` trên user_roles giờ chỉ để gắn nhãn VP user thuộc về
 * (vd auto-set khi tạo đoàn mới); KHÔNG dùng làm scope filter cho danh sách.
 *
 * Cá nhân đặc biệt: set `phan_loai_tour=NULL` trên user_roles để bypass.
 *
 * Cách dùng:
 *   const scope = useDoanScope();
 *   if (scope.isPrivileged) ... // admin/GD
 *   scope.filterDoan(list)       // lọc list đoàn fetch về
 *   scope.allowedDoanIds         // Set<number> — dùng để filter row có doan_id
 *   scope.isReady                // false khi đang load → skip query phụ thuộc
 */
export function useDoanScope() {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const isPrivileged = role === "admin" || role === "giam_doc";

  // Fetch list đoàn user được xem (apply phan_loai_tour ở useDoanList).
  // Hook này luôn enabled → các trang dùng useDoanScope sẽ cache chung query.
  const phanLoaiTour = isPrivileged ? null : (user?.phan_loai_tour ?? null);
  // VP filter đã bỏ — mọi user cross-VP.
  const vanPhongId: number | null = null;
  const { data: scopedDoanRows = [], isLoading } = useDoanList(
    phanLoaiTour,
    vanPhongId,
  );

  const allowedDoanIds = useMemo(() => {
    const s = new Set<number>();
    for (const d of scopedDoanRows) {
      if (typeof d.id === "number") s.add(d.id);
    }
    return s;
  }, [scopedDoanRows]);

  const filterDoan = useMemo(() => {
    return <T extends { van_phong_id?: number | null; thi_truong?: string | null }>(
      list: T[],
    ): T[] => {
      if (isPrivileged) return list;
      return list.filter((d) => {
        if (vanPhongId != null && d.van_phong_id !== vanPhongId) return false;
        if (phanLoaiTour && phanLoaiTour.length > 0) {
          // Fail-open: thi_truong NULL/rỗng (chưa phân loại) → vẫn hiện; chỉ ẩn khi
          // ĐÃ phân loại nhưng không thuộc scope của user.
          if (d.thi_truong && !phanLoaiTour.includes(d.thi_truong)) return false;
        }
        return true;
      });
    };
  }, [isPrivileged, vanPhongId, phanLoaiTour]);

  // Lọc list có field `doan_id`. Row có `doan_id=null` (vd ĐNTT định kỳ
  // gộp nhiều đoàn) → giữ lại vì không thuộc đoàn cụ thể nào.
  const filterByDoanId = useMemo(() => {
    return <T extends { doan_id?: number | null }>(list: T[]): T[] => {
      if (isPrivileged) return list;
      return list.filter((r) => r.doan_id == null || allowedDoanIds.has(r.doan_id));
    };
  }, [isPrivileged, allowedDoanIds]);

  return {
    isPrivileged,
    vanPhongId,
    phanLoaiTour,
    allowedDoanIds,
    filterDoan,
    filterByDoanId,
    isReady: !isLoading,
  };
}
