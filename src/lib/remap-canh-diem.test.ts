import { describe, it, expect } from "vitest";
import {
  validateCdReassignment,
  buildCdMappingPayload,
  hasMovedDv,
  type MovableItem,
  type ItemSlot,
  type DayRef,
  type CdAssignment,
} from "./remap-canh-diem";

const mi = (over: Partial<MovableItem> & { item_id: number; canh_diem_id: number }): MovableItem => ({
  canh_diem_ten: `CD${over.canh_diem_id}`,
  from_doan_ngay_id: 100 + over.item_id,
  from_ngay_so: over.item_id,
  is_dv: false,
  has_extras: false,
  ...over,
});

const days: DayRef[] = [
  { doan_ngay_id: 101, ngay_so: 1 },
  { doan_ngay_id: 102, ngay_so: 2 },
  { doan_ngay_id: 103, ngay_so: 3 },
];

describe("validateCdReassignment", () => {
  // item 1 (CD 50) ở ngày 101; item 2 (CD 60) ở ngày 102
  const movable = [
    mi({ item_id: 1, canh_diem_id: 50, from_doan_ngay_id: 101, from_ngay_so: 1 }),
    mi({ item_id: 2, canh_diem_id: 60, from_doan_ngay_id: 102, from_ngay_so: 2 }),
  ];
  const allItems: ItemSlot[] = [
    { item_id: 1, canh_diem_id: 50, doan_ngay_id: 101 },
    { item_id: 2, canh_diem_id: 60, doan_ngay_id: 102 },
  ];

  it("dời sang ngày trống hợp lệ", () => {
    const a: CdAssignment[] = [{ item_id: 1, to_doan_ngay_id: 103 }];
    expect(validateCdReassignment(movable, allItems, days, a)).toEqual({ valid: true, errors: [] });
  });

  it("swap 2 cảnh điểm khác nhau hợp lệ", () => {
    const a: CdAssignment[] = [
      { item_id: 1, to_doan_ngay_id: 102 },
      { item_id: 2, to_doan_ngay_id: 101 },
    ];
    expect(validateCdReassignment(movable, allItems, days, a).valid).toBe(true);
  });

  it("dời tới ngày đã có cảnh điểm đó (item non-moving) → lỗi va UNIQUE", () => {
    // ngày 103 đã có item 9 cùng canh_diem 50 (không di chuyển)
    const all = [...allItems, { item_id: 9, canh_diem_id: 50, doan_ngay_id: 103 }];
    const a: CdAssignment[] = [{ item_id: 1, to_doan_ngay_id: 103 }];
    const r = validateCdReassignment(movable, all, days, a);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("trùng cảnh điểm"))).toBe(true);
  });

  it("2 mục cùng cảnh điểm xếp cùng ngày → lỗi", () => {
    // item 1 (CD50) và item 3 (CD50 ở ngày khác) cùng dời về ngày 103
    const mv = [...movable, mi({ item_id: 3, canh_diem_id: 50, from_doan_ngay_id: 102 })];
    const all: ItemSlot[] = [
      { item_id: 1, canh_diem_id: 50, doan_ngay_id: 101 },
      { item_id: 3, canh_diem_id: 50, doan_ngay_id: 102 },
    ];
    const a: CdAssignment[] = [
      { item_id: 1, to_doan_ngay_id: 103 },
      { item_id: 3, to_doan_ngay_id: 103 },
    ];
    expect(validateCdReassignment(mv, all, days, a).valid).toBe(false);
  });

  it("item có extras → lỗi", () => {
    const mv = movable.map((m) => (m.item_id === 1 ? { ...m, has_extras: true } : m));
    const a: CdAssignment[] = [{ item_id: 1, to_doan_ngay_id: 103 }];
    const r = validateCdReassignment(mv, allItems, days, a);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("chi phí phát sinh"))).toBe(true);
  });

  it("ngày đích không hợp lệ → lỗi", () => {
    const a: CdAssignment[] = [{ item_id: 1, to_doan_ngay_id: 999 }];
    expect(validateCdReassignment(movable, allItems, days, a).valid).toBe(false);
  });
});

describe("buildCdMappingPayload", () => {
  const movable = [
    mi({ item_id: 1, canh_diem_id: 50, from_doan_ngay_id: 101 }),
    mi({ item_id: 2, canh_diem_id: 60, from_doan_ngay_id: 102 }),
  ];

  it("giữ nguyên → loại", () => {
    expect(buildCdMappingPayload(movable, [{ item_id: 1, to_doan_ngay_id: 101 }])).toEqual([]);
  });

  it("dời → giữ", () => {
    const out = buildCdMappingPayload(movable, [
      { item_id: 1, to_doan_ngay_id: 103 },
      { item_id: 2, to_doan_ngay_id: 102 },
    ]);
    expect(out).toEqual([{ item_id: 1, to_doan_ngay_id: 103 }]);
  });
});

describe("hasMovedDv", () => {
  it("true khi có DV trong tập dời", () => {
    const movable = [mi({ item_id: 1, canh_diem_id: 50, is_dv: true })];
    expect(hasMovedDv(movable, [{ item_id: 1, to_doan_ngay_id: 103 }])).toBe(true);
  });
  it("false khi DV không dời", () => {
    const movable = [mi({ item_id: 1, canh_diem_id: 50, is_dv: true })];
    expect(hasMovedDv(movable, [])).toBe(false);
  });
});
