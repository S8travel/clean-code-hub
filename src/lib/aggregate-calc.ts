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
 * Tổng thực tế & đã trả của 1 nhóm chi phí.
 * - `sumActual`: CHỈ dòng công ty thanh toán (`tien_cong_ty > 0`; loại dòng HDV
 *   trả và dòng 0đ). Ưu tiên `thanh_tien_thuc_te` (đã điều chỉnh), fallback
 *   `tien_cong_ty`.
 * - `sumPaid`: tổng `so_tien_da_tt` trên TẤT CẢ dòng — tiền đã trả là lịch sử,
 *   không biến mất khi dòng bị sửa về 0đ/chuyển HDV sau khi trả. Lọc theo
 *   `tien_cong_ty > 0` ở vế này từng làm delta sai 2 hướng: mất dấu tiền trả
 *   thừa (footer ẩn nút công nợ) hoặc gợi ý "Thanh toán bổ sung" trùng tiền.
 *   Dòng HDV thuần / suất voucher-tặng 0đ không có allocation → da_tt = 0,
 *   cộng cả vào cũng không nhiễu.
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
    sumPaid: rows.reduce((s, c) => s + Number(c.so_tien_da_tt ?? 0), 0),
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
 * - `effectiveCommitted = sumCommitted − groupCongNoTotal − voucherKhoRefund`: số
 *   tiền ĐNTT đã cam kết, trừ phần đã chuyển công nợ + phần voucher hoàn về kho.
 * - `voucherKhoRefund` (mặc định 0): phần payment 'voucher' GIỮ-LẠI vượt giá trị
 *   phủ thực khi giảm vé trên ĐNTT đã trả đủ (= vé trả về kho). KHÔNG phải cash
 *   công ty còn phải cân → trừ khỏi CẢ "đã trả" lẫn "cam kết" để lệch chỉ còn cash
 *   thật (boat voucher tự loại). NH truyền vào; DV/KS để mặc định 0 → KHÔNG đổi.
 * - `deltaThieuThat`: phần THIẾU sau khi tính cả tiền đã ĐỀ NGHỊ nhưng chưa trả
 *   (`sumDaDeNghi` = Σ `chi_phi.so_tien_da_dntt` của nhóm). Xem chú thích dưới.
 */
export function calcAggregateDelta(input: {
  sumActual: number;
  sumPaid: number;
  sumCommitted: number;
  groupCongNoTotal: number;
  voucherKhoRefund?: number;
  /**
   * Σ `so_tien_da_dntt` của nhóm — cam kết THẬT do RPC recalc tính TOÀN CỤC, nên
   * nó thấy cả ĐNTT mà section không thấy: phiếu định kỳ có `doan_id = NULL` nên
   * `useDNTTList(doanId)` lọc mất, `daDeNghi`/`clusterPendingAmt` đều = 0.
   * Thiếu vế này, một khoản đã nằm trong phiếu gộp cuối tháng vẫn hiện nút
   * "Thanh toán bổ sung" → OP bấm → đề nghị/trả LẦN HAI.
   * Mặc định 0 → giữ nguyên hành vi cho caller chưa truyền.
   */
  sumDaDeNghi?: number;
}): {
  aggDelta: number;
  effectiveDelta: number;
  effectiveCommitted: number;
  deltaThieuThat: number;
} {
  const khoRefund = Math.max(0, input.voucherKhoRefund ?? 0);
  const aggDelta = input.sumActual - (input.sumPaid - khoRefund);
  // max(): ĐNTT bị hủy SAU khi trả thì cam kết tụt về 0 nhưng tiền đã ra khỏi tài
  // khoản — lấy vế lớn hơn để không gợi ý trả thêm phần đã trả.
  const daChiPhoi = Math.max(input.sumPaid, input.sumDaDeNghi ?? 0);
  return {
    aggDelta,
    effectiveDelta: aggDelta + input.groupCongNoTotal,
    effectiveCommitted: input.sumCommitted - input.groupCongNoTotal - khoRefund,
    deltaThieuThat: input.sumActual - (daChiPhoi - khoRefund) + input.groupCongNoTotal,
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
