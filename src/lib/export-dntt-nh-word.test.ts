import { describe, it, expect } from "vitest";
import { calcNHEntryTotal } from "./export-dntt-nh-word";
import type { NHDocItem } from "./export-dntt-nh-word";

const item = (so_luong: number, don_gia: number, ck?: number): NHDocItem => ({
  so_luong,
  don_gia,
  chiet_khau_phan_tram: ck,
});

describe("calcNHEntryTotal", () => {
  it("cộng thành tiền các item (so_luong × don_gia)", () => {
    expect(calcNHEntryTotal([item(10, 200_000), item(2, 50_000)])).toBe(2_100_000);
  });

  it("trừ chiết khấu riêng từng dòng (main + extras)", () => {
    // dòng 1: 10×100k = 1.000.000, CK 10% → 900.000
    // dòng 2:  2×100k =   200.000, CK  5% → 190.000
    expect(calcNHEntryTotal([item(10, 100_000, 10), item(2, 100_000, 5)])).toBe(1_090_000);
  });

  it("dòng không có CK → giữ nguyên gross", () => {
    expect(calcNHEntryTotal([item(10, 100_000, 10), item(2, 100_000)])).toBe(1_100_000);
  });

  it("làm tròn chiết khấu (Mức A — round 1 lần/dòng)", () => {
    // 1×99.000, CK 10% → round(89.100) = 89.100
    expect(calcNHEntryTotal([item(1, 99_000, 10)])).toBe(89_100);
  });

  it("items rỗng → 0", () => {
    expect(calcNHEntryTotal([])).toBe(0);
  });
});
