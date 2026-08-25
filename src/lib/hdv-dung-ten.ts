// Người ĐỨNG TÊN phiếu tạm ứng / quyết toán HDV.
//
// Một đoàn có thể ghi 2 HDV (`doan.huong_dan_vien_id` = chính,
// `huong_dan_vien_id_2` = phụ). Tiền của đoàn vẫn gom MỘT túi chung
// (`doan_chi_phi.tien_hdv` không phân biệt ai ứng) → cả đoàn chỉ có một bản
// quyết toán; thứ cần chọn là NGƯỜI đứng tên phiếu, vì bản in lấy tên + số tài
// khoản theo người này để chuyển/nhận phần chênh lệch.
//
// Người đứng tên lưu ở `de_nghi_thanh_toan.ref_id` ngay lúc tạo phiếu.

export interface HdvDungTen {
  id: number;
  ten: string;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
}

/**
 * Danh sách HDV của đoàn theo thứ tự chính → phụ, bỏ trùng và bỏ id không tra
 * được. Bỏ trùng là bắt buộc: có đoàn nhập CÙNG một người vào cả hai ô
 * — không lọc thì ô chọn hiện tên người đó hai lần.
 */
export function danhSachHdvDoan<T extends { id: number }>(
  ids: (number | null | undefined)[],
  tatCa: T[],
): T[] {
  const out: T[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (id == null || seen.has(id)) continue;
    const found = tatCa.find((h) => h.id === id);
    if (!found) continue;
    seen.add(id);
    out.push(found);
  }
  return out;
}

/**
 * Người đứng tên của MỘT phiếu đã lưu — khớp theo `ref_id` ghi lúc tạo.
 *
 * KHÔNG được rơi về HDV chính hiện tại khi `ref_id` có giá trị: đoàn đổi HDV
 * sau khi đã quyết toán thì bản in sẽ ra tên người này nhưng số tài khoản
 * người kia → chuyển nhầm tiền. Vì vậy `tatCa` phải gồm cả HDV đã bị gỡ khỏi
 * đoàn (hook nạp theo union id đoàn + ref_id các phiếu).
 *
 * Chỉ phiếu cũ chưa ghi `ref_id` mới dùng `macDinh`.
 */
export function nguoiDungTenPhieu<T extends { id: number }>(
  refId: number | null | undefined,
  tatCa: T[],
  macDinh: T | null,
): T | null {
  if (refId == null) return macDinh;
  return tatCa.find((h) => h.id === refId) ?? null;
}
