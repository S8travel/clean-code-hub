// Giá phòng khách sạn theo giai đoạn (mùa). Pure logic — tách khỏi hook/UI để test.

export interface GiaPhongRow {
  id: number;
  khach_san_id: number;
  ten_giai_doan: string | null;
  /** 'YYYY-MM-DD' | null. NULL = không giới hạn đầu. */
  tu_ngay: string | null;
  /** 'YYYY-MM-DD' | null. NULL = không giới hạn cuối. Cả 2 NULL = giá mặc định/quanh năm. */
  den_ngay: string | null;
  loai_phong: string | null;
  gia: number;
  ghi_chu: string | null;
  active: boolean;
}

/** Độ rộng khoảng (ngày) — dùng để ưu tiên giai đoạn HẸP hơn khi nhiều khoảng
 *  cùng phủ 1 ngày. Khoảng không đủ 2 cận → coi như rộng vô hạn. */
function rangeWidth(r: GiaPhongRow): number {
  if (!r.tu_ngay || !r.den_ngay) return Number.MAX_SAFE_INTEGER;
  const a = Date.parse(r.tu_ngay);
  const b = Date.parse(r.den_ngay);
  if (isNaN(a) || isNaN(b)) return Number.MAX_SAFE_INTEGER;
  return b - a;
}

/** Số cận ngày đã đặt (0,1,2) — giai đoạn cụ thể hơn (nhiều cận) thắng. */
function specificity(r: GiaPhongRow): number {
  return (r.tu_ngay ? 1 : 0) + (r.den_ngay ? 1 : 0);
}

/**
 * Chọn dòng giá áp dụng cho 1 ngày (date 'YYYY-MM-DD').
 * - Lọc dòng active phủ ngày đó: (tu_ngay ≤ date) ∧ (date ≤ den_ngay), cận NULL = mở.
 * - Trong các dòng phủ: ưu tiên CỤ THỂ hơn (nhiều cận ngày), rồi HẸP hơn, rồi id mới hơn.
 * - Không có dòng phủ (hoặc không truyền date) → fallback dòng "Mặc định" (cả 2 cận NULL).
 *   Không có dòng "Mặc định" → null (chưa định nghĩa giá cho ngày đó → caller báo thiếu).
 * Date dạng 'YYYY-MM-DD' so sánh chuỗi = so sánh theo thứ tự thời gian.
 */
export function resolveGiaPhong(rows: GiaPhongRow[], date?: string | null): GiaPhongRow | null {
  const active = rows.filter((r) => r.active);
  if (active.length === 0) return null;

  if (date) {
    const covering = active.filter(
      (r) => (!r.tu_ngay || date >= r.tu_ngay) && (!r.den_ngay || date <= r.den_ngay),
    );
    if (covering.length > 0) {
      covering.sort((a, b) => {
        const s = specificity(b) - specificity(a);
        if (s !== 0) return s;
        const w = rangeWidth(a) - rangeWidth(b);
        if (w !== 0) return w;
        return b.id - a.id;
      });
      return covering[0];
    }
  }

  // Fallback CHỈ dòng "Mặc định" (cả 2 cận NULL). Không có → null.
  return active.find((r) => !r.tu_ngay && !r.den_ngay) ?? null;
}

/** Giá áp dụng cho 1 ngày, hoặc null nếu không có dòng nào. */
export function resolveGiaPhongValue(rows: GiaPhongRow[], date?: string | null): number | null {
  return resolveGiaPhong(rows, date)?.gia ?? null;
}
