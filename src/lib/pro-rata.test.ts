import { describe, it, expect } from "vitest";
import { proRataInts } from "./pro-rata";

describe("proRataInts", () => {
  it("trả [] khi weights rỗng", () => {
    expect(proRataInts(1000, [])).toEqual([]);
  });

  it("1 weight → toàn bộ total", () => {
    expect(proRataInts(1_234_567, [1])).toEqual([1_234_567]);
  });

  it("chia 1.000.000 theo [3,2,5] → [300k, 200k, 500k]", () => {
    expect(proRataInts(1_000_000, [3, 2, 5])).toEqual([300_000, 200_000, 500_000]);
  });

  it("tổng kết quả LUÔN = round(total) — không drift (số lẻ)", () => {
    const r = proRataInts(1_000_001, [3, 2, 5]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(1_000_001);
  });

  it("largest-remainder: 10 chia 3 phần đều → [4,3,3]", () => {
    const r = proRataInts(10, [1, 1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(10);
    expect(r.sort((a, b) => b - a)).toEqual([4, 3, 3]);
  });

  it("weights all 0 → chia đều, tổng vẫn = total", () => {
    const r = proRataInts(100, [0, 0, 0]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.length).toBe(3);
  });

  it("total âm: vẫn giữ tổng (cho delta điều chỉnh giảm)", () => {
    const r = proRataInts(-1_000_000, [3, 2, 5]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(-1_000_000);
  });

  it("total âm lẻ: tổng = round(total)", () => {
    const r = proRataInts(-10, [1, 1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(-10);
  });

  it("total float → round trước khi chia", () => {
    const r = proRataInts(100.7, [1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(101); // round(100.7)=101
  });
});
