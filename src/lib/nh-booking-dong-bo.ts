// Đồng bộ ô bữa ăn giữa Điều tour và Booking NH.
//
// Bối cảnh — OP báo "đổi nhà hàng mà hắn không chịu ghi nhận, ra vô lại thấy y
// sì ban đầu, không có thông báo gì hết":
//
//   1. OP gỡ nhà hàng khỏi ô bữa → lưu → `doan_ngay.an_*_nha_hang_id` = NULL (ĐÚNG).
//   2. Nhưng `doan_booking_nh` của bữa đó nằm nguyên, không ai dọn.
//   3. Vào lại đoàn → DoanDetail dựng lại → chốt chặn "chỉ vá 1 lần" là một `useRef`
//      nên reset theo vòng đời trang → đoạn tự điền chạy lại → lấy nhà hàng từ
//      booking điền vào ô trống.
//   4. Lần lưu kế tiếp ghi nhà hàng cũ xuống DB.
//
// Không có gì báo lỗi vì không có gì hỏng — hệ thống chỉ đang âm thầm điền lại.
// Soát dữ liệu thật: MỌI ô bữa lệch đều còn bản ghi booking mang đúng cái nhà
// hàng quay về, không sót ca nào.
//
// Hàm dưới đây tách thuần để test được mà không cần render / gọi DB.

export interface OBuaAn {
  an_trua_nha_hang_id: number | null;
  an_toi_nha_hang_id: number | null;
}

/**
 * Tầng 1 — có được phép tự điền nhà hàng từ booking không?
 *
 * Đoạn tự điền sinh ra để vá dữ liệu cũ: đoàn có booking NH nhưng điều tour
 * chưa hề có nhà hàng nào (chưa migrate). Chỉ đúng khi **toàn bộ** ô bữa trong
 * chương trình đều trống.
 *
 * Chương trình đã có dù chỉ một nhà hàng ⇒ OP đã dựng nó rồi ⇒ ô trống còn lại
 * là do OP CỐ Ý gỡ ra, không được điền đè.
 *
 * Thay cho chốt chặn cũ (`useRef` + cờ "đã vá đoàn này"): ref chỉ sống bằng
 * vòng đời trang, ra vô một lần là mất, nên tầng chặn coi như không có. Điều
 * kiện này đọc thẳng từ dữ liệu nên bền qua mọi lần vào ra, mọi máy, mọi người.
 */
export function duocDienNhaHangTuBooking(oBuas: readonly OBuaAn[]): boolean {
  return oBuas.every((d) => d.an_trua_nha_hang_id == null && d.an_toi_nha_hang_id == null);
}
