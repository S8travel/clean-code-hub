import { describe, it, expect } from "vitest";
import { applyVat, calcXeThanhTien, XE_VAT_DEFAULT, resolveXeNccId } from "./xe-calc";

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

describe("resolveXeNccId", () => {
  const xe1 = { id: 51, nha_xe: { nha_cung_cap_id: 419 } };
  const xe2 = { id: 50, nha_xe: { nha_cung_cap_id: 426 } };

  it("dòng có nha_cung_cap_id → giữ nguyên (snapshot có chủ đích thắng)", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: 999, xe_id: 51 }, [xe1, xe2])).toBe(999);
  });

  it("dòng null + xe_id khớp xe 1 → NCC nhà xe master 1", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 51 }, [xe1, xe2])).toBe(419);
  });

  it("dòng null + xe_id khớp xe 2 → NCC nhà xe master 2", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 50 }, [xe1, xe2])).toBe(426);
  });

  it("dòng null + xe_id không khớp master nào → null", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 77 }, [xe1, xe2])).toBe(null);
  });

  it("dòng null + xe_id null → null", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: null }, [xe1, xe2])).toBe(null);
  });

  it("master thiếu nha_xe / nha_cung_cap_id → null", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 51 }, [{ id: 51, nha_xe: null }])).toBe(null);
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 51 }, [{ id: 51, nha_xe: { nha_cung_cap_id: null } }])).toBe(null);
  });

  it("master null/undefined trong mảng → bỏ qua an toàn", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 51 }, [null, undefined, xe1])).toBe(419);
  });
});
