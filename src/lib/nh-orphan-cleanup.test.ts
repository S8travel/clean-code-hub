import { describe, it, expect } from "vitest";
import {
  isMainNhMoTa,
  buildExpectedNhKeys,
  findOrphanNhChiPhi,
  buildOccupiedMealSlots,
  nhChiPhiSlot,
  findRemovedPaidNhChiPhi,
} from "./nh-orphan-cleanup";

const nhNames = new Map<number, string>([
  [1, "NGON THỊ HOA"],
  [2, "NGON PHỐ HỘI"],
  [3, "NĂM CHÂU SEAFOOD"],
]);

describe("isMainNhMoTa", () => {
  it("nhận main row (trưa)/(tối)", () => {
    expect(isMainNhMoTa("NGON THỊ HOA (trưa)")).toBe(true);
    expect(isMainNhMoTa("NGON PHỐ HỘI (tối)")).toBe(true);
  });
  it("bỏ qua extras prefix [trua]/[toi]", () => {
    expect(isMainNhMoTa("[trua] Suất trẻ em")).toBe(false);
    expect(isMainNhMoTa("[toi] HDV phát sinh (tối)")).toBe(false);
  });
  it("bỏ qua mo_ta rỗng / null / không đúng format", () => {
    expect(isMainNhMoTa("")).toBe(false);
    expect(isMainNhMoTa(null)).toBe(false);
    expect(isMainNhMoTa("Ăn tối tự do")).toBe(false);
  });
});

describe("buildExpectedNhKeys", () => {
  it("build key cho mọi bữa có NH", () => {
    const { keys, hasUnknownNh } = buildExpectedNhKeys(
      [
        { ngay_so: 1, an_trua_nha_hang_id: 1, an_toi_nha_hang_id: 2 },
        { ngay_so: 2, an_trua_nha_hang_id: null, an_toi_nha_hang_id: 3 },
      ],
      nhNames,
    );
    expect(hasUnknownNh).toBe(false);
    expect(keys).toEqual(
      new Set([
        "1|NGON THỊ HOA (trưa)",
        "1|NGON PHỐ HỘI (tối)",
        "2|NĂM CHÂU SEAFOOD (tối)",
      ]),
    );
  });
  it("flag hasUnknownNh khi NH không còn trong catalog", () => {
    const { hasUnknownNh } = buildExpectedNhKeys(
      [{ ngay_so: 1, an_trua_nha_hang_id: 99, an_toi_nha_hang_id: null }],
      nhNames,
    );
    expect(hasUnknownNh).toBe(true);
  });
});

describe("findOrphanNhChiPhi", () => {
  const expected = new Set([
    "2|NGON THỊ HOA (trưa)",
    "3|NGON PHỐ HỘI (tối)",
  ]);

  it("NH đổi ngày → dòng ở ngày cũ là orphan", () => {
    const rows = [
      { id: 10, ngay_so: 1, mo_ta: "NGON THỊ HOA (trưa)" }, // cũ: ngày 1 → giờ ngày 2
      { id: 11, ngay_so: 2, mo_ta: "NGON THỊ HOA (trưa)" }, // đúng chương trình
    ];
    expect(findOrphanNhChiPhi(rows, expected).map((r) => r.id)).toEqual([10]);
  });

  it("NH bị bỏ khỏi chương trình → orphan", () => {
    const rows = [{ id: 20, ngay_so: 5, mo_ta: "NĂM CHÂU SEAFOOD (tối)" }];
    expect(findOrphanNhChiPhi(rows, expected).map((r) => r.id)).toEqual([20]);
  });

  it("chương trình không đổi → không có orphan", () => {
    const rows = [
      { id: 30, ngay_so: 2, mo_ta: "NGON THỊ HOA (trưa)" },
      { id: 31, ngay_so: 3, mo_ta: "NGON PHỐ HỘI (tối)" },
    ];
    expect(findOrphanNhChiPhi(rows, expected)).toEqual([]);
  });

  it("extras và mo_ta lạ không bao giờ bị coi là orphan", () => {
    const rows = [
      { id: 40, ngay_so: 9, mo_ta: "[trua] Suất trẻ em" },
      { id: 41, ngay_so: 9, mo_ta: "[toi] Lẩu thêm (tối)" },
      { id: 42, ngay_so: 9, mo_ta: "" },
      { id: 43, ngay_so: null, mo_ta: "NGON THỊ HOA (trưa)" },
    ];
    expect(findOrphanNhChiPhi(rows, expected)).toEqual([]);
  });
});

describe("buildOccupiedMealSlots", () => {
  it("đánh dấu ô bữa có NH (bỏ qua null)", () => {
    const slots = buildOccupiedMealSlots([
      { ngay_so: 1, an_trua_nha_hang_id: 1, an_toi_nha_hang_id: 2 },
      { ngay_so: 2, an_trua_nha_hang_id: null, an_toi_nha_hang_id: 3 },
      { ngay_so: 3, an_trua_nha_hang_id: null, an_toi_nha_hang_id: null },
    ]);
    expect(slots).toEqual(new Set(["1|trưa", "1|tối", "2|tối"]));
  });
});

describe("nhChiPhiSlot", () => {
  it("suy ô bữa từ ngay_so + suffix", () => {
    expect(nhChiPhiSlot(4, "Anh Hòa (tối)")).toBe("4|tối");
    expect(nhChiPhiSlot(2, "NGON THỊ HOA (trưa)")).toBe("2|trưa");
  });
  it("trả null cho extras / mo_ta lạ / ngay_so null", () => {
    expect(nhChiPhiSlot(9, "[toi] Lẩu thêm (tối)")).toBeNull();
    expect(nhChiPhiSlot(9, "Ăn tự do")).toBeNull();
    expect(nhChiPhiSlot(null, "Anh Hòa (tối)")).toBeNull();
  });
});

describe("findRemovedPaidNhChiPhi", () => {
  // Chương trình mới: ngày 4 trưa còn NH, ngày 4 tối ĐÃ GỠ (trống)
  const occupied = new Set(["4|trưa"]);

  it("bữa đã trả bị gỡ (ô trống) → bị bắt", () => {
    const paid = [{ id: 3146, ngay_so: 4, mo_ta: "Anh Hòa (tối)" }];
    expect(findRemovedPaidNhChiPhi(paid, occupied).map((r) => r.id)).toEqual([3146]);
  });

  it("đổi TÊN nhưng ô vẫn còn NH → KHÔNG chặn (rename-safe)", () => {
    // chi phí tên cũ 'BAY TÔN ĐẢN (trưa)' nhưng ô 4|trưa vẫn có NH (đã đổi tên)
    const paid = [{ id: 1952, ngay_so: 4, mo_ta: "BAY TÔN ĐẢN (trưa)" }];
    expect(findRemovedPaidNhChiPhi(paid, occupied)).toEqual([]);
  });

  it("đổi sang NH KHÁC (ô vẫn còn NH) → backstop bỏ qua, để nút bấm chặn", () => {
    const paid = [{ id: 99, ngay_so: 4, mo_ta: "NH cũ (trưa)" }];
    expect(findRemovedPaidNhChiPhi(paid, occupied)).toEqual([]);
  });

  it("extras đã trả không bị bắt (không phải main slot)", () => {
    const paid = [{ id: 50, ngay_so: 4, mo_ta: "[toi] HDV phát sinh (tối)" }];
    expect(findRemovedPaidNhChiPhi(paid, occupied)).toEqual([]);
  });
});
