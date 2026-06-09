import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useDoanList } from "@/hooks/use-doan";

/**
 * Tập VP user được truy cập = `van_phong_ids ∪ {van_phong_id}` (VP nhà luôn nằm trong).
 * Khớp helper SQL `current_user_vp_scope()`. Rỗng → (non-cross) không thấy đoàn nào.
 */
export function resolveVpScope(
  vanPhongIds: number[] | null | undefined,
  vanPhongId: number | null | undefined,
): number[] {
  const ids = new Set<number>();
  for (const v of vanPhongIds ?? []) ids.add(v);
  if (vanPhongId != null) ids.add(vanPhongId);
  return [...ids];
}

/**
 * Đoàn có lọt filter VP (cho user non-cross) không. Khớp RLS: đoàn van_phong_id NULL
 * chỉ cross-VP thấy → non-cross luôn false.
 */
export function doanInVpScope(
  doanVanPhongId: number | null | undefined,
  vpScope: number[],
): boolean {
  return doanVanPhongId != null && vpScope.includes(doanVanPhongId);
}

/**
 * Scope phân quyền data của user — Phase 1 (client-side UX) + RLS tường cứng (DB).
 *
 * Rule chuẩn áp dụng MỌI trang:
 * - `role IN (admin, giam_doc)` → bypass mọi filter (xem hết)
 * - Khác (gồm cả KẾ TOÁN) → filter theo `phan_loai_tour` VÀ theo VĂN PHÒNG
 *   (`thi_truong IN phan_loai_tour` + `van_phong_id ∈ tập VP truy cập`).
 *   Kế toán xem nhiều VP → admin tích `van_phong_ids`. Bản ghi định kỳ (doan_id=null)
 *   vẫn giữ ở client (filterByDoanId) — RLS DB cho kế toán thấy.
 *
 * Tập VP truy cập (VP scope) = `van_phong_ids ∪ {van_phong_id}` (VP nhà luôn nằm trong).
 * Rỗng → (non-cross) không thấy đoàn nào cho tới khi admin gán VP.
 *
 * Cá nhân đặc biệt: set `phan_loai_tour=NULL` để bypass loại tour. Quyền xem nhiều VP
 * → admin tích `van_phong_ids` trong trang Người dùng.
 *
 * ⚠️ Filter client-side này CHỈ để UX. Enforce thật = RLS tường cứng theo VP ở DB
 * (migration 20260609_van_phong_hard_scope). Đừng coi đây là lớp bảo mật.
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
  // Cross-VP = bypass filter văn phòng. CHỈ admin/giám đốc (kế toán giờ cũng bị scope VP).
  const isCrossVp = isPrivileged;

  // Tập VP user được truy cập (khớp helper SQL current_user_vp_scope).
  const vpScope = useMemo<number[]>(
    () => resolveVpScope(user?.van_phong_ids, user?.van_phong_id),
    [user?.van_phong_ids, user?.van_phong_id],
  );

  // Fetch list đoàn user được xem (apply phan_loai_tour + VP ở useDoanList).
  // Hook này luôn enabled → các trang dùng useDoanScope sẽ cache chung query.
  const phanLoaiTour = isPrivileged ? null : (user?.phan_loai_tour ?? null);
  // Cross-VP → null (không filter VP); còn lại → tập VP truy cập.
  const vanPhongIds: number[] | null = isCrossVp ? null : vpScope;
  const { data: scopedDoanRows = [], isLoading } = useDoanList(
    phanLoaiTour,
    vanPhongIds,
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
        // VP filter (khớp RLS): non-cross chỉ thấy đoàn van_phong_id ∈ vpScope.
        // Đoàn van_phong_id NULL → RLS chỉ cho cross-VP, nên non-cross cũng ẩn.
        if (!isCrossVp && !doanInVpScope(d.van_phong_id, vpScope)) return false;
        if (phanLoaiTour && phanLoaiTour.length > 0) {
          // Fail-open: thi_truong NULL/rỗng (chưa phân loại) → vẫn hiện; chỉ ẩn khi
          // ĐÃ phân loại nhưng không thuộc scope của user.
          if (d.thi_truong && !phanLoaiTour.includes(d.thi_truong)) return false;
        }
        return true;
      });
    };
  }, [isPrivileged, isCrossVp, vpScope, phanLoaiTour]);

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
    isCrossVp,
    vpScope,
    vanPhongIds,
    phanLoaiTour,
    allowedDoanIds,
    filterDoan,
    filterByDoanId,
    isReady: !isLoading,
  };
}
