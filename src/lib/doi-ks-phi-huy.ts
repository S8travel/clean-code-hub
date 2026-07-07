// Đổi khách sạn có phí hủy (guard ở Điều tour) — phần TÍNH TIỀN thuần.
//
// Bối cảnh: OP đổi KS của ngày ở Điều tour trong khi KS cũ ĐÃ có ĐNTT trả tiền.
// Luồng tách: KS cũ → dòng "KS ngoài tour [Phí hủy]" (giữ payment) + công nợ phần
// trả dư. Hàm này quyết định: phí hủy sau kẹp, phần hoàn/công nợ, và chia phí hủy
// về từng ĐNTT đã trả (pro-rata theo paidAmount) để allocation khớp 100%.

import { calcPhiHuySurplus } from "@/lib/phi-huy";
import { proRataInts } from "@/lib/pro-rata";

export interface DoiKsPaidDntt {
  dnttId: number;
  /** paid_amount từ view dntt_with_payment_status (số đã trả thực). */
  paidAmount: number;
}

export interface DoiKsPlan {
  /** Tổng đã trả của mọi ĐNTT KS cũ. */
  paidTotal: number;
  /** Phí hủy NCC giữ lại — đã kẹp [0, paidTotal]. */
  phiHuy: number;
  /** Phần ghi công nợ / hoàn = paidTotal − phiHuy. */
  refund: number;
  /** Chia phí hủy về từng ĐNTT (pro-rata theo paidAmount, tổng === phiHuy). */
  allocByDntt: { dnttId: number; soTien: number }[];
}

export function planDoiKsPhiHuy(opts: {
  paidByDntt: DoiKsPaidDntt[];
  phiHuyInput: number;
}): DoiKsPlan {
  const paids = opts.paidByDntt.map((d) => Math.max(0, Math.round(d.paidAmount || 0)));
  const paidTotal = paids.reduce((s, v) => s + v, 0);
  // sumActual=0: KS cũ không còn dùng — toàn bộ đã trả là "thừa" trừ phí hủy.
  const { phiHuy, refund } = calcPhiHuySurplus({
    sumActual: 0,
    sumPaid: paidTotal,
    phiHuy: opts.phiHuyInput,
  });
  const shares = phiHuy > 0 ? proRataInts(phiHuy, paids) : paids.map(() => 0);
  return {
    paidTotal,
    phiHuy,
    refund,
    allocByDntt: opts.paidByDntt.map((d, i) => ({ dnttId: d.dnttId, soTien: shares[i] ?? 0 })),
  };
}
