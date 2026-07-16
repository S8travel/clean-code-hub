/**
 * Logic thuần cho 2 lỗ hổng phát hiện qua một ca hủy đoàn thực tế.
 * Tách khỏi hook/UI để test được không cần render / không cần mock supabase.
 */

/**
 * Fix ① — an toàn khi hủy ĐNTT: khi `useCancelDNTT` reverse công nợ do "điều chỉnh" tạo
 * (cong_no.dntt_goc_id = ĐNTT đang hủy), nó xóa mọi payment tham chiếu công nợ đó. Nhưng
 * payment method='can_tru' với cong_no_id ấy có thể thuộc ĐNTT của ĐOÀN KHÁC — đoàn đó đã
 * dùng công nợ này làm credit để trả. Xóa mất = đoàn kia mất dấu đã trả → nợ lại tiền.
 *
 * Trả về true nếu có payment tham chiếu công nợ nhưng thuộc ĐNTT KHÁC (cấn trừ chéo) →
 * KHÔNG được auto-xóa, phải chặn và báo OP xử lý tay.
 */
export function coCanTruCheoDntt(
  paymentsThamChieuCongNo: { dntt_id: number | null }[],
  dnttDangHuy: number,
): boolean {
  return paymentsThamChieuCongNo.some((p) => p.dntt_id !== dnttDangHuy);
}

/**
 * Fix ② — số ĐNTT còn CHẶN hủy đoàn.
 *
 * ĐNTT đã trả mà tiền đã được chuyển thành công nợ (OP "điều chỉnh giảm / về 0" →
 * cong_no.dntt_goc_id trỏ vào nó) coi như ĐÃ XỬ LÝ tiền — không nên chặn hủy đoàn nữa.
 * Nếu vẫn chặn, OP kẹt: ĐNTT vẫn da_duyet, mà bấm "Hủy ĐNTT" thì rơi vào bug cấn trừ chéo
 * đoàn (xem [coCanTruCheoDntt]). Chỉ những ĐNTT còn sống mà CHƯA có công nợ đối ứng mới chặn.
 *
 * @param dnttSongIds  ĐNTT của đoàn đã lọc trang_thai_duyet ∉ (tu_choi, da_huy).
 * @param dnttDaCoCongNo  set id ĐNTT có cong_no với dntt_goc_id = id (đã chuyển thành công nợ).
 */
export function demDnttChanHuyDoan(
  dnttSongIds: number[],
  dnttDaCoCongNo: ReadonlySet<number>,
): number {
  return dnttSongIds.filter((id) => !dnttDaCoCongNo.has(id)).length;
}
