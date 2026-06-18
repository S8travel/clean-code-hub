import { useAuth } from "@/hooks/use-auth";
import { useDoanQuyetToanLockedSet } from "@/hooks/use-doan";
import { isDoanLocked } from "@/lib/doan-lock";

/**
 * true = đoàn bị khóa (KTT đã duyệt quyết toán HDV, admin CHƯA mở khóa) + user KHÔNG
 * phải admin. Dùng ở UI để disable mọi control sửa nghiệp vụ của đoàn.
 */
export function useDoanLocked(doanId?: number | null): boolean {
  const { user } = useAuth();
  const { data: lockedSet } = useDoanQuyetToanLockedSet();
  return isDoanLocked(user?.role ?? null, lockedSet ?? null, doanId ?? null);
}

/**
 * Trả về 1 hàm guard — gọi đầu mutationFn của các hook SỬA dữ liệu nghiệp vụ đoàn
 * (điều tour / booking / chi phí / số khách). Ném lỗi tiếng Việt nếu đoàn đã khóa và
 * user không phải admin. Lớp chặn thật (phủ mọi nguồn sửa trong app).
 * KHÔNG dùng cho luồng thanh toán (payment / duyệt / hủy ĐNTT) — vẫn cho tất toán.
 */
export function useDoanLockGuard() {
  const { user } = useAuth();
  const { data: lockedSet } = useDoanQuyetToanLockedSet();
  return (doanId?: number | null) => {
    if (isDoanLocked(user?.role ?? null, lockedSet ?? null, doanId ?? null)) {
      throw new Error(
        "Đoàn đã quyết toán (KTT đã duyệt) — đã khóa. Cần admin mở khóa mới sửa được.",
      );
    }
  };
}
