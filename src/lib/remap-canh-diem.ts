// Pure helpers cho phần "Cảnh điểm / Dịch vụ" của modal "Xếp lại theo ngày" (remap CD).
// KHÔNG đụng DB → unit test được. Cảnh điểm dời tới NGÀY (không có bữa). Ràng buộc:
// doan_ngay_item UNIQUE(doan_ngay_id, canh_diem_id) → 1 cảnh điểm tối đa 1 lần/ngày.

export interface MovableItem {
  item_id: number;            // doan_ngay_item.id (danh tính ổn định)
  canh_diem_id: number;
  canh_diem_ten: string;
  from_doan_ngay_id: number;
  from_ngay_so: number;
  is_dv: boolean;             // canh_diem.loai='dich_vu' → có booking DV (chỉ cảnh báo)
  has_extras: boolean;        // có chi phí phát sinh [dvps_<cp_id>] → chặn (V1)
}

// Mọi item trên chương trình (kể cả non-co_phi) — để kiểm va UNIQUE(ngày, cảnh điểm).
export interface ItemSlot {
  item_id: number;
  canh_diem_id: number;
  doan_ngay_id: number;
}

export interface DayRef {
  doan_ngay_id: number;
  ngay_so: number;
}

export interface CdAssignment {
  item_id: number;
  to_doan_ngay_id: number;
}

export interface CdMappingItem {
  item_id: number;
  to_doan_ngay_id: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Validate xếp lại cảnh điểm (defense-in-depth, RPC cũng tự kiểm):
//  - target day hợp lệ
//  - sau khi dời, KHÔNG ngày nào có 1 cảnh điểm 2 lần (va UNIQUE) — xét MỌI item
//  - item dời mà có extras → chặn (V1)
export function validateCdReassignment(
  movable: MovableItem[],
  allItems: ItemSlot[],
  days: DayRef[],
  assignments: CdAssignment[],
): ValidationResult {
  const errors: string[] = [];
  const movableById = new Map(movable.map((m) => [m.item_id, m]));
  const dayByIdNgaySo = new Map(days.map((d) => [d.doan_ngay_id, d.ngay_so]));
  const assignById = new Map(assignments.map((a) => [a.item_id, a.to_doan_ngay_id]));

  // vị trí cuối: item dời → ngày đích; còn lại → ngày hiện tại
  const finalDay = (it: ItemSlot) => assignById.get(it.item_id) ?? it.doan_ngay_id;

  // R1: target day hợp lệ + R3 extras (chỉ cho item THỰC SỰ dời)
  for (const a of assignments) {
    const m = movableById.get(a.item_id);
    if (!m) { errors.push(`Mục ${a.item_id} không thuộc danh sách xếp lại`); continue; }
    const moved = m.from_doan_ngay_id !== a.to_doan_ngay_id;
    if (!moved) continue;
    if (!dayByIdNgaySo.has(a.to_doan_ngay_id)) {
      errors.push(`Ngày đích của "${m.canh_diem_ten}" không hợp lệ`);
    }
    if (m.has_extras) {
      errors.push(`"${m.canh_diem_ten}" có chi phí phát sinh — xử lý tay trước khi xếp lại`);
    }
  }

  // R2: va UNIQUE(ngày, cảnh điểm) ở trạng thái cuối — xét mọi item
  const seen = new Map<string, number>(); // key → canh_diem_id (để báo tên)
  const cdTenById = new Map(movable.map((m) => [m.canh_diem_id, m.canh_diem_ten]));
  for (const it of allItems) {
    const key = `${finalDay(it)}|${it.canh_diem_id}`;
    if (seen.has(key)) {
      const ngaySo = dayByIdNgaySo.get(finalDay(it));
      const ten = cdTenById.get(it.canh_diem_id) ?? `cảnh điểm #${it.canh_diem_id}`;
      errors.push(`Ngày ${ngaySo ?? finalDay(it)} bị trùng cảnh điểm "${ten}" — chọn ngày khác`);
    }
    seen.set(key, it.canh_diem_id);
  }

  return { valid: errors.length === 0, errors };
}

// Chỉ build cho assignment THỰC SỰ đổi ngày (bỏ giữ nguyên) → payload tối thiểu.
export function buildCdMappingPayload(
  movable: MovableItem[],
  assignments: CdAssignment[],
): CdMappingItem[] {
  const movableById = new Map(movable.map((m) => [m.item_id, m]));
  const out: CdMappingItem[] = [];
  for (const a of assignments) {
    const m = movableById.get(a.item_id);
    if (!m) continue;
    if (m.from_doan_ngay_id === a.to_doan_ngay_id) continue;
    out.push({ item_id: a.item_id, to_doan_ngay_id: a.to_doan_ngay_id });
  }
  return out;
}

// Có dịch vụ (DV) trong tập dời → cần cảnh báo cập nhật ngày với NCC.
export function hasMovedDv(movable: MovableItem[], payload: CdMappingItem[]): boolean {
  const movedIds = new Set(payload.map((p) => p.item_id));
  return movable.some((m) => m.is_dv && movedIds.has(m.item_id));
}
