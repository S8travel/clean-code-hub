// Khóa chi phí khi đoàn ĐÃ QUYẾT TOÁN — chỉ admin sửa được.
//
// "Đã quyết toán" = đoàn có ĐNTT quyết toán HDV (ref_loai='hdv_quyet_toan') đã thanh
// toán (xem useDoanQuyetToanPaidSet + computeDoanStatus). Khóa CHỈ con số chi phí
// (SL/đơn giá/FOC/thêm/xóa + cascade); luồng thanh toán (ĐNTT/payment/hóa đơn) giữ nguyên.

/** true = chi phí của đoàn bị khóa (đã quyết toán + user KHÔNG phải admin). */
export function isChiPhiLocked(
  role: string | null | undefined,
  qtPaidSet: Set<number> | null | undefined,
  doanId: number | null | undefined,
): boolean {
  if (role === "admin") return false; // admin luôn sửa được
  if (doanId == null) return false;
  return !!qtPaidSet?.has(doanId);
}
