/**
 * Kỳ thanh toán của 1 dòng chi phí định kỳ.
 *
 * Mặc định trang Thanh toán định kỳ gom theo THÁNG NGÀY ĐI của đoàn. Nhưng NCC
 * (KS/xe) chỉ xuất hóa đơn khi đoàn KẾT THÚC → đoàn khởi hành 29/30 có hóa đơn
 * rơi sang tháng sau. `doan_chi_phi.ky_thanh_toan` (YYYY-MM) là override thủ
 * công cho kế toán đẩy dòng sang kỳ khác; NULL = dùng mặc định.
 *
 * Kỳ lưu TUYỆT ĐỐI (không phải offset) → đẩy nhiều lần không cộng dồn nhầm.
 */

/** Chưa xác định được kỳ (đoàn thiếu ngày đi) — mirror hằng cũ của page. */
export const KY_KHONG_RO = "khong_thang";

export interface KyThanhToanLite {
  /** Mốc mặc định: ngoai_tour_ci ?? doan.ngay_di (YYYY-MM-DD). */
  ngay_kh_di: string | null;
  /** Override kỳ (YYYY-MM) — NULL = theo mặc định. */
  ky_thanh_toan: string | null;
}

/** Kỳ đang hiệu lực của 1 dòng: override nếu có, không thì theo tháng ngày đi. */
export function kyHieuLuc(r: KyThanhToanLite): string {
  if (r.ky_thanh_toan) return r.ky_thanh_toan;
  if (!r.ngay_kh_di) return KY_KHONG_RO;
  return r.ngay_kh_di.slice(0, 7);
}

/** Kỳ mặc định (bỏ qua override) — để hiện "gốc: Tháng 6" khi dòng đã bị đẩy. */
export function kyMacDinh(r: Pick<KyThanhToanLite, "ngay_kh_di">): string {
  return r.ngay_kh_di ? r.ngay_kh_di.slice(0, 7) : KY_KHONG_RO;
}

/** true = dòng đang bị đẩy khỏi kỳ mặc định của nó. */
export function daDoiKy(r: KyThanhToanLite): boolean {
  return !!r.ky_thanh_toan && r.ky_thanh_toan !== kyMacDinh(r);
}

/** "2026-06" → "2026-07"; "2026-12" → "2027-01". Kỳ không rõ thì giữ nguyên. */
export function kyKeTiep(ky: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ky);
  if (!m) return ky;
  const nam = Number(m[1]);
  const thang = Number(m[2]);
  return thang === 12
    ? `${nam + 1}-01`
    : `${nam}-${String(thang + 1).padStart(2, "0")}`;
}

/** "2026-06" → "2026-05"; "2026-01" → "2025-12". */
export function kyTruocDo(ky: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ky);
  if (!m) return ky;
  const nam = Number(m[1]);
  const thang = Number(m[2]);
  return thang === 1
    ? `${nam - 1}-12`
    : `${nam}-${String(thang - 1).padStart(2, "0")}`;
}

/**
 * Được phép đổi kỳ hay không.
 *
 * CHẶN khi dòng đã có cam kết ĐNTT (`so_tien_da_dntt > 0`): ĐNTT gom tháng theo
 * chính các dòng nó allocate — đẩy dòng đi mà ĐNTT ở lại thì chi phí nằm kỳ này,
 * phiếu đề nghị của nó nằm kỳ kia → kế toán đối chiếu ra 2 cụm rời nhau.
 * Muốn đẩy thì hủy ĐNTT trước.
 */
export function coTheDoiKy(r: { so_tien_da_dntt: number }): boolean {
  return r.so_tien_da_dntt <= 0;
}

/** Kỳ nhỏ nhất trong tập (dùng xếp ĐNTT vào cụm tháng). KY_KHONG_RO xuống cuối. */
export function kyNhoNhat(kys: string[]): string | null {
  const hopLe = kys.filter((k) => k && k !== KY_KHONG_RO).sort();
  if (hopLe.length > 0) return hopLe[0];
  return kys.length > 0 ? KY_KHONG_RO : null;
}
