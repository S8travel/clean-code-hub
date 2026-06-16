import { describe, it, expect } from "vitest";
import {
  buildMovableList,
  validateReassignment,
  buildMappingPayload,
  type MovableBooking,
  type DayMealSlot,
  type Assignment,
} from "./remap-nha-hang";

// ── fixtures ──────────────────────────────────────────────────────────────────
const mb = (over: Partial<MovableBooking> & { booking_id: number }): MovableBooking => ({
  nha_hang_id: over.booking_id * 10,
  nha_hang_ten: `NH${over.booking_id}`,
  from_doan_ngay_id: 100 + over.booking_id,
  from_ngay_so: over.booking_id,
  from_bua: "trua",
  booking_status: "da_gui",
  has_extras: false,
  ...over,
});

const slot = (over: Partial<DayMealSlot> & { doan_ngay_id: number; bua: "trua" | "toi" }): DayMealSlot => ({
  ngay_so: over.doan_ngay_id - 100,
  occupied_by_booking_id: null,
  occupied_label: null,
  is_tau_ngay: false,
  assigned_nha_hang_id: null,
  ...over,
});

describe("buildMovableList", () => {
  it("T1 loại tàu ngày, giữ NH thường", () => {
    const out = buildMovableList([
      { ...mb({ booking_id: 1 }), is_tau_ngay: false },
      { ...mb({ booking_id: 2 }), is_tau_ngay: false },
      { ...mb({ booking_id: 3 }), is_tau_ngay: true },
    ]);
    expect(out.map((b) => b.booking_id)).toEqual([1, 2]);
  });

  it("T2 loại booking chưa chọn NH", () => {
    const out = buildMovableList([
      { ...mb({ booking_id: 1, nha_hang_id: null as unknown as number }), is_tau_ngay: false },
    ]);
    expect(out).toHaveLength(0);
  });

  it("T3 rỗng", () => {
    expect(buildMovableList([])).toEqual([]);
  });

  it("T4 loại booking đã hủy (da_huy)", () => {
    const out = buildMovableList([
      { ...mb({ booking_id: 1, booking_status: "da_gui" }), is_tau_ngay: false },
      { ...mb({ booking_id: 2, booking_status: "da_huy" }), is_tau_ngay: false },
    ]);
    expect(out.map((b) => b.booking_id)).toEqual([1]);
  });
});

describe("validateReassignment", () => {
  // Hoán vị A(ngày101 trưa) ↔ B(ngày102 trưa)
  const movable = [
    mb({ booking_id: 1, from_doan_ngay_id: 101, from_ngay_so: 1, from_bua: "trua" }),
    mb({ booking_id: 2, from_doan_ngay_id: 102, from_ngay_so: 2, from_bua: "trua" }),
  ];
  const slots = [
    slot({ doan_ngay_id: 101, bua: "trua", occupied_by_booking_id: 1, occupied_label: "NH1" }),
    slot({ doan_ngay_id: 101, bua: "toi" }),
    slot({ doan_ngay_id: 102, bua: "trua", occupied_by_booking_id: 2, occupied_label: "NH2" }),
    slot({ doan_ngay_id: 102, bua: "toi" }),
  ];

  it("V1 hoán vị thuần hợp lệ", () => {
    const a: Assignment[] = [
      { booking_id: 1, to_doan_ngay_id: 102, to_bua_an: "trua" },
      { booking_id: 2, to_doan_ngay_id: 101, to_bua_an: "trua" },
    ];
    expect(validateReassignment(movable, slots, a)).toEqual({ valid: true, errors: [] });
  });

  it("V2 đổi bữa cùng ngày (trưa→tối ô trống)", () => {
    const a: Assignment[] = [{ booking_id: 1, to_doan_ngay_id: 101, to_bua_an: "toi" }];
    expect(validateReassignment(movable, slots, a).valid).toBe(true);
  });

  it("V3 move sang ô trống", () => {
    const a: Assignment[] = [{ booking_id: 1, to_doan_ngay_id: 102, to_bua_an: "toi" }];
    expect(validateReassignment(movable, slots, a).valid).toBe(true);
  });

  it("V4 hai booking cùng đích → lỗi", () => {
    const a: Assignment[] = [
      { booking_id: 1, to_doan_ngay_id: 101, to_bua_an: "toi" },
      { booking_id: 2, to_doan_ngay_id: 101, to_bua_an: "toi" },
    ];
    const r = validateReassignment(movable, slots, a);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("Hai nhà hàng cùng xếp"))).toBe(true);
  });

  it("V5 ô đích bị booking khác (ngoài tập) chiếm → lỗi", () => {
    // booking 99 (không trong assignments) chiếm 102/toi
    const s = [...slots, slot({ doan_ngay_id: 102, bua: "toi", occupied_by_booking_id: 99, occupied_label: "NH99" })]
      .filter((x) => !(x.doan_ngay_id === 102 && x.bua === "toi" && x.occupied_by_booking_id === null));
    const a: Assignment[] = [{ booking_id: 1, to_doan_ngay_id: 102, to_bua_an: "toi" }];
    const r = validateReassignment(movable, s, a);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("không di chuyển"))).toBe(true);
  });

  it("V5b ô đích assignment-chưa-gửi (NH khác, không booking) → lỗi", () => {
    // 102/toi không booking nhưng đã gán NH 999 ở điều tour; booking 1 có nha_hang_id=10
    const s = slots.map((x) =>
      x.doan_ngay_id === 102 && x.bua === "toi" ? { ...x, assigned_nha_hang_id: 999 } : x,
    );
    const a: Assignment[] = [{ booking_id: 1, to_doan_ngay_id: 102, to_bua_an: "toi" }];
    const r = validateReassignment(movable, s, a);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("chưa gửi booking"))).toBe(true);
  });

  it("V5c ô đích assignment trùng đúng NH đang dời vào → KHÔNG chặn", () => {
    const s = slots.map((x) =>
      x.doan_ngay_id === 102 && x.bua === "toi" ? { ...x, assigned_nha_hang_id: 10 } : x,
    );
    const a: Assignment[] = [{ booking_id: 1, to_doan_ngay_id: 102, to_bua_an: "toi" }];
    expect(validateReassignment(movable, s, a).valid).toBe(true);
  });

  it("V6 ô đích là tàu ngày → lỗi", () => {
    const s = slots.map((x) =>
      x.doan_ngay_id === 101 && x.bua === "toi" ? { ...x, is_tau_ngay: true } : x,
    );
    const a: Assignment[] = [{ booking_id: 1, to_doan_ngay_id: 101, to_bua_an: "toi" }];
    const r = validateReassignment(movable, s, a);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("tàu ngày"))).toBe(true);
  });

  it("V7 booking có extras → lỗi", () => {
    const mv = movable.map((b) => (b.booking_id === 1 ? { ...b, has_extras: true } : b));
    const a: Assignment[] = [{ booking_id: 1, to_doan_ngay_id: 102, to_bua_an: "toi" }];
    const r = validateReassignment(mv, slots, a);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("chi phí phát sinh"))).toBe(true);
  });

  it("V8 bữa đích không hợp lệ → lỗi", () => {
    const a = [{ booking_id: 1, to_doan_ngay_id: 101, to_bua_an: "xxx" as "trua" }];
    expect(validateReassignment(movable, slots, a).valid).toBe(false);
  });

  it("V9 booking_id không thuộc movable → lỗi", () => {
    const a: Assignment[] = [{ booking_id: 999, to_doan_ngay_id: 101, to_bua_an: "trua" }];
    expect(validateReassignment(movable, slots, a).valid).toBe(false);
  });

  it("V10 ô đích không thuộc slots → lỗi", () => {
    const a: Assignment[] = [{ booking_id: 1, to_doan_ngay_id: 999, to_bua_an: "trua" }];
    expect(validateReassignment(movable, slots, a).valid).toBe(false);
  });
});

describe("buildMappingPayload", () => {
  const movable = [
    mb({ booking_id: 1, from_doan_ngay_id: 101, from_bua: "trua" }),
    mb({ booking_id: 2, from_doan_ngay_id: 102, from_bua: "trua" }),
  ];

  it("P1 giữ nguyên vị trí → loại", () => {
    const a: Assignment[] = [{ booking_id: 1, to_doan_ngay_id: 101, to_bua_an: "trua" }];
    expect(buildMappingPayload(movable, a)).toEqual([]);
  });

  it("P2 hoán vị → 2 item", () => {
    const a: Assignment[] = [
      { booking_id: 1, to_doan_ngay_id: 102, to_bua_an: "trua" },
      { booking_id: 2, to_doan_ngay_id: 101, to_bua_an: "trua" },
    ];
    expect(buildMappingPayload(movable, a)).toHaveLength(2);
  });

  it("P3 1 đổi + 1 giữ nguyên → 1 item", () => {
    const a: Assignment[] = [
      { booking_id: 1, to_doan_ngay_id: 102, to_bua_an: "toi" },
      { booking_id: 2, to_doan_ngay_id: 102, to_bua_an: "trua" },
    ];
    const out = buildMappingPayload(movable, a);
    expect(out).toEqual([{ booking_id: 1, to_doan_ngay_id: 102, to_bua_an: "toi" }]);
  });
});
