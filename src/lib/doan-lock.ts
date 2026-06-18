// Khóa TOÀN ĐOÀN khi Kế toán trưởng (KTT) duyệt quyết toán HDV — chỉ admin sửa được.
//
// "Locked set" = đoàn có ĐNTT ref_loai='hdv_quyet_toan' đã KTT-duyệt (trang_thai_duyet
// ='da_duyet', tức ktt_duyet_luc được set) VÀ admin chưa mở khóa (doan.quyet_toan_mo_khoa
// =false). Dựng ở useDoanQuyetToanLockedSet (use-doan.ts). Admin luôn bypass (mở khóa
// qua nút riêng trên trang đoàn).
//
// Lúc đoàn bị khóa: đoàn đã đi xong, HDV nộp giấy tờ, kế toán đã check rồi mới quyết
// toán → chốt số. Khóa mọi sửa đổi nghiệp vụ (điều tour / booking / chi phí / số khách),
// VẪN cho tất toán các ĐNTT đã duyệt (gồm chính khoản quyết toán HDV).

/** true = đoàn bị khóa (đã KTT-duyệt quyết toán, chưa admin mở khóa) + user KHÔNG phải admin. */
export function isDoanLocked(
  role: string | null | undefined,
  lockedSet: Set<number> | null | undefined,
  doanId: number | null | undefined,
): boolean {
  if (role === "admin") return false; // admin luôn sửa được (mở khóa qua nút riêng)
  if (doanId == null) return false;
  return !!lockedSet?.has(doanId);
}
