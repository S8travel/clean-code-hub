import { describe, it, expect } from "vitest";
import { calcNHEntryTotal } from "./export-dntt-nh-word";
import type { NHDocItem } from "./export-dntt-nh-word";

const item = (so_luong: number, don_gia: number): NHDocItem => ({ so_luong, don_gia });

describe("calcNHEntryTotal", () => {
  it("cộng thành tiền các item (so_luong × don_gia)", () => {
    expect(calcNHEntryTotal([item(10, 200_000), item(2, 50_000)])).toBe(2_100_000);
  });

  it("không chiết khấu → tổng gross", () => {
    expect(calcNHEntryTotal([item(5, 100_000)], 0)).toBe(500_000);
  });

  it("chiết khấu chỉ áp item đầu (main row), extras không trừ CK", () => {
    // main 10×100k = 1.000.000, CK 10% = 100.000; extra 2×100k = 200.000 (không CK)
    // tổng = 1.000.000 − 100.000 + 200.000 = 1.100.000
    expect(calcNHEntryTotal([item(10, 100_000), item(2, 100_000)], 10)).toBe(1_100_000);
  });

  it("làm tròn chiết khấu", () => {
    // main 1×99.000, CK 10% = 9.900 → 89.100
    expect(calcNHEntryTotal([item(1, 99_000)], 10)).toBe(89_100);
  });

  it("items rỗng → 0", () => {
    expect(calcNHEntryTotal([])).toBe(0);
  });
});
