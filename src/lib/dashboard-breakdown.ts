import { addMonths, startOfMonth, endOfMonth, format } from "date-fns";

// Cột tháng cho bảng "Theo Agent" / "Theo Miền" trên Dashboard.
// start/end là chuỗi yyyy-MM-dd (local-aware để tránh timezone-shift ở UTC+7).
export interface MonthCol {
  key: string;   // dùng cho React key
  label: string; // MM/yyyy hiển thị
  start: string; // yyyy-MM-dd đầu tháng
  end: string;   // yyyy-MM-dd cuối tháng
}

export interface BreakdownCell {
  doan: number;
  khach: number;
}

export interface BreakdownRow {
  name: string;
  cells: BreakdownCell[]; // 1 cell / MonthCol, cùng thứ tự
}

// Tạo `count` cột tháng bắt đầu từ tháng của `today` (gồm tháng này + các tháng sau).
export function buildMonthCols(today: Date, count: number): MonthCol[] {
  return Array.from({ length: count }, (_, i) => {
    const dt = addMonths(today, i);
    return {
      key: format(dt, "MM/yyyy"),
      label: format(dt, "MM/yyyy"),
      start: format(startOfMonth(dt), "yyyy-MM-dd"),
      end: format(endOfMonth(dt), "yyyy-MM-dd"),
    };
  });
}

// Chỉ số cột tháng chứa `ngayDi` (yyyy-MM-dd). -1 nếu null/ngoài phạm vi.
export function monthIndexOf(ngayDi: string | null | undefined, cols: MonthCol[]): number {
  if (!ngayDi) return -1;
  return cols.findIndex((m) => ngayDi >= m.start && ngayDi <= m.end);
}

// Số tháng nên hiển thị: bỏ các tháng cuối rỗng (không có đoàn) nhưng giữ tối thiểu
// `minMonths`. Tính 1 lần từ doanList → 2 bảng dùng chung số cột (luôn thẳng hàng).
export function countVisibleMonths<T>(
  items: T[],
  cols: MonthCol[],
  getNgayDi: (item: T) => string | null | undefined,
  skip: (item: T) => boolean,
  minMonths: number,
): number {
  const has = cols.map(() => false);
  for (const it of items) {
    if (skip(it)) continue;
    const mi = monthIndexOf(getNgayDi(it), cols);
    if (mi >= 0) has[mi] = true;
  }
  let n = cols.length;
  while (n > minMonths && !has[n - 1]) n--;
  return n;
}

export interface BuildBreakdownOpts<T> {
  getKey: (item: T) => string | number | null | undefined;
  getName: (item: T) => string;
  getNgayDi: (item: T) => string | null | undefined;
  getKhach: (item: T) => number;
  skip?: (item: T) => boolean;
}

// Gom nhóm theo key (agent_id / miền) → 1 row/nhóm, mỗi row có cells theo cols.
export function buildBreakdown<T>(items: T[], cols: MonthCol[], opts: BuildBreakdownOpts<T>): BreakdownRow[] {
  const map = new Map<string | number, BreakdownRow>();
  for (const it of items) {
    if (opts.skip?.(it)) continue;
    const key = opts.getKey(it);
    if (key == null) continue;
    const mi = monthIndexOf(opts.getNgayDi(it), cols);
    if (mi < 0) continue;
    let row = map.get(key);
    if (!row) {
      row = { name: opts.getName(it), cells: cols.map(() => ({ doan: 0, khach: 0 })) };
      map.set(key, row);
    }
    row.cells[mi].doan += 1;
    row.cells[mi].khach += opts.getKhach(it);
  }
  return [...map.values()];
}

// Hàng "Tổng": cộng dồn từng cột của các row đã cho.
export function sumRows(rows: BreakdownRow[], colCount: number): BreakdownRow {
  return {
    name: "Tổng",
    cells: Array.from({ length: colCount }, (_, i) => ({
      doan: rows.reduce((s, r) => s + (r.cells[i]?.doan || 0), 0),
      khach: rows.reduce((s, r) => s + (r.cells[i]?.khach || 0), 0),
    })),
  };
}

// Tổng khách toàn bộ tháng của 1 row (dùng để sort).
export function rowTotalKhach(row: BreakdownRow): number {
  return row.cells.reduce((s, c) => s + c.khach, 0);
}
