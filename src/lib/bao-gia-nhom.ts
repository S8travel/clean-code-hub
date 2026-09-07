// src/lib/bao-gia-nhom.ts
// Gom báo giá thành chùm "bản gốc + các bản phụ" để vẽ danh sách.
// Logic THUẦN, tách khỏi UI để test được mà không cần render.

/** Chỉ những trường cần cho việc gom chùm. */
export interface DongChum {
  id: number;
  bao_gia_goc_id?: number | null;
}

export interface NhomBaoGia<T extends DongChum> {
  /** Dòng đứng ở tầng ngoài. */
  dau: T;
  /** Bản phụ thụt vào dưới `dau`. CHỈ chứa dòng có mặt trong danh sách đang hiện. */
  con: T[];
  /**
   * `dau` là bản phụ mà bản gốc của nó KHÔNG có mặt — do bộ lọc giấu, hoặc bản
   * gốc đã bị xoá. Mang id bản gốc để màn hình vẽ được chip "bản phụ của BG000xx".
   * null = `dau` đứng đúng chỗ của nó.
   */
  gocVang: number | null;
}

/**
 * Bản gốc của chùm mà `row` thuộc về — dùng khi tạo bản phụ MỚI từ `row`.
 *
 * Tạo bản phụ từ một bản phụ thì gắn vào đúng bản gốc chung, KHÔNG đẻ ra chùm
 * hai tầng. Đây là bản ở tầng ứng dụng cho tiện; DB còn một trigger chặn nữa,
 * vì hai người bấm cùng lúc thì đọc-rồi-ghi ở đây không đủ.
 */
export function idGocCua(row: DongChum): number {
  return row.bao_gia_goc_id ?? row.id;
}

/** Đếm số bản phụ của từng bản gốc. Gọi trên danh sách ĐẦY ĐỦ (chưa lọc). */
export function demBanPhu(rows: DongChum[]): Map<number, number> {
  const dem = new Map<number, number>();
  for (const r of rows) {
    const goc = r.bao_gia_goc_id ?? null;
    if (goc != null) dem.set(goc, (dem.get(goc) ?? 0) + 1);
  }
  return dem;
}

/**
 * Gom danh sách ĐÃ LỌC thành chùm.
 *
 * Luật với bộ lọc — chỉ gom những dòng ĐÃ KHỚP:
 *   - Bản phụ chỉ thụt vào dưới bản gốc KHI bản gốc cũng khớp bộ lọc.
 *   - Bản phụ khớp mà bản gốc không khớp thì đứng riêng ở tầng ngoài, mang
 *     `gocVang` để màn hình nói rõ nó là bản phụ của ai.
 * Nhờ vậy MỌI dòng khớp đều được vẽ đúng một lần — dòng đếm "Hiện X / Y báo giá"
 * không bao giờ nói dối, và bộ lọc không lặng lẽ nuốt mất kết quả khớp.
 *
 * Thứ tự:
 *   - Chùm neo theo THÀNH VIÊN GẶP ĐẦU TIÊN. Danh sách vào theo ngày tạo giảm
 *     dần, mà bản phụ luôn mới hơn bản gốc, nên vừa thêm bản phụ là cả chùm nổi
 *     lên đầu — giống cách "đối tác chờ trả lời" kéo cả chùm lên.
 *   - `uuTien` tính ở CẤP CHÙM (`dau` hoặc bất kỳ `con` nào). Nếu chỉ xét `dau`
 *     thì chùm có bản phụ đang chờ trả lời sẽ nằm giữa bảng, trong khi dải cảnh
 *     báo phía trên vẫn khẳng định "đã đưa lên đầu danh sách".
 *   - Dùng sort ỔN ĐỊNH nên trong cùng một rổ thứ tự cũ giữ nguyên.
 */
export function xepNhomBaoGia<T extends DongChum>(
  rows: T[],
  uuTien: (row: T) => boolean = () => false,
): NhomBaoGia<T>[] {
  const coMat = new Set(rows.map((r) => r.id));

  // Khoá chùm: id bản gốc nếu bản gốc CÓ MẶT, còn không thì chính nó đứng riêng.
  const khoaChum = (r: T): number => {
    const goc = r.bao_gia_goc_id ?? null;
    return goc != null && coMat.has(goc) ? goc : r.id;
  };

  const thuTuKhoa: number[] = [];
  const theoKhoa = new Map<number, T[]>();
  for (const r of rows) {
    const k = khoaChum(r);
    if (!theoKhoa.has(k)) {
      theoKhoa.set(k, []);
      thuTuKhoa.push(k);
    }
    theoKhoa.get(k)!.push(r);
  }

  const nhom: NhomBaoGia<T>[] = thuTuKhoa.map((k) => {
    const thanhVien = theoKhoa.get(k)!;
    // Bản gốc có thể xuất hiện SAU bản phụ trong danh sách (mới hơn đứng trước),
    // nên phải tìm theo id chứ không lấy phần tử đầu.
    const dau = thanhVien.find((r) => r.id === k) ?? thanhVien[0];
    const con = thanhVien.filter((r) => r !== dau);
    const gocCuaDau = dau.bao_gia_goc_id ?? null;
    return {
      dau,
      con,
      gocVang: gocCuaDau != null && !coMat.has(gocCuaDau) ? gocCuaDau : null,
    };
  });

  return nhom.sort(
    (a, b) =>
      Number(uuTien(b.dau) || b.con.some(uuTien)) -
      Number(uuTien(a.dau) || a.con.some(uuTien)),
  );
}

/** Tên gợi ý cho bản phụ sắp tạo. `soHienCo` = số bản phụ bản gốc đang có. */
export function tenBanPhu(tenGoc: string | null | undefined, soHienCo: number): string | null {
  const goc = (tenGoc ?? "").trim();
  if (!goc) return null; // báo giá chưa đặt tên thì để trống, đừng đẻ ra "(bản phụ 1)" trơ trọi
  return `${goc} (bản phụ ${soHienCo + 1})`;
}
