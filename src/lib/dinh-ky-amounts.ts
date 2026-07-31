/**
 * Số tiền phải trả NCC cho 1 dòng chi phí trong luồng Thanh toán định kỳ.
 *
 * GOTCHA FOC: `doan_chi_phi.thanh_tien` là generated = đơn_giá × số_lượng — CHƯA
 * trừ FOC. Với dòng khách sạn / nhà hàng có FOC, số công ty thực trả NCC là
 * `tien_cong_ty = (so_luong − foc_count) × gia_phong` (đã trừ phòng/suất miễn).
 * Dùng `thanh_tien` làm base → đề nghị & trả DƯ đúng phần FOC cho NCC.
 *
 * `thanh_tien_thuc_te` (nếu có) là số thực tế công ty phải trả sau điều chỉnh —
 * cùng thang "net" với `tien_cong_ty` — nên override trực tiếp.
 */
export interface ChiPhiNetLite {
  tien_cong_ty: number;
  thanh_tien_thuc_te: number | null;
}

/** Số công ty phải trả NCC cho 1 dòng chi phí (đã trừ FOC; override = thanh_tien_thuc_te). */
export function netPhaiTra(r: ChiPhiNetLite): number {
  return r.thanh_tien_thuc_te ?? r.tien_cong_ty;
}
