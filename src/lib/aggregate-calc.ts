// Logic gộp nhóm tính chênh lệch sau khi điều chỉnh chi phí đã thanh toán —
// quyết định tạo CÔNG NỢ (trả thừa) hay ĐNTT BỔ SUNG (trả thiếu) + số tiền.
// Tách thuần từ ChiPhiDV/NH/KSSection (trước đó viết inline trong render, 3 bản,
// không test). KHÔNG import React/DB/UI.

/** 1 dòng chi phí — phần field cần cho tính delta gộp nhóm. */
export interface AggChiPhiRow {
  tien_cong_ty?: number | null;
  thanh_tien_thuc_te?: number | null;
  so_tien_da_tt?: number | null;
}

/** 1 record công nợ — phần field cần cho split CN/HT. */
export interface AggCongNoRow {
  trang_thai: string;
  so_tien_goc?: number | null;
}

/**
 * Tổng thực tế & đã trả của 1 nhóm chi phí — CHỈ tính dòng công ty thanh toán
 * (`tien_cong_ty > 0`; loại dòng HDV trả và dòng 0đ).
 * - `sumActual`: ưu tiên `thanh_tien_thuc_te` (giá trị đã điều chỉnh thực tế),
 *   fallback `tien_cong_ty`.
 * - `sumPaid`: tổng `so_tien_da_tt` (số đã thanh toán thật, do RPC tính).
 */
export function sumCompanyChiPhi(
  rows: AggChiPhiRow[],
): { sumActual: number; sumPaid: number } {
  const company = rows.filter((c) => Number(c.tien_cong_ty ?? 0) > 0);
  return {
    sumActual: company.reduce(
      (s, c) => s + Number(c.thanh_tien_thuc_te ?? c.tien_cong_ty ?? 0),
      0,
    ),
    sumPaid: company.reduce((s, c) => s + Number(c.so_tien_da_tt ?? 0), 0),
  };
}

/**
 * Tách tổng công nợ của nhóm theo trạng thái:
 * - CN = phần còn nợ / đã cấn trừ (`con_du` + `da_can_tru`)
 * - HT = phần đã hoàn tiền (`da_hoan_tien`)
 * Tính theo `so_tien_goc` (giá trị gốc lúc ghi nhận, không đổi).
 */
export function splitGroupCongNo(
  congNoRows: AggCongNoRow[],
): { groupCongNoCN: number; groupCongNoHT: number; groupCongNoTotal: number } {
  const sumGoc = (rows: AggCongNoRow[]) =>
    rows.reduce((s, c) => s + Number(c.so_tien_goc ?? 0), 0);
  const groupCongNoCN = sumGoc(
    congNoRows.filter(
      (c) => c.trang_thai === "con_du" || c.trang_thai === "da_can_tru",
    ),
  );
  const groupCongNoHT = sumGoc(
    congNoRows.filter((c) => c.trang_thai === "da_hoan_tien"),
  );
  return {
    groupCongNoCN,
    groupCongNoHT,
    groupCongNoTotal: groupCongNoCN + groupCongNoHT,
  };
}

/**
 * Chênh lệch gộp nhóm sau điều chỉnh.
 * - `aggDelta = sumActual − sumPaid`: > 0 = thiếu (cần ĐNTT bổ sung);
 *   < 0 = thừa (cần ghi công nợ).
 * - `effectiveDelta = aggDelta + groupCongNoTotal`: chênh lệch CÒN LẠI sau khi
 *   trừ phần công nợ/hoàn tiền ĐÃ ghi nhận. `= 0` nghĩa là đã xử lý xong.
 *   (Cộng vì công nợ đã ghi nhận làm "thu hẹp" khoảng lệch về 0.)
 * - `effectiveCommitted = sumCommitted − groupCongNoTotal`: số tiền ĐNTT đã cam
 *   kết, trừ phần đã chuyển thành công nợ.
 */
export function calcAggregateDelta(input: {
  sumActual: number;
  sumPaid: number;
  sumCommitted: number;
  groupCongNoTotal: number;
}): { aggDelta: number; effectiveDelta: number; effectiveCommitted: number } {
  const aggDelta = input.sumActual - input.sumPaid;
  return {
    aggDelta,
    effectiveDelta: aggDelta + input.groupCongNoTotal,
    effectiveCommitted: input.sumCommitted - input.groupCongNoTotal,
  };
}

/**
 * Cảnh báo lệch: chi phí thực tế ≠ số ĐNTT đã cam kết (sau khi trừ công nợ).
 * Trả về số tiền lệch (`sumActual − effectiveCommitted`, có thể âm/dương);
 * `0` khi không lệch, không có ĐNTT đã cam kết, hoặc đang hiện nút aggregate
 * footer (`showAggBtn` — tránh hiện trùng thông tin).
 */
export function calcDnttMismatch(input: {
  sumActual: number;
  effectiveCommitted: number;
  hasCommittedDntt: boolean;
  showAggBtn: boolean;
}): number {
  const { sumActual, effectiveCommitted, hasCommittedDntt, showAggBtn } = input;
  return hasCommittedDntt && sumActual !== effectiveCommitted && !showAggBtn
    ? sumActual - effectiveCommitted
    : 0;
}
