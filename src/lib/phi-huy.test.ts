import { describe, it, expect } from "vitest";
import { calcPhiHuySurplus } from "./phi-huy";

describe("calcPhiHuySurplus", () => {
  it("phí hủy 50% đã trả (KS hủy, thực tế 0) → hoàn nửa, thực tế = phí hủy", () => {
    const r = calcPhiHuySurplus({ sumActual: 0, sumPaid: 40_680_000, phiHuy: 20_340_000 });
    expect(r.phiHuy).toBe(20_340_000);
    expect(r.refund).toBe(20_340_000);
    expect(r.newActual).toBe(20_340_000);
  });

  it("phí hủy = 0 → hoàn toàn bộ phần thừa (hành vi cũ)", () => {
    const r = calcPhiHuySurplus({ sumActual: 0, sumPaid: 40_680_000, phiHuy: 0 });
    expect(r.refund).toBe(40_680_000);
    expect(r.newActual).toBe(0);
  });

  it("phí hủy = toàn bộ phần thừa → refund 0 (NCC giữ hết, mất trắng)", () => {
    const r = calcPhiHuySurplus({ sumActual: 0, sumPaid: 40_680_000, phiHuy: 40_680_000 });
    expect(r.refund).toBe(0);
    expect(r.newActual).toBe(40_680_000);
  });

  it("kẹp: phí hủy vượt phần thừa → clamp về absDelta, refund 0", () => {
    const r = calcPhiHuySurplus({ sumActual: 10_000_000, sumPaid: 30_000_000, phiHuy: 999_999_999 });
    expect(r.absDelta).toBe(20_000_000);
    expect(r.phiHuy).toBe(20_000_000);
    expect(r.refund).toBe(0);
    expect(r.newActual).toBe(30_000_000);
  });

  it("đã điều chỉnh trước (thực tế > 0) → phí hủy cộng lên thực tế cũ", () => {
    const r = calcPhiHuySurplus({ sumActual: 5_000_000, sumPaid: 30_000_000, phiHuy: 8_000_000 });
    expect(r.absDelta).toBe(25_000_000);
    expect(r.refund).toBe(17_000_000);
    expect(r.newActual).toBe(13_000_000);
  });

  it("net khớp: đã trả − refund = newActual", () => {
    const r = calcPhiHuySurplus({ sumActual: 3_000_000, sumPaid: 50_000_000, phiHuy: 12_000_000 });
    expect(50_000_000 - r.refund).toBe(r.newActual);
  });
});
