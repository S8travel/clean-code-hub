import { useAuth } from "@/hooks/use-auth";
import { useDoanQuyetToanPaidSet } from "@/hooks/use-doan";
import { isChiPhiLocked } from "@/lib/chi-phi-lock";

/**
 * true = chi phí của đoàn bị khóa (đã quyết toán + user KHÔNG phải admin).
 * Dùng ở UI để disable control sửa con số chi phí. Giữ nguyên luồng thanh toán.
 */
export function useChiPhiLocked(doanId?: number | null): boolean {
  const { user } = useAuth();
  const { data: qtPaidSet } = useDoanQuyetToanPaidSet();
  return isChiPhiLocked(user?.role ?? null, qtPaidSet ?? null, doanId ?? null);
}

/**
 * Trả về 1 hàm guard — gọi đầu mutationFn của các hook SỬA CON SỐ CHI PHÍ.
 * Ném lỗi tiếng Việt nếu đoàn đã quyết toán và user không phải admin.
 * Lớp chặn thật (phủ "mọi nguồn trong app": edit trực tiếp + cascade điều tour/rebooking/seri).
 */
export function useChiPhiLockGuard() {
  const { user } = useAuth();
  const { data: qtPaidSet } = useDoanQuyetToanPaidSet();
  return (doanId?: number | null) => {
    if (isChiPhiLocked(user?.role ?? null, qtPaidSet ?? null, doanId ?? null)) {
      throw new Error("Đoàn đã quyết toán — chi phí đã khóa. Chỉ admin mới sửa được.");
    }
  };
}
