/**
 * Guard chống tạo ĐNTT trùng cho 1 chi phí / nhóm chi phí.
 *
 * `committed`  — tổng allocation từ các ĐNTT CHƯA HỦY đang gắn vào nhóm (đã đề nghị,
 *                kể cả mới `cho_duyet` chưa thanh toán). Đây là commitment thật.
 * `soTienMoi`  — số tiền ĐNTT sắp tạo.
 * `groupCost`  — tổng chi phí công ty của nhóm (số tiền đúng phải trả).
 *
 * Trả `true` khi tổng cam kết SAU khi tạo vượt chi phí quá `tolerance` → dấu hiệu
 * tạo trùng (vd bấm "Tạo ĐNTT" 2 lần). Caller chỉ gọi ở chế độ FULL nên cọc / bổ
 * sung hợp lệ không kích hoạt. `tolerance` mặc định 1đ để bỏ qua lệch làm tròn.
 */
export function wouldOverCommit(
  committed: number,
  soTienMoi: number,
  groupCost: number,
  tolerance = 1,
): boolean {
  return committed + soTienMoi > groupCost + tolerance;
}
