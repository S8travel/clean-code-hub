// Dọn chi phí NH "mồ côi" sau khi đổi chương trình điều tour.
//
// Cascade NH trong use-dieu-tour dedupe theo (doan_id, ngay_so, mo_ta) — khi NH
// đổi sang ngày khác / thay bằng NH khác / bỏ bữa, dòng chi phí cũ ở (ngày, mo_ta)
// cũ không khớp nữa → cascade insert dòng mới mà KHÔNG ai xóa dòng cũ → double
// khi in Excel (dòng cũ vô hình trên UI vì use-nh-section match đúng mo_ta).
//
// Helpers thuần (không đụng DB) để unit test được. Key chuẩn: `${ngay_so}|${mo_ta}`.

export interface NgayMealLite {
  ngay_so: number;
  an_trua_nha_hang_id: number | null;
  an_toi_nha_hang_id: number | null;
}

export interface NhChiPhiLite {
  id: number;
  ngay_so: number | null;
  mo_ta: string | null;
}

// Main row do cascade tạo luôn có dạng `${ten NH} (trưa)` / `${ten NH} (tối)`.
// Extras (user thêm tay) có prefix `[trua] ` / `[toi] ` — KHÔNG đụng.
export function isMainNhMoTa(moTa: string | null): boolean {
  if (!moTa) return false;
  if (moTa.startsWith("[trua] ") || moTa.startsWith("[toi] ")) return false;
  return moTa.endsWith("(trưa)") || moTa.endsWith("(tối)");
}

export function nhMealKey(ngaySo: number, moTa: string): string {
  return `${ngaySo}|${moTa}`;
}

// Build tập key (ngày, mo_ta) hợp lệ từ chương trình hiện tại của MỌI nhóm
// (đoàn-nhóm merge chi phí cross-nhóm theo ngay_so + mo_ta).
// hasUnknownNh=true khi có bữa trỏ tới NH không còn trong catalog → caller phải
// BỎ QUA cleanup (không build được key → mọi dòng của NH đó sẽ bị coi nhầm là mồ côi).
export function buildExpectedNhKeys(
  days: NgayMealLite[],
  nhNameById: Map<number, string>,
): { keys: Set<string>; hasUnknownNh: boolean } {
  const keys = new Set<string>();
  let hasUnknownNh = false;
  for (const day of days) {
    const meals: Array<[number | null, string]> = [
      [day.an_trua_nha_hang_id, "trưa"],
      [day.an_toi_nha_hang_id, "tối"],
    ];
    for (const [nhId, bua] of meals) {
      if (!nhId) continue;
      const ten = nhNameById.get(nhId);
      if (!ten) {
        hasUnknownNh = true;
        continue;
      }
      keys.add(nhMealKey(day.ngay_so, `${ten} (${bua})`));
    }
  }
  return { keys, hasUnknownNh };
}

// Lọc các main row NH không còn khớp bữa nào trong chương trình hiện tại.
export function findOrphanNhChiPhi<T extends NhChiPhiLite>(
  rows: T[],
  expectedKeys: Set<string>,
): T[] {
  return rows.filter(
    (cp) =>
      cp.ngay_so != null &&
      isMainNhMoTa(cp.mo_ta) &&
      !expectedKeys.has(nhMealKey(cp.ngay_so, cp.mo_ta!)),
  );
}

// ── Guard "không gỡ NH đã trả khỏi chương trình" (backstop ở mutation) ──────
//
// doan_chi_phi KHÔNG lưu nha_hang_id — chỉ nối chương trình qua mo_ta (tên) +
// ngay_so + bữa. Nếu so khớp bằng TÊN, đổi tên NH trong danh mục sẽ bị chặn nhầm.
// Vì vậy guard so theo Ô BỮA CÒN NH HAY KHÔNG (ngay_so + trưa/tối), KHÔNG so tên:
//   - Đổi tên NH (id giữ nguyên) → ô vẫn còn NH → KHÔNG chặn (an toàn).
//   - Gỡ hẳn bữa / cắt mất ngày → ô trống → CHẶN.
//   - Đổi sang NH khác → ô vẫn còn NH → nút bấm DayRow đã chặn sẵn ở client.
// Key ô: `${ngay_so}|trưa` | `${ngay_so}|tối`.

export function mealSlotKey(ngaySo: number, bua: "trưa" | "tối"): string {
  return `${ngaySo}|${bua}`;
}

// Tập ô bữa CÓ nhà hàng trong chương trình (mọi nhóm).
export function buildOccupiedMealSlots(days: NgayMealLite[]): Set<string> {
  const s = new Set<string>();
  for (const d of days) {
    if (d.an_trua_nha_hang_id) s.add(mealSlotKey(d.ngay_so, "trưa"));
    if (d.an_toi_nha_hang_id) s.add(mealSlotKey(d.ngay_so, "tối"));
  }
  return s;
}

// Ô bữa của 1 main row NH chi phí (suy từ ngay_so + suffix mo_ta). null nếu không phải main row.
export function nhChiPhiSlot(ngaySo: number | null, moTa: string | null): string | null {
  if (ngaySo == null || !isMainNhMoTa(moTa)) return null;
  if (moTa!.endsWith("(trưa)")) return mealSlotKey(ngaySo, "trưa");
  if (moTa!.endsWith("(tối)")) return mealSlotKey(ngaySo, "tối");
  return null;
}

// Lọc các chi phí NH ĐÃ-TRẢ/có-ĐNTT mà ô bữa của nó KHÔNG còn NH nào trong
// chương trình mới → bị gỡ khỏi tour mà chưa hủy ĐNTT → caller throw chặn save.
export function findRemovedPaidNhChiPhi<T extends NhChiPhiLite>(
  paidRows: T[],
  occupiedSlots: Set<string>,
): T[] {
  return paidRows.filter((cp) => {
    const slot = nhChiPhiSlot(cp.ngay_so, cp.mo_ta);
    return slot != null && !occupiedSlots.has(slot);
  });
}
