// HDV của MỘT đoàn — gom 3 nguồn theo đúng thứ tự:
//   1. `doan.huong_dan_vien_id`   — HDV chính
//   2. `doan.huong_dan_vien_id_2` — HDV phụ
//   3. `doan.hdv_di_cung_ids`     — HDV đi cùng, người thứ 3 trở đi (đoàn 5–6 HDV)
//
// Mọi chỗ cần "tất cả HDV của đoàn" (chặn lịch Xếp HDV, mail booking, Word điều
// tour, người đứng tên phiếu quyết toán) đi qua đây — đừng tự ghép 2 cột cũ nữa,
// sẽ sót người thứ 3 trở đi.
//
// Bỏ trùng là bắt buộc: có đoàn nhập CÙNG một người vào hai ô. Người trùng giữ
// vai trò của ô đứng trước (chính > phụ > đi cùng).

export type VaiTroHdv = "chinh" | "phu" | "di_cung";

export interface DoanHdvIds {
  huong_dan_vien_id?: number | null;
  huong_dan_vien_id_2?: number | null;
  hdv_di_cung_ids?: readonly (number | null | undefined)[] | null;
}

const laId = (x: unknown): x is number =>
  typeof x === "number" && Number.isInteger(x) && x > 0;

/** id + vai trò từng HDV của đoàn, thứ tự chính → phụ → đi cùng, đã bỏ trùng. */
export function vaiTroHdvDoan(
  doan: DoanHdvIds | null | undefined,
): { id: number; vai_tro: VaiTroHdv }[] {
  if (!doan) return [];
  const nguon: [unknown, VaiTroHdv][] = [
    [doan.huong_dan_vien_id, "chinh"],
    [doan.huong_dan_vien_id_2, "phu"],
    ...(doan.hdv_di_cung_ids ?? []).map((id): [unknown, VaiTroHdv] => [id, "di_cung"]),
  ];
  const out: { id: number; vai_tro: VaiTroHdv }[] = [];
  const seen = new Set<number>();
  for (const [id, vai_tro] of nguon) {
    if (!laId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, vai_tro });
  }
  return out;
}

/** id HDV của đoàn, thứ tự chính → phụ → đi cùng, đã bỏ trùng. */
export function idsHdvDoan(doan: DoanHdvIds | null | undefined): number[] {
  return vaiTroHdvDoan(doan).map((x) => x.id);
}

/**
 * Tra thông tin HDV của đoàn trong `tatCa`, kèm vai trò. id không tra được
 * (HDV đã bị xoá khỏi danh mục — cột mảng không có FK) thì bỏ qua.
 */
export function danhSachHdvCoVaiTro<T extends { id: number }>(
  doan: DoanHdvIds | null | undefined,
  tatCa: readonly T[],
): (T & { vai_tro: VaiTroHdv })[] {
  const byId = new Map(tatCa.map((h) => [h.id, h]));
  const out: (T & { vai_tro: VaiTroHdv })[] = [];
  for (const { id, vai_tro } of vaiTroHdvDoan(doan)) {
    const h = byId.get(id);
    if (h) out.push({ ...h, vai_tro });
  }
  return out;
}

/**
 * Chuẩn hoá danh sách "HDV đi cùng" trước khi LƯU: bỏ giá trị rác, bỏ trùng, bỏ
 * người đã nằm ở ô chính/phụ (đổi HDV phụ sang một người đang ở danh sách đi
 * cùng thì người đó rời danh sách). Giữ nguyên thứ tự người dùng đã chọn.
 */
export function chuanHoaHdvDiCung(
  ids: readonly (number | null | undefined)[] | null | undefined,
  chinhId: number | null | undefined,
  phuId: number | null | undefined,
): number[] {
  const seen = new Set<number>();
  if (laId(chinhId)) seen.add(chinhId);
  if (laId(phuId)) seen.add(phuId);
  const out: number[] = [];
  for (const id of ids ?? []) {
    if (!laId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Hai danh sách id giống hệt nhau (cùng người, cùng thứ tự) — cho nhật ký sửa đoàn. */
export function cungDanhSachHdv(
  a: readonly number[] | null | undefined,
  b: readonly number[] | null | undefined,
): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((id, i) => id === y[i]);
}
