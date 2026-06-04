import { describe, it, expect } from "vitest";
import { applyVat, calcXeThanhTien, XE_VAT_DEFAULT } from "./xe-calc";

describe("applyVat", () => {
  it("VAT 8% mặc định", () => {
    expect(applyVat(1_000_000, 8)).toBe(1_080_000);
  });
  it("VAT 0% → giữ nguyên (dòng cũ)", () => {
    expect(applyVat(1_000_000, 0)).toBe(1_000_000);
  });
  it("VAT 10%", () => {
    expect(applyVat(2_500_000, 10)).toBe(2_750_000);
  });
  it("làm tròn về số nguyên đồng", () => {
    // 333_333 * 1.08 = 359_999.64 → 360_000
    expect(applyVat(333_333, 8)).toBe(360_000);
  });
  it("clamp đơn giá âm về 0", () => {
    expect(applyVat(-5000, 8)).toBe(0);
  });
  it("clamp VAT âm về 0", () => {
    expect(applyVat(1_000_000, -5)).toBe(1_000_000);
  });
  it("NaN → 0", () => {
    expect(applyVat(NaN, 8)).toBe(0);
    expect(applyVat(1_000_000, NaN)).toBe(1_000_000);
  });
});

describe("calcXeThanhTien", () => {
  it("SL × đơn giá đã VAT", () => {
    // 2 xe × (1_000_000 + 8%) = 2 × 1_080_000
    expect(calcXeThanhTien(2, 1_000_000, 8)).toBe(2_160_000);
  });
  it("VAT 0% (dòng cũ) — bằng SL × đơn giá", () => {
    expect(calcXeThanhTien(3, 1_500_000, 0)).toBe(4_500_000);
  });
  it("SL = 0 → 0", () => {
    expect(calcXeThanhTien(0, 1_000_000, 8)).toBe(0);
  });
  it("SL âm clamp về 0", () => {
    expect(calcXeThanhTien(-2, 1_000_000, 8)).toBe(0);
  });
});

describe("XE_VAT_DEFAULT", () => {
  it("mặc định 8", () => {
    expect(XE_VAT_DEFAULT).toBe(8);
  });
});
