// Cascade chi phí cảnh điểm (use-dieu-tour) — chọn dòng chi phí để UPDATE hay INSERT.
//
// Dedupe CHÍNH theo (doan_id, danh_muc, ngay_so, mo_ta) để MERGE cross-nhóm
// (Approach A: 2 nhóm cùng cảnh điểm + ngày → 1 dòng chi phí, so_luong = SUM khách).
//
// NHƯNG UNIQUE constraint của doan_chi_phi là
//   (doan_id, ngay_so, danh_muc, ref_doan_ngay_item_id).
// Item điều tour match theo canh_diem_id rồi UPDATE → ref_doan_ngay_item_id ỔN ĐỊNH
// qua mỗi lần lưu. Khi ĐỔI TÊN cảnh điểm trong danh mục, mo_ta đổi mà ref giữ nguyên
// → dedupe theo mo_ta TRƯỢT dòng cũ → nhảy nhánh INSERT với ref cũ → đụng UNIQUE
// (lỗi `duplicate key ..._ref_doan_ngay_item_id_key`, save điều tour fail giữa chừng).
//
// Fix: nếu lookup theo mo_ta trượt, fallback lookup theo ref_doan_ngay_item_id (đúng
// các cột của UNIQUE key) để bắt lại dòng cũ → UPDATE (nhánh update đã set mo_ta mới,
// KHÔNG re-snap foc). Ưu tiên byMoTa để giữ merge cross-nhóm.

/**
 * Trả về dòng chi phí cần UPDATE, hoặc `null` nếu phải INSERT mới.
 * @param byMoTa  dòng tìm theo (doan_id, danh_muc, ngay_so, mo_ta) — merge cross-nhóm.
 * @param byRef   dòng tìm theo ref_doan_ngay_item_id — bắt case đổi tên (chống đụng UNIQUE).
 */
export function resolveCanhDiemChiPhiTarget<T extends { id: number }>(
  byMoTa: T | null | undefined,
  byRef: T | null | undefined,
): T | null {
  return byMoTa ?? byRef ?? null;
}
