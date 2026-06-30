// Định dạng thông tin xe cho MAIL BOOKING gửi nhà xe.
// Quy tắc (chốt với user):
//  - Xe THƯỜNG → nhà xe chỉ cần biết SỐ CHỖ (vd "45 chỗ"). Bỏ tên loại (thường
//    chỉ là mã/brand trùng số chỗ).
//  - Xe LIMOUSINE (ten_xe có "LMS"/"LIMO"/"LIMOUSINE") → cần LOẠI XE + SỐ CHỖ
//    (vd "LMS 9C (9 chỗ)") vì limo nhiều cấu hình khác nhau.
//
// Edge: nhiều dòng nha_xe_loai_xe có so_cho = NULL nhưng số chỗ nằm trong tên
// (vd "45c", "LMS 11S") → khi thiếu so_cho thì fallback về ten_xe để không mất
// thông tin chỗ.

/** Xe có phải limousine không (dựa token LMS/LIMO trong tên loại xe). */
export function isXeLimousine(tenXe: string | null | undefined): boolean {
  return /lms|limo/i.test(tenXe ?? "");
}

/**
 * Chuỗi mô tả xe trong mail booking nhà xe.
 *  - Limousine: `<loại xe> (<N> chỗ)` — giữ tên loại; thiếu so_cho → chỉ tên loại.
 *  - Thường:    `<N> chỗ` — chỉ số chỗ; thiếu so_cho → fallback tên loại (số chỗ
 *    thường nằm trong tên như "45c").
 * Không có gì để hiển thị → "—".
 */
export function formatXeForEmail(
  tenXe: string | null | undefined,
  soCho: number | null | undefined,
): string {
  const ten = (tenXe ?? "").trim();
  const choStr = soCho != null && soCho > 0 ? `${soCho} chỗ` : "";

  if (isXeLimousine(ten)) {
    if (ten && choStr) return `${ten} (${choStr})`;
    return ten || choStr || "—";
  }
  // Xe thường: ưu tiên số chỗ; thiếu so_cho → fallback tên (chứa số chỗ).
  return choStr || ten || "—";
}
