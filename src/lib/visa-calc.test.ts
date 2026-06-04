import { describe, it, expect } from "vitest";
import { computeVisaVnd } from "./visa-calc";

describe("computeVisaVnd", () => {
  it("quy đổi 1 đơn vị: ĐG_raw × tỷ giá, không CK", () => {
    expect(computeVisaVnd(1, 50, 25_000, 0)).toBe(1_250_000);
  });
  it("chiết khấu trừ TRÊN MỖI đơn vị rồi mới nhân số lượng", () => {
    // net/đơn vị = 50×25000 − 250000 = 1.000.000; ×3 = 3.000.000
    expect(computeVisaVnd(3, 50, 25_000, 250_000)).toBe(3_000_000);
  });
  it("CK vượt gross → clamp 0 (không âm)", () => {
    expect(computeVisaVnd(2, 10, 25_000, 9_999_999)).toBe(0);
  });
  it("tỷ giá 0 → gross 0 → kết quả 0", () => {
    expect(computeVisaVnd(5, 100, 0, 0)).toBe(0);
  });
  it("làm tròn về số nguyên VND", () => {
    // 33.33 × 1 × 1 = 33.33 → round 33
    expect(computeVisaVnd(1, 33.33, 1, 0)).toBe(33);
    expect(computeVisaVnd(3, 10.5, 1, 0)).toBe(32); // 31.5 → round 32
  });
  it("số lượng > 1 nhân đúng", () => {
    expect(computeVisaVnd(10, 20, 25_000, 0)).toBe(5_000_000);
  });
});
