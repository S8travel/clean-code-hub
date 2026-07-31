// Lọc + tìm kiếm cho Sổ tay điều hành. Tách khỏi component để test được mà
// không cần render.

import type { SopCat, SopMuc } from "./sop-data";
import { chuZhCuaMuc } from "./sop-i18n";

/** Bỏ dấu tiếng Việt + hạ chữ thường — để gõ "khach san" vẫn ra "khách sạn". */
export function boDau(s: string): string {
  return s
    .normalize("NFD")
    // U+0300–U+036F = dấu thanh/dấu mũ tách ra sau NFD. Viết bằng escape thay vì
    // ký tự thật để editor/diff không nuốt mất (chúng là ký tự tổ hợp, vô hình).
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/**
 * Gom toàn bộ chữ của một mục để tìm kiếm — kể cả bước, mẫu câu, checklist.
 * Gộp LUÔN bản tiếng Trung: đang xem tiếng Trung mà gõ tiếng Việt (hoặc ngược
 * lại) vẫn ra kết quả, vì team dùng lẫn hai thứ tiếng.
 */
function noiDungTimKiem(m: SopMuc): string {
  return [
    chuZhCuaMuc(m.id),
    m.title,
    m.sub,
    m.tinhHuong ?? "",
    m.mauCau ?? "",
    ...(m.uuTien ?? []),
    ...(m.cachXuLy ?? []),
    ...(m.items ?? []),
    ...(m.buoc ?? []).flatMap((b) => [b.title, b.note ?? ""]),
  ].join(" ");
}

/**
 * Lọc theo tab + từ khóa. `cat = null` là "Tất cả".
 * Tìm kiếm bỏ dấu, không phân biệt hoa thường, quét cả nội dung bên trong mục
 * (không chỉ tiêu đề) — người dùng thường nhớ một câu trong bước xử lý hơn là
 * nhớ tên quy trình.
 */
export function locSop(data: SopMuc[], cat: SopCat | null, tuKhoa: string): SopMuc[] {
  const q = boDau(tuKhoa.trim());
  return data.filter((m) => {
    if (cat && m.cat !== cat) return false;
    if (!q) return true;
    return boDau(noiDungTimKiem(m)).includes(q);
  });
}

/** Gom theo nhóm, giữ thứ tự quy trình → tình huống → checklist. */
export function nhomTheoCat(data: SopMuc[]): { cat: SopCat; muc: SopMuc[] }[] {
  const thuTu: SopCat[] = ["quy_trinh", "tinh_huong", "checklist"];
  return thuTu
    .map((cat) => ({ cat, muc: data.filter((m) => m.cat === cat) }))
    .filter((g) => g.muc.length > 0);
}
