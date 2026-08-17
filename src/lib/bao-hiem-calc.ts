// Ô "SL" của dòng bảo hiểm (mặc định = số khách × số ngày).
//
// SL = 0 là giá trị HỢP LỆ: đoàn không mua bảo hiểm → dòng chi phí về 0 đ.
// KHÔNG xoá dòng để "bỏ" bảo hiểm — dòng có thể đã nằm trong ĐNTT / thanh toán
// định kỳ, xoá sẽ CASCADE mất allocation (xem CLAUDE.md "KHÔNG xóa chi phí đã
// nằm trong ĐNTT — phải Điều chỉnh về 0").
//
// Ô để trống = 0 (người dùng xoá trắng ô để bỏ bảo hiểm).
// Số âm / chữ = không hợp lệ → chặn lưu, giữ nguyên giá trị cũ trong DB.

export interface SoLuongBaoHiemParsed {
  ok: boolean;
  value: number;
}

export function parseSoLuongBaoHiem(raw: string): SoLuongBaoHiemParsed {
  const s = raw.trim();
  if (s === "") return { ok: true, value: 0 };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { ok: false, value: 0 };
  return { ok: true, value: n };
}
