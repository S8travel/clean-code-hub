/**
 * Ai THỰC trả một dòng chi phí — dùng khi dựng bản in "Giấy đề nghị thanh toán".
 *
 * Giấy ĐNTT là chứng từ để CÔNG TY chi tiền cho NCC. Dòng do HDV ứng tiền mặt
 * trên đường (nước uống, vé lẻ…) được quyết toán ở tab HDV và KHÔNG nằm trong
 * `so_tien` của ĐNTT → in vào tờ giấy chỉ làm cột "Tổng tiền" vênh với cột
 * "Số tiền còn thanh toán" (Tổng − cọc − cấn trừ ≠ còn TT), kế toán trừ nhẩm ra
 * số lệch đúng bằng phần HDV trả.
 */
export type NguoiTra = "cong_ty" | "hdv";

export interface ChiPhiNguoiTra {
  tien_hdv?: number | null;
  tien_cong_ty?: number | null;
}

/**
 * Đọc theo SỐ TIỀN đã lưu trên dòng chi phí, KHÔNG theo `nguoi_thanh_toan` của
 * danh mục (master đổi sau không được lật người trả của đoàn cũ).
 * Hai vế đều 0 (dòng giá 0 / chưa lưu / không đọc được DB) → chưa kết luận được
 * → trả `fallback` = người trả đang hiển thị trên màn hình.
 */
export function resolveNguoiTra(
  cp: ChiPhiNguoiTra | null | undefined,
  fallback: NguoiTra = "cong_ty",
): NguoiTra {
  const congTy = Number(cp?.tien_cong_ty ?? 0);
  const hdv = Number(cp?.tien_hdv ?? 0);
  if (congTy > 0) return "cong_ty";
  if (hdv > 0) return "hdv";
  return fallback;
}

/** Dòng KHÔNG được in vào Giấy đề nghị thanh toán (công ty không chi khoản này). */
export function laDongHdvTra(
  cp: ChiPhiNguoiTra | null | undefined,
  fallback: NguoiTra = "cong_ty",
): boolean {
  return resolveNguoiTra(cp, fallback) === "hdv";
}
