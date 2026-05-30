// Tip HDV — khách đóng tiền tip cho hướng dẫn viên.
//   tip (NDT) = số khách × số ngày tour × đơn giá (NDT/khách/ngày)
//   tip (VND) = tip (NDT) × tỷ giá
// Quy tắc nghiệp vụ:
//   - T/L (trưởng đoàn) KHÔNG đóng tip → mặc định trừ khỏi số khách.
//   - Đơn giá mặc định: có T/L = 150, không T/L = 300 (NDT/khách/ngày).
//   - Số ngày tính CẢ ngày đi lẫn ngày về (inclusive); tour trong ngày = 1.
// Tách riêng khỏi UI để test được và để 3 nơi dùng (TipSection điều tour,
// export chi phí Excel, quyết toán HDV) luôn ra cùng kết quả.

export const TIP_RATE_CO_TL = 150;
export const TIP_RATE_KHONG_TL = 300;

/** Đơn giá tip mặc định (NDT/khách/ngày) theo việc đoàn có trưởng đoàn hay không. */
export function defaultTipRate(soKhachTl: number): number {
  return soKhachTl > 0 ? TIP_RATE_CO_TL : TIP_RATE_KHONG_TL;
}

/** Số khách đóng tip mặc định = tổng khách − T/L (không âm). */
export function defaultTipSoKhach(soKhach: number, soKhachTl: number): number {
  return Math.max(0, soKhach - soKhachTl);
}

/**
 * Số ngày tour tính CẢ ngày đi lẫn ngày về (inclusive).
 * Trả 0 nếu thiếu / không parse được ngày; tour cùng ngày đi-về = 1.
 */
export function tipDaysInclusive(
  ngayDi: string | null | undefined,
  ngayVe: string | null | undefined,
): number {
  if (!ngayDi || !ngayVe) return 0;
  const s = new Date(String(ngayDi).slice(0, 10) + "T00:00:00").getTime();
  const e = new Date(String(ngayVe).slice(0, 10) + "T00:00:00").getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

/**
 * Có thu tip cho đoàn này không.
 * - `thuTip` = `doan.thu_tip`; mặc định TRUE khi null/undefined (chỉ tắt khi user
 *   bỏ tích "Thu tiền tip" ở Điều tour → thu_tip = false).
 * - Vẫn cần số khách & số ngày > 0 mới có tip để hiện.
 * Dùng chung cho UI (ChiPhiPhasThuSection) lẫn export Excel để khỏi lệch nhau.
 */
export function shouldCollectTip(
  thuTip: boolean | null | undefined,
  soKhach: number,
  soNgay: number,
): boolean {
  return (thuTip ?? true) && soKhach > 0 && soNgay > 0;
}

/** Tổng tip theo NDT (chưa quy đổi tỷ giá). */
export function calcTipNDT(input: { soKhach: number; soNgay: number; rate: number }): number {
  return input.soKhach * input.soNgay * input.rate;
}

/** Tổng tip quy ra VND = tip(NDT) × tỷ giá. */
export function calcTipVND(input: {
  soKhach: number;
  soNgay: number;
  rate: number;
  tyGia: number;
}): number {
  return calcTipNDT(input) * input.tyGia;
}
