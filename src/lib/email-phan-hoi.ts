// Chọn địa chỉ Reply-To gắn vào mail booking gửi cho NCC.
//
// Sự cố 03/09/2026: mail đăng nhập KHÔNG bảo đảm là hộp thư có thật. Tài khoản
// tạo bằng quyền admin được đánh dấu "đã xác thực" ngay lúc tạo, không hề gửi
// mail xác nhận (confirmation_sent_at rỗng) → một chuỗi ký tự bịa vẫn đăng nhập
// được. Một OP có mail đăng nhập chưa từng được đăng ký bên nhà cung cấp mail;
// hàng chục mail booking mang địa chỉ đó ở Reply-To và CC → NCC bấm Reply là
// dội 550 5.1.1, OP không nhận được phản hồi nào, còn bản CC thì bounce mỗi
// lượt gửi (hại uy tín tên miền gửi).
//
// Ô "Email" trong hồ sơ Người dùng (user_roles.email) mới là hộp thư có người
// đọc — admin nhập tay, và nhiều OP cùng đội CỐ Ý dùng chung một hộp (trùng
// nhau ở đó là hợp lệ, đừng "dọn trùng"). Ưu tiên nó; mail đăng nhập chỉ còn là
// phương án dự phòng.
//
// Hệ thống không có luồng "quên mật khẩu" nên mail đăng nhập không được dùng để
// gửi thư ở bất kỳ chỗ nào khác — đổi thứ tự ưu tiên ở đây là an toàn.
export function chonEmailPhanHoi(
  emailHoSo: string | null | undefined,
  emailDangNhap: string | null | undefined,
): string | undefined {
  const hoSo = (emailHoSo ?? "").trim();
  if (hoSo.includes("@")) return hoSo;

  const dangNhap = (emailDangNhap ?? "").trim();
  if (dangNhap.includes("@")) return dangNhap;

  // Không có gì dùng được → để trống, edge function tự rơi về mail công ty.
  return undefined;
}
