// Khóa chi phí khi đoàn ĐÃ QUYẾT TOÁN — chỉ admin sửa được.
//
// "Đã quyết toán" = đoàn có ĐNTT quyết toán HDV (ref_loai='hdv_quyet_toan') đã thanh
// toán (xem useDoanQuyetToanPaidSet + computeDoanStatus). Khóa CHỈ con số chi phí
// (SL/đơn giá/FOC/thêm/xóa + cascade); luồng thanh toán (ĐNTT/payment/hóa đơn) giữ nguyên.

/** Nhóm chi phí được miễn khóa cho đúng người phụ trách. */
export const DANH_MUC_BAO_HIEM = "bao_hiem";
export const DANH_MUC_VISA = "visa";

export interface MienTruKhoaChiPhi {
  /** danh_muc của dòng chi phí đang đụng tới. Không biết → coi như KHÔNG được miễn. */
  danhMuc?: string | null;
  /** user_roles.phu_trach_bao_hiem — người phụ trách mục bảo hiểm. */
  phuTrachBaoHiem?: boolean | null;
  /** user_roles.phu_trach_visa — người phụ trách mục visa. */
  phuTrachVisa?: boolean | null;
}

/**
 * true = chi phí của đoàn bị khóa (đã quyết toán + user KHÔNG phải admin).
 *
 * Ngoại lệ `mienTru`: bảo hiểm và visa nằm trong nhóm thanh toán định kỳ nên số
 * về rất muộn — thường sau khi đoàn đã quyết toán. Người được đánh dấu phụ trách
 * mục nào thì sửa được RIÊNG dòng của mục đó; mọi mục khác vẫn khóa. An toàn vì
 * cả hai đều do công ty trả (tien_hdv = 0) → không lệch số quyết toán HDV.
 */
export function isChiPhiLocked(
  role: string | null | undefined,
  qtPaidSet: Set<number> | null | undefined,
  doanId: number | null | undefined,
  mienTru?: MienTruKhoaChiPhi,
): boolean {
  if (role === "admin") return false; // admin luôn sửa được
  if (doanId == null) return false;
  if (!qtPaidSet?.has(doanId)) return false;
  if (mienTru?.phuTrachBaoHiem && mienTru.danhMuc === DANH_MUC_BAO_HIEM) return false;
  if (mienTru?.phuTrachVisa && mienTru.danhMuc === DANH_MUC_VISA) return false;
  return true;
}
