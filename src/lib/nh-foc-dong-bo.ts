// FOC của bảng làm việc Chi phí Nhà hàng (localRows) — lấy từ đâu cho đúng.
//
// SỰ CỐ 28/09/2026: ô FOC (NHFocEditor) ghi THẲNG xuống doan_chi_phi, còn effect đồng
// bộ trong use-nh-section bỏ qua dòng 🔒 (is_overridden) → bảng làm việc giữ FOC lúc mở
// tab. Lần lưu kế tiếp của dòng đó (sửa giá / số khách / CK, chỉ bấm vào ô rồi rời ra,
// đổi "Ai trả", Tạo ĐNTT) ghi FOC CŨ ngược lại DB và tính tiền không trừ suất miễn —
// ĐNTT đề nghị thừa đúng số suất FOC.
//
// Luật: FOC chỉ được sửa qua ô FOC → DB là nguồn, KỂ CẢ dòng 🔒 (không có "số OP gõ" nào
// trong bảng làm việc cần giữ). Riêng lúc ô FOC đang lưu thì giữ số OP vừa gõ, kẻo một
// bản tải về từ trước lúc lưu kéo bảng về số cũ rồi lần lưu kế tiếp ghi đè.

export interface FocCap {
  foc_khach_snapshot: number | null;
  foc_mien_snapshot: number | null;
}

/** Nguồn FOC đầu vào (dòng state / dòng DB — field có thể vắng). */
export interface FocVao {
  foc_khach_snapshot?: number | null;
  foc_mien_snapshot?: number | null;
}

/** Lượt lưu đang chạy từ ô FOC cho một ô bữa. */
export interface FocDangLuu extends FocCap {
  /** Mốc lưu xong (ms). null = chưa xong. */
  xongLuc: number | null;
}

export function cungFoc(a: FocVao, b: FocVao): boolean {
  return (a.foc_khach_snapshot ?? null) === (b.foc_khach_snapshot ?? null) &&
    (a.foc_mien_snapshot ?? null) === (b.foc_mien_snapshot ?? null);
}

/**
 * Lượt lưu từ ô FOC đã "về" tới dữ liệu chi phí chưa (bỏ đánh dấu đang lưu được chưa)?
 * - Dòng DB đã mang đúng số vừa lưu → xong.
 * - Đã có bản tải SAU lúc lưu xong mà vẫn khác → người khác vừa sửa, theo DB.
 */
export function focDangLuuDaVe(
  dangLuu: FocDangLuu,
  db: FocVao | null,
  chiPhiDataUpdatedAt: number,
): boolean {
  if (db && cungFoc(dangLuu, db)) return true;
  return dangLuu.xongLuc != null && chiPhiDataUpdatedAt > dangLuu.xongLuc;
}

/**
 * FOC bảng làm việc phải giữ cho một dòng: đang lưu → số OP vừa gõ; không thì theo
 * dòng DB; dòng chưa có trong DB (chưa lưu lần nào) → giữ nguyên.
 */
export function chonFocChoDong(state: FocVao, db: FocVao | null, dangLuu: FocDangLuu | null): FocCap {
  const nguon = dangLuu ?? db ?? state;
  return {
    foc_khach_snapshot: nguon.foc_khach_snapshot ?? null,
    foc_mien_snapshot: nguon.foc_mien_snapshot ?? null,
  };
}
