/** Tỷ giá mặc định cho báo giá.
 *
 *  Hai thứ KHÁC NHAU, đừng gộp:
 *  - TY_GIA_BAO_GIA_MAC_DINH: hằng số dự phòng trong code. Chỉ dùng khi một báo
 *    giá cũ không có tỷ giá (exchange_rate NULL) hoặc chưa đọc được cài đặt.
 *    Cố định để báo giá cũ KHÔNG nhảy số khi ai đó đổi mức mặc định.
 *  - Cài đặt `ty_gia_bao_gia_mac_dinh` (bảng cai_dat_he_thong): mức team tự đặt,
 *    CHỈ dùng để điền sẵn cho báo giá TẠO MỚI và cho nút "Mặc định".
 */
export const TY_GIA_BAO_GIA_MAC_DINH = 25500;

/** Khoá trong bảng cai_dat_he_thong. */
export const KHOA_TY_GIA_MAC_DINH = "ty_gia_bao_gia_mac_dinh";

/** Biên hợp lệ của tỷ giá VND/USD — chặn gõ nhầm (2.55 hay 2550000). */
export const TY_GIA_MIN = 1_000;
export const TY_GIA_MAX = 200_000;

export function tyGiaHopLe(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= TY_GIA_MIN && v <= TY_GIA_MAX;
}

/** Đọc mức mặc định từ cài đặt (text trong DB) → số. Sai/thiếu → hằng số code. */
export function doTyGiaMacDinh(raw: string | number | null | undefined): number {
  if (raw == null || raw === "") return TY_GIA_BAO_GIA_MAC_DINH;
  const v = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.-]/g, ""));
  return tyGiaHopLe(v) ? v : TY_GIA_BAO_GIA_MAC_DINH;
}

/** Tỷ giá dùng để TÍNH TIỀN cho một báo giá cụ thể.
 *  Dùng số đã lưu của báo giá đó; chỉ khi số đó vô lý (NULL, 0, âm — `??` KHÔNG
 *  bắt được 0) mới rơi về hằng số, để không có phép chia cho 0 nào lọt ra file
 *  Word / Excel / bản đẩy cổng. */
export function tyGiaCuaBaoGia(v: number | null | undefined): number {
  return tyGiaHopLe(v) ? v : TY_GIA_BAO_GIA_MAC_DINH;
}
