import { describe, it, expect } from "vitest";
import { lumpCanTruCash } from "./can-tru-lump";

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe("lumpCanTruCash", () => {
  it("ca thường: dồn HẾT cấn trừ vào dòng đầu", () => {
    // 2 alloc, cấn trừ nhỏ hơn dòng đầu, không có cash
    const r = lumpCanTruCash([8_190_000, 2_835_000], 4_131_000, 0);
    expect(r).toEqual([
      { canTru: 4_131_000, cash: 0, choUNC: 4_059_000 },
      { canTru: 0, cash: 0, choUNC: 2_835_000 },
    ]);
    expect(sum(r.map((x) => x.canTru))).toBe(4_131_000);
    expect(sum(r.map((x) => x.choUNC))).toBe(6_894_000); // = 11.025.000 − 4.131.000
  });

  it("waterfall: tràn sang dòng kế khi dòng đầu không đủ chứa", () => {
    const r = lumpCanTruCash([1_000_000, 10_000_000], 5_000_000, 0);
    expect(r).toEqual([
      { canTru: 1_000_000, cash: 0, choUNC: 0 },
      { canTru: 4_000_000, cash: 0, choUNC: 6_000_000 },
    ]);
    expect(sum(r.map((x) => x.canTru))).toBe(5_000_000);
  });

  it("cấn trừ + tiền mặt: choUNC không âm, tổng khớp (chống bug clamp)", () => {
    // allocs [5M,5M], cấn trừ 4M (dồn dòng đầu), cash 4M
    const r = lumpCanTruCash([5_000_000, 5_000_000], 4_000_000, 4_000_000);
    expect(r).toEqual([
      { canTru: 4_000_000, cash: 1_000_000, choUNC: 0 },
      { canTru: 0, cash: 3_000_000, choUNC: 2_000_000 },
    ]);
    expect(r.every((x) => x.choUNC >= 0)).toBe(true);
    expect(sum(r.map((x) => x.choUNC))).toBe(2_000_000); // 10M − 4M − 4M
  });

  it("single-alloc: dồn toàn bộ vào dòng duy nhất (parity với non-gộp)", () => {
    expect(lumpCanTruCash([8_190_000], 540_000, 0)).toEqual([
      { canTru: 540_000, cash: 0, choUNC: 7_650_000 },
    ]);
  });

  it("cấn trừ vượt Σ alloc → clamp, không âm, không vượt", () => {
    const r = lumpCanTruCash([1_000_000, 2_000_000], 3_500_000, 0);
    expect(r).toEqual([
      { canTru: 1_000_000, cash: 0, choUNC: 0 },
      { canTru: 2_000_000, cash: 0, choUNC: 0 },
    ]);
    expect(sum(r.map((x) => x.canTru))).toBe(3_000_000); // = Σ alloc, KHÔNG phải 3.5M
  });

  it("lump bám DÒNG ĐẦU của mảng (caller phải truyền theo thứ tự hiển thị)", () => {
    // Nếu dòng nhỏ đứng trước, cấn trừ dồn dòng đó trước rồi tràn — đúng thứ tự truyền vào
    const r = lumpCanTruCash([2_835_000, 8_190_000], 4_131_000, 0);
    expect(r[0].canTru).toBe(2_835_000);
    expect(r[1].canTru).toBe(1_296_000);
    expect(sum(r.map((x) => x.canTru))).toBe(4_131_000);
  });
});
