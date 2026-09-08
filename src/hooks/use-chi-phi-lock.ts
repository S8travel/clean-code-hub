import { useAuth } from "@/hooks/use-auth";
import { useDoanQuyetToanPaidSet } from "@/hooks/use-doan";
import { isChiPhiLocked } from "@/lib/chi-phi-lock";

/**
 * true = chi phí của đoàn bị khóa (đã quyết toán + user KHÔNG phải admin).
 * Dùng ở UI để disable control sửa con số chi phí. Giữ nguyên luồng thanh toán.
 *
 * `danhMuc`: truyền 'bao_hiem' để hỏi riêng mục bảo hiểm — người được đánh dấu
 * phụ trách bảo hiểm (user_roles.phu_trach_bao_hiem) vẫn sửa được mục đó sau
 * quyết toán, vì số bảo hiểm (thanh toán định kỳ) thường về muộn hơn quyết toán.
 */
export function useChiPhiLocked(doanId?: number | null, danhMuc?: string | null): boolean {
  const { user } = useAuth();
  const { data: qtPaidSet } = useDoanQuyetToanPaidSet();
  return isChiPhiLocked(user?.role ?? null, qtPaidSet ?? null, doanId ?? null, {
    danhMuc,
    phuTrachBaoHiem: user?.phu_trach_bao_hiem,
  });
}

/**
 * Trả về 1 hàm guard — gọi đầu mutationFn của các hook SỬA CON SỐ CHI PHÍ.
 * Ném lỗi tiếng Việt nếu đoàn đã quyết toán và user không phải admin.
 * Lớp chặn thật (phủ "mọi nguồn trong app": edit trực tiếp + cascade điều tour/rebooking/seri).
 *
 * Chỗ gọi truyền `danhMuc` khi biết chắc dòng đang sửa thuộc mục nào. Không
 * truyền (vd cascade đụng nhiều mục cùng lúc) → khóa như cũ, không có ngoại lệ.
 */
export function useChiPhiLockGuard() {
  const { user } = useAuth();
  const { data: qtPaidSet } = useDoanQuyetToanPaidSet();
  return (doanId?: number | null, danhMuc?: string | null) => {
    if (
      isChiPhiLocked(user?.role ?? null, qtPaidSet ?? null, doanId ?? null, {
        danhMuc,
        phuTrachBaoHiem: user?.phu_trach_bao_hiem,
      })
    ) {
      throw new Error("Đoàn đã quyết toán — chi phí đã khóa. Chỉ admin mới sửa được.");
    }
  };
}
