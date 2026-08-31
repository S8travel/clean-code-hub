// Tìm kiếm mẫu seri theo tên. Tách khỏi component để test được mà không cần render.

/** Bỏ dấu tiếng Việt + hạ chữ thường — để gõ "dai loan" vẫn ra "Đài Loan". */
export function boDauSeri(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    // U+0300–U+036F = dấu thanh/dấu mũ tách ra sau NFD. Viết bằng escape thay vì
    // ký tự thật để editor/diff không nuốt mất (chúng là ký tự tổ hợp, vô hình).
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export interface SeriTimKiem {
  ten_seri: string;
  mo_ta?: string | null;
}

/**
 * Lọc danh sách seri theo query. Query tách theo khoảng trắng, MỌI từ đều phải
 * khớp (gõ "cola pinwei" ra được "COLA - PINWEI 5 NGÀY") — tên seri dài nên tìm
 * theo chuỗi liền rất hay trượt. Khớp cả tên lẫn mô tả.
 */
export function locSeri<T extends SeriTimKiem>(list: T[], query: string): T[] {
  const tu = boDauSeri(query).split(/\s+/).filter(Boolean);
  if (tu.length === 0) return list;
  return list.filter((s) => {
    const noiDung = boDauSeri(s.ten_seri) + " " + boDauSeri(s.mo_ta);
    return tu.every((t) => noiDung.includes(t));
  });
}
