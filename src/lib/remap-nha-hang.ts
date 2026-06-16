// Pure helpers cho modal "Xếp lại nhà hàng theo ngày" (remap NH). KHÔNG đụng DB →
// unit test được. Suffix mo_ta CÓ DẤU khớp DB ("(trưa)" / "(tối)"); xem nh-orphan-cleanup.ts.

export type BuaAn = "trua" | "toi";

export function buaLabel(b: BuaAn): string {
  return b === "trua" ? "trưa" : "tối";
}

export interface MovableBooking {
  booking_id: number;
  nha_hang_id: number;
  nha_hang_ten: string;        // tên hiện tại (chỉ để hiển thị)
  from_doan_ngay_id: number;
  from_ngay_so: number;
  from_bua: BuaAn;
  booking_status: string;
  has_extras: boolean;         // ô nguồn có chi phí [trua]/[toi]? → chặn ở client (V1)
}

export interface DayMealSlot {
  doan_ngay_id: number;
  ngay_so: number;
  bua: BuaAn;
  occupied_by_booking_id: number | null; // booking đang chiếm ô (NH thường hoặc tàu ngày)
  occupied_label: string | null;         // tên NH/tàu đang chiếm (hiển thị)
  is_tau_ngay: boolean;                   // ô bị tàu ngày chiếm → không cho làm đích
  // NH gán ở Điều tour (doan_ngay.an_*_nha_hang_id) — có thể CÓ dù chưa có booking row.
  // Dùng để chặn ghi đè âm thầm assignment-chưa-gửi (khớp guard 4e của RPC).
  assigned_nha_hang_id: number | null;
}

export interface Assignment {
  booking_id: number;
  to_doan_ngay_id: number;
  to_bua_an: BuaAn;
}

export interface RemapMappingItem {
  booking_id: number;
  to_doan_ngay_id: number;
  to_bua_an: BuaAn;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[]; // tiếng Việt, hiển thị realtime
}

// Lọc booking được phép remap: loại tàu ngày + booking chưa chọn NH + booking đã hủy
// (da_huy là soft-delete còn row — remap nó vô nghĩa và lệch nghiệp vụ "không hủy NH nào").
export function buildMovableList(
  raw: Array<MovableBooking & { is_tau_ngay: boolean }>,
): MovableBooking[] {
  return raw
    .filter((b) => !b.is_tau_ngay && b.nha_hang_id != null && b.booking_status !== "da_huy")
    .map(({ is_tau_ngay: _omit, ...b }) => b);
}

// Luật validate (defense-in-depth, RPC cũng tự kiểm lại):
//  R1 booking ∈ movable · R2 bữa hợp lệ · R3 ô đích ∈ slots · R4 ô đích không tàu ngày
//  R5 targets phân biệt · R6 ô đích không bị booking-khác (ngoài tập di chuyển) chiếm
//  R7 booking có extras → chặn (V1)
export function validateReassignment(
  movable: MovableBooking[],
  slots: DayMealSlot[],
  assignments: Assignment[],
): ValidationResult {
  const errors: string[] = [];
  const movableById = new Map(movable.map((b) => [b.booking_id, b]));
  const slotByKey = new Map(slots.map((s) => [`${s.doan_ngay_id}|${s.bua}`, s]));
  const assignedBookingIds = new Set(assignments.map((a) => a.booking_id));
  const seenTargets = new Set<string>();

  for (const a of assignments) {
    const b = movableById.get(a.booking_id);
    if (!b) { errors.push(`Booking ${a.booking_id} không thuộc danh sách xếp lại`); continue; } // R1
    if (a.to_bua_an !== "trua" && a.to_bua_an !== "toi") {                                       // R2
      errors.push(`Bữa đích không hợp lệ cho "${b.nha_hang_ten}"`); continue;
    }
    // Chỉ xét các luật ô-đích cho dòng THỰC SỰ đổi ô (khớp phạm vi RPC: chỉ kiểm dòng
    // trong mapping). Dòng giữ nguyên vị trí không gửi lên RPC → không chặn.
    const moved = b.from_doan_ngay_id !== a.to_doan_ngay_id || b.from_bua !== a.to_bua_an;
    if (!moved) continue;
    if (b.has_extras) {                                                                          // R7
      errors.push(`"${b.nha_hang_ten}" có chi phí phát sinh — xử lý tay trước khi xếp lại`);
    }
    const key = `${a.to_doan_ngay_id}|${a.to_bua_an}`;
    const slot = slotByKey.get(key);
    if (!slot) { errors.push(`Ô đích của "${b.nha_hang_ten}" không hợp lệ`); continue; }         // R3
    if (slot.is_tau_ngay) {                                                                      // R4
      errors.push(`Ô đích (ngày ${slot.ngay_so}, ${buaLabel(a.to_bua_an)}) đang là tàu ngày`);
    }
    if (seenTargets.has(key)) {                                                                  // R5
      errors.push(`Hai nhà hàng cùng xếp vào ô (ngày ${slot.ngay_so}, ${buaLabel(a.to_bua_an)})`);
    }
    seenTargets.add(key);
    if (                                                                                         // R6: ô có booking khác (ngoài tập) chiếm
      slot.occupied_by_booking_id != null &&
      !assignedBookingIds.has(slot.occupied_by_booking_id)
    ) {
      errors.push(
        `Ô đích (ngày ${slot.ngay_so}, ${buaLabel(a.to_bua_an)}) đang có "${slot.occupied_label}" không di chuyển`,
      );
    } else if (                                                                                  // R6b: ô assignment-chưa-gửi (NH khác), không booking → ghi đè mất → chặn
      slot.occupied_by_booking_id == null &&
      slot.assigned_nha_hang_id != null &&
      slot.assigned_nha_hang_id !== b.nha_hang_id
    ) {
      errors.push(
        `Ô đích (ngày ${slot.ngay_so}, ${buaLabel(a.to_bua_an)}) đã chọn NH ở Điều tour nhưng chưa gửi booking — xử lý tay trước`,
      );
    }
  }
  return { valid: errors.length === 0, errors };
}

// Chỉ build cho assignment THỰC SỰ đổi ô (bỏ qua giữ nguyên) → payload tối thiểu.
export function buildMappingPayload(
  movable: MovableBooking[],
  assignments: Assignment[],
): RemapMappingItem[] {
  const movableById = new Map(movable.map((b) => [b.booking_id, b]));
  const out: RemapMappingItem[] = [];
  for (const a of assignments) {
    const b = movableById.get(a.booking_id);
    if (!b) continue;
    const unchanged = b.from_doan_ngay_id === a.to_doan_ngay_id && b.from_bua === a.to_bua_an;
    if (unchanged) continue;
    out.push({
      booking_id: a.booking_id,
      to_doan_ngay_id: a.to_doan_ngay_id,
      to_bua_an: a.to_bua_an,
    });
  }
  return out;
}
