// Phí hủy dịch vụ (NCC giữ lại) khi XỬ LÝ CHÊNH LỆCH THỪA (đã trả > thực tế).
// Dùng chung cho aggregate-commit của KS / NH / DV (nhánh delta < 0).
//
// Bối cảnh: dịch vụ bị hủy/giảm sau khi đã thanh toán. NCC giữ lại 1 phần làm
// phí hủy (charge), hoàn/ghi công nợ phần còn lại. Trước đây modal chỉ ghi
// công nợ TOÀN BỘ phần thừa → không đặt được phí hủy một phần.
//
//   absDelta = đã trả − thực tế cũ           (phần NCC đang giữ)
//   phiHuy   = NCC giữ lại làm phí hủy        (0 ≤ phiHuy ≤ absDelta)
//   refund   = absDelta − phiHuy              (ghi công nợ / hoàn tiền)
//   newActual= thực tế cũ + phiHuy            (chi phí thực tế MỚI, ghi thanh_tien_thuc_te)
//
// Kiểm chứng: đã trả − refund = thực tế cũ + phiHuy = newActual (net khớp thực tế).

export interface PhiHuyResult {
  /** Phí hủy đã kẹp trong [0, absDelta]. */
  phiHuy: number;
  /** Phần ghi công nợ / hoàn tiền (đã trừ phí hủy). */
  refund: number;
  /** Chi phí thực tế mới = thực tế cũ + phí hủy. */
  newActual: number;
  /** Phần thừa gốc = đã trả − thực tế cũ. */
  absDelta: number;
}

export function calcPhiHuySurplus(opts: {
  sumActual: number;
  sumPaid: number;
  phiHuy: number;
}): PhiHuyResult {
  const absDelta = Math.max(0, Math.round(opts.sumPaid - opts.sumActual));
  const phiHuy = Math.max(0, Math.min(Math.round(opts.phiHuy || 0), absDelta));
  return {
    phiHuy,
    refund: absDelta - phiHuy,
    newActual: Math.round(opts.sumActual) + phiHuy,
    absDelta,
  };
}
