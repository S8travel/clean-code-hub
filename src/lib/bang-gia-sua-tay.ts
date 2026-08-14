// Bảng giá dịch vụ — logic THUẦN cho phần sửa tay (lọc / chuẩn hoá số / kiểm
// dòng trước khi lưu). Tách khỏi UI để test được mà không cần render.

export type BangGiaLoai = "hotel" | "nha_hang" | "xe" | "dich_vu";

/** Trần giá 1 dòng bảng giá (10 tỷ VND) — khớp ngưỡng của parser import.
 *  Gõ tay thừa vài số 0 là chuyện thường; chặn ở đây để không có dòng giá rác. */
export const MAX_GIA_VND = 10_000_000_000;

/** Bỏ dấu tiếng Việt + gộp khoảng trắng → so khớp tìm kiếm không phụ thuộc cách gõ.
 *  Giữ chữ Hán (tên khách sạn/nhà hàng trong bảng giá có cả tiếng Trung). */
export function boDau(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chuẩn hoá ô GIÁ gõ tay → số, hoặc null khi không dùng được.
 *  Nhận cả "450.000", "450000", "450,000 ₫". Âm / vượt trần → null. */
export function chuanHoaGia(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    const v = Math.round(raw);
    return v > 0 && v <= MAX_GIA_VND ? v : null;
  }
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (!digits) return null;
  const v = parseInt(digits, 10);
  return v > 0 && v <= MAX_GIA_VND ? v : null;
}

/** Chuẩn hoá ô FOC gõ tay → số ≥ 0. FOC nhận thập phân (chính sách "16 免 1.5"
 *  có thật ở khách sạn), nên KHÔNG ép về số nguyên. Rác → 0. */
export function chuanHoaFoc(raw: string | number | null | undefined): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : 0;
  const s = String(raw).replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const v = parseFloat(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export interface BangGiaRowLite {
  ten: string;
  loai: string;
  gia: number | null;
}

export interface LocBangGiaInput {
  /** Từ khoá tìm theo TÊN (bỏ dấu). Rỗng = không lọc. */
  q?: string;
  /** Lọc theo loại. "tat_ca" / vắng = không lọc. */
  loai?: BangGiaLoai | "tat_ca";
}

/** Lọc bảng giá theo từ khoá + loại. Giữ NGUYÊN thứ tự đầu vào (danh sách đã
 *  sắp theo loại/tên từ DB) — sắp lại ở đây sẽ làm dòng nhảy chỗ khi OP sửa tên. */
export function locBangGia<T extends BangGiaRowLite>(rows: T[], f: LocBangGiaInput = {}): T[] {
  const q = boDau(f.q);
  const loai = f.loai && f.loai !== "tat_ca" ? f.loai : null;
  return rows.filter((r) => {
    if (loai && r.loai !== loai) return false;
    if (q && !boDau(r.ten).includes(q)) return false;
    return true;
  });
}

/** Các tên TRÙNG NHAU trong bảng giá (đã bỏ dấu). Gõ tay rất dễ đẻ ra bản sao
 *  của một dịch vụ đã có, mà 2 dòng cùng tên khác giá thì lúc chọn trong báo giá
 *  không ai biết dòng nào đúng. Trả về set tên đã chuẩn hoá để UI gắn cảnh báo. */
export function tenBiTrung<T extends BangGiaRowLite>(rows: T[]): Set<string> {
  const dem = new Map<string, number>();
  for (const r of rows) {
    const k = boDau(r.ten);
    if (!k) continue;
    dem.set(k, (dem.get(k) ?? 0) + 1);
  }
  return new Set([...dem.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

/** Lý do KHÔNG lưu được dòng, hoặc null khi hợp lệ. */
export function loiDongBangGia(row: { ten: string; gia: number | null }): string | null {
  if (!row.ten.trim()) return "Chưa có tên dịch vụ";
  if (row.gia == null || row.gia <= 0) return "Giá phải lớn hơn 0";
  if (row.gia > MAX_GIA_VND) return "Giá vượt 10 tỷ — kiểm tra lại số 0";
  return null;
}
