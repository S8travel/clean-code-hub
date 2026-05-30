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
  /** Tip: số khách × đơn giá NDT/khách/ngày × số ngày × tỷ giá → VND. */
  tip: { soKhach: number; donGiaNT: number; soNgay: number; tyGia: number };
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

export function calcQuyetToanHDV(i: QuyetToanHDVInput): QuyetToanHDVResult {
  const thuTipVnd = calcTipVND({
    soKhach: i.tip.soKhach,
    soNgay: i.tip.soNgay,
    rate: i.tip.donGiaNT,
    tyGia: i.tip.tyGia,
  });
  const thuDauKhachVnd = i.dauKhach.soKhach * i.dauKhach.donGia;
  const thuQuyVpVnd = i.quyVp.soLuong * i.quyVp.donGia;
  const tongThu =
    i.tamUng + i.thuTrachNhiem + thuTipVnd + thuDauKhachVnd + thuQuyVpVnd + i.thuBanOp + i.thuKhac;
  const conPhaiThanhToan = i.tongHdvChi - tongThu;
  return { thuTipVnd, thuDauKhachVnd, thuQuyVpVnd, tongThu, conPhaiThanhToan };
}
