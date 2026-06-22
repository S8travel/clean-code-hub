// Tính toán roster khách lẻ (đoàn ghép): tổng số khách + tổng thu tiền.
// Tách riêng UI để test độc lập.

export interface KhachLePax {
  so_khach_lon: number;
  so_khach_em1: number;
  so_khach_em2: number;
}
export interface KhachLeTien {
  gia_ban: number;
  da_thu: number;
}

/** Tổng số khách theo loại (đoàn so_khach_* = tổng roster). */
export function sumRosterPax(rows: KhachLePax[]): { lon: number; em1: number; em2: number } {
  return rows.reduce(
    (a, r) => ({
      lon: a.lon + (r.so_khach_lon || 0),
      em1: a.em1 + (r.so_khach_em1 || 0),
      em2: a.em2 + (r.so_khach_em2 || 0),
    }),
    { lon: 0, em1: 0, em2: 0 },
  );
}

/** Tổng đầu khách (lớn + em1 + em2). */
export function rosterTotalPax(rows: KhachLePax[]): number {
  const s = sumRosterPax(rows);
  return s.lon + s.em1 + s.em2;
}

/** Tổng tiền: giá bán, đã thu, còn lại (= giá bán − đã thu). */
export function sumRosterTien(rows: KhachLeTien[]): { giaBan: number; daThu: number; conLai: number } {
  const giaBan = rows.reduce((a, r) => a + (r.gia_ban || 0), 0);
  const daThu = rows.reduce((a, r) => a + (r.da_thu || 0), 0);
  return { giaBan, daThu, conLai: giaBan - daThu };
}

export type ThuStatus = "chua_thu" | "da_coc" | "da_thu";

/** Trạng thái thu của 1 khách lẻ:
 *  chua_thu (chưa thu đồng nào) | da_thu (thu đủ ≥ giá bán) | da_coc (thu 1 phần). */
export function thuStatus(row: KhachLeTien): ThuStatus {
  const gia = row.gia_ban || 0;
  const thu = row.da_thu || 0;
  if (thu <= 0) return "chua_thu";
  if (gia > 0 && thu >= gia) return "da_thu";
  return "da_coc";
}
