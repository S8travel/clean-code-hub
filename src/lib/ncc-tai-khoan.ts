// Resolve thông tin tài khoản nhận tiền của NCC để hiển thị / in ĐNTT.
//
// NCC có 2 nguồn thông tin TK:
//   - `tai_khoan_thanh_toan`: ô blob user tự gõ (thường nhiều dòng: tên chủ TK,
//     số TK, ngân hàng) — nguồn ưu tiên, "lấy toàn bộ nội dung ô đó".
//   - `so_tai_khoan` + `ngan_hang`: 2 cột cấu trúc (fallback khi blob trống).

export interface NccTaiKhoanSource {
  so_tai_khoan?: string | null;
  ngan_hang?: string | null;
  tai_khoan_thanh_toan?: string | null;
}

/** Tách blob `tai_khoan_thanh_toan` thành các dòng đã trim, bỏ dòng rỗng. */
export function splitTaiKhoanBlob(blob?: string | null): string[] {
  if (!blob) return [];
  return blob
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Chuỗi 1 dòng để hiển thị inline (card / dialog). Ưu tiên blob (các dòng nối
 *  bằng " · "), fallback ghép so_tai_khoan + ngan_hang. Null khi NCC chưa có gì. */
export function resolveNccTaiKhoanText(ncc: NccTaiKhoanSource): string | null {
  const lines = splitTaiKhoanBlob(ncc.tai_khoan_thanh_toan);
  if (lines.length > 0) return lines.join(" · ");
  const stk = ncc.so_tai_khoan?.trim();
  const bank = ncc.ngan_hang?.trim();
  if (stk && bank) return `${stk} · ${bank}`;
  return stk || bank || null;
}
