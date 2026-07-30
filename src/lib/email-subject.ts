// Làm sạch tiêu đề email trước khi gửi.
//
// SỰ CỐ 30/07/2026: một khách sạn trong danh mục có tên kết thúc bằng ký tự XUỐNG DÒNG
// (dán từ Excel/Word). Tiêu đề mail đặt phòng nội suy thẳng tên đó vào, Resend trả 422
// `validation_error: The "\n" is not allowed in the subject field` → OP không gửi được
// mail, mà thông báo lỗi thì thô và không chỉ ra tên nào bẩn.
//
// Ký tự xuống dòng trong tiêu đề còn là lỗ header-injection cổ điển của email (chèn
// header giả sau \r\n), nên gộp mọi khoảng trắng về 1 dấu cách là đúng cả về an toàn.
//
// Chốt chặn THẬT nằm ở edge function send-booking-email (mọi caller đều đi qua đó, kể
// cả code mới sau này). Hàm này dùng ở client để ô tiêu đề trên màn hình khớp đúng thứ
// sẽ được gửi, và để đường "Mở email client" (mailto:) không dính %0A.

/** Gộp mọi khoảng trắng (kể cả \n, \r, \t) về một dấu cách, cắt hai đầu. */
export function sanitizeEmailSubject(subject: string): string {
  return subject.replace(/\s+/g, " ").trim();
}
