// Tính tiền chi phí xe có VAT.
//
// Pattern (giống Visa với don_gia_raw): OP nhập đơn giá CHƯA VAT (don_gia_raw) + % VAT.
// don_gia lưu DB = giá ĐÃ gồm VAT (làm tròn / đơn vị) → thanh_tien (generated =
// don_gia*so_luong) tự gồm VAT → dashboard/Sheet (SUM thanh_tien) khớp với tổng
// trong tab (SUM tien_cong_ty). don_gia_raw giữ giá gốc cho ô nhập UI.

/** % VAT mặc định cho dòng xe mới (dòng cũ giữ 0 = không đổi tiền). */
export const XE_VAT_DEFAULT = 8;

/** Đơn giá đã gồm VAT cho 1 đơn vị (làm tròn về số nguyên đồng). */
export function applyVat(donGiaRaw: number, vatPct: number): number {
  const raw = Math.max(0, Number(donGiaRaw) || 0);
  const vat = Math.max(0, Number(vatPct) || 0);
  return Math.round(raw * (1 + vat / 100));
}

/** Thành tiền = đơn giá (đã VAT) × số lượng. */
export function calcXeThanhTien(soLuong: number, donGiaRaw: number, vatPct: number): number {
  const sl = Math.max(0, Number(soLuong) || 0);
  return applyVat(donGiaRaw, vatPct) * sl;
}
