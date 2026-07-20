/**
 * Chi phí của đoàn ĐÃ HỦY không phải khoản phải trả định kỳ.
 *
 * Bối cảnh: `useDinhKyChiPhiList` gom `doan_chi_phi` theo NCC × tháng trên TOÀN hệ
 * thống rồi tạo 1 ĐNTT gộp. Nó lọc `ks_huy`, `paid`, `cong_no/hoan_tien` — nhưng
 * KHÔNG lọc `doan.trang_thai='huy'`. Hậu quả: chi phí (vd bảo hiểm) của đoàn ĐÃ
 * HỦY vẫn hiện dưới NCC và bị cộng vào tổng cụm — kế toán bấm gộp là trả tiền cho
 * tour không bao giờ chạy.
 *
 * Vì sao ẩn chúng KHÔNG giấu mất tiền công ty đang nợ:
 *
 *  1. Cổng `checkDoanCancelable` cấm hủy đoàn khi còn ĐNTT sống → mọi dòng của
 *     đoàn đã hủy đều `so_tien_da_dntt = 0` (đã kiểm: đúng với toàn bộ dòng hiện có).
 *  2. Phí hủy KS được ghi thành dòng riêng LUÔN mang `ks_huy = true`
 *     (`use-doi-ks-phi-huy.ts`), mà query định kỳ vốn đã có `.eq("ks_huy", false)`
 *     → phí hủy chưa bao giờ đi qua màn này; nó được trả qua dải "Đã hủy" + công nợ.
 *
 * Dù vậy KHÔNG lọc mù theo `trang_thai='huy'`. Chốt thêm hai điều kiện tiền: chỉ
 * ẩn dòng chưa từng cam kết (`so_tien_da_dntt = 0`) và chưa từng trả
 * (`so_tien_da_tt = 0`). Nếu mai này Đợt C sinh khoản phí hủy ở cấp đoàn, dòng đó
 * có tiền → tự động KHÔNG bị ẩn, thay vì biến mất lặng lẽ.
 */
export interface DinhKyRowLite {
  doan_trang_thai: string | null;
  so_tien_da_dntt: number;
  so_tien_da_tt: number;
}

/** true = dòng này KHÔNG được gộp thanh toán định kỳ (ẩn khỏi màn). */
export function anKhoiDinhKy(r: DinhKyRowLite): boolean {
  return r.doan_trang_thai === "huy" && r.so_tien_da_dntt === 0 && r.so_tien_da_tt === 0;
}
