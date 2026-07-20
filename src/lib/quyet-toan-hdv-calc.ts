// Quyết toán HDV (form S8 BM02.1-20).
//   Tổng thu = tạm ứng + thu trách nhiệm + tip + đầu khách + quỹ VP + bán OP + khác
//   Còn phải thanh toán = tổng HDV chi − tổng thu
//     > 0  → công ty còn phải trả HDV
//     < 0  → HDV phải hoàn lại công ty (thu hồi)
// Tách riêng khỏi UI/export để CreateHDVPaymentModal và export-hdv-quyet-toan-excel
// dùng chung một công thức (tránh lệch số giữa màn hình và file in).

import { calcTipVND } from "./tip-calc";

export interface QuyetToanHDVInput {
  tamUng: number;
  thuTrachNhiem: number;
  /**
   * Tip: số khách × đơn giá NDT/khách/ngày × số ngày × tỷ giá → VND.
   * `tongNT` (tuỳ chọn) = tổng tip theo đơn vị gốc khi đoàn dùng tip KHOÁN
   * (`doan.tip_lump_sum`) — khi đó công thức nhân không tái tạo được số của bảng
   * Phải thu, phải lấy thẳng tổng khoán × tỷ giá.
   */
  tip: { soKhach: number; donGiaNT: number; soNgay: number; tyGia: number; tongNT?: number | null };
  dauKhach: { soKhach: number; donGia: number };
  quyVp: { soLuong: number; donGia: number };
  thuBanOp: number;
  thuKhac: number;
  tongHdvChi: number;
}

export interface QuyetToanHDVResult {
  thuTipVnd: number;
  thuDauKhachVnd: number;
  thuQuyVpVnd: number;
  tongThu: number;
  /** > 0: công ty còn phải trả HDV; < 0: HDV phải hoàn lại công ty. */
  conPhaiThanhToan: number;
}

/**
 * VND không có đơn vị lẻ → mọi số tiền quyết toán phải là SỐ NGUYÊN.
 *
 * `tongHdvChi` cộng từ các dòng chi phí vốn có phần thập phân (pro-rata, chiết khấu,
 * FOC…), nên nếu không làm tròn thì `conPhaiThanhToan` ra kiểu 4044499.879999999 →
 * ô "Số tiền ĐNTT" (auto-sync từ số này) đẻ ra ĐNTT lẻ thập phân, kế toán phải sửa
 * tay từng phiếu (OP báo 22/07/2026).
 *
 * Làm tròn TỪNG khoản rồi mới cộng — KHÔNG cộng thô xong mới tròn — để các dòng hiện
 * trên form/Excel cộng lại đúng bằng dòng tổng (tròn sau sẽ lệch 1đ so với mắt nhìn).
 */
const vnd = (n: number): number => Math.round(n);

export function calcQuyetToanHDV(i: QuyetToanHDVInput): QuyetToanHDVResult {
  // Tip khoán (tip_lump_sum): tổng gốc KHÔNG bằng soKhach × soNgay × đơn giá.
  // Ưu tiên tổng khoán để số quyết toán khớp bảng Phải thu. Tip bị tắt (soKhach=0)
  // thì không thu, kể cả đoàn có tip khoán.
  const thuTipVnd = vnd(
    i.tip.tongNT != null && i.tip.soKhach > 0
      ? i.tip.tongNT * i.tip.tyGia
      : calcTipVND({
          soKhach: i.tip.soKhach,
          soNgay: i.tip.soNgay,
          rate: i.tip.donGiaNT,
          tyGia: i.tip.tyGia,
        }),
  );
  const thuDauKhachVnd = vnd(i.dauKhach.soKhach * i.dauKhach.donGia);
  const thuQuyVpVnd = vnd(i.quyVp.soLuong * i.quyVp.donGia);
  const tongThu =
    vnd(i.tamUng) + vnd(i.thuTrachNhiem) + thuTipVnd + thuDauKhachVnd + thuQuyVpVnd +
    vnd(i.thuBanOp) + vnd(i.thuKhac);
  const conPhaiThanhToan = vnd(i.tongHdvChi) - tongThu;
  return { thuTipVnd, thuDauKhachVnd, thuQuyVpVnd, tongThu, conPhaiThanhToan };
}
