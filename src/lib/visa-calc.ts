// Quy đổi chi phí visa (nhập theo ngoại tệ) sang VND.
//   VND = round( SL × max(0, ĐG_raw × tỷ_giá − CK/đơn vị) )
// Chiết khấu (`ckVnd`) là số VND trừ TRÊN MỖI đơn vị (KHÔNG phải %), trừ trên
// đơn giá gross rồi mới nhân số lượng — KHÔNG trừ 1 lần cho cả dòng.
// tỷ_giá rơi về 0 → gross = 0 (đoàn VND-only nhập ty_gia=1).
// Lưu ý: visa lưu `ckVnd` ở cột `chiet_khau_pct` (numeric) — tên cột giữ nguyên,
// ngữ nghĩa với visa là VND/đơn vị (chỉ visa dùng cột này theo cách đó).

export function computeVisaVnd(
  soLuong: number,
  donGiaRaw: number,
  tyGia: number,
  ckVnd: number,
): number {
  const grossPerUnit = donGiaRaw * (tyGia || 0);
  const netPerUnit = Math.max(0, grossPerUnit - (ckVnd || 0));
  return Math.round(soLuong * netPerUnit);
}
