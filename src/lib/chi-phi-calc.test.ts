import { describe, it, expect } from "vitest";
import { applyChietKhau, calcNHThanhTien } from "./chi-phi-calc";

// ─── applyChietKhau ──────────────────────────────────────────────────────────

describe("applyChietKhau", () => {
  it("ck null → chỉ làm tròn truocCK", () => {
    expect(applyChietKhau(1_000_000, null)).toBe(1_000_000);
  });
  it("ck undefined → chỉ làm tròn truocCK", () => {
    expect(applyChietKhau(1_000_000, undefined)).toBe(1_000_000);
  });
  it("ck 0 → không giảm gì", () => {
    expect(applyChietKhau(1_000_000, 0)).toBe(1_000_000);
  });
  it("ck âm → coi như 0", () => {
    expect(applyChietKhau(1_000_000, -5)).toBe(1_000_000);
  });
  it("truocCK lẻ (FOC 0.5) → làm tròn về đồng nguyên", () => {
    expect(applyChietKhau(1_000_000.5, null)).toBe(1_000_001);
  });
  it("ck 10% trên 1.000.000 → 900.000", () => {
    expect(applyChietKhau(1_000_000, 10)).toBe(900_000);
  });
  it("ck 15% trên 2.850.000 → 2.422.500", () => {
    expect(applyChietKhau(2_850_000, 15)).toBe(2_422_500);
  });
  it("ck 100% → 0", () => {
    expect(applyChietKhau(1_000_000, 100)).toBe(0);
  });
  it("ck 7% trên 333 → round(309.69) = 310", () => {
    expect(applyChietKhau(333, 7)).toBe(310);
  });
  it("Mức A: ck 5% trên 10 → round(9.5) = 10 (cách 'trừ' cũ ra 9 — đã thống nhất)", () => {
    expect(applyChietKhau(10, 5)).toBe(10);
  });
  it("Mức A: 2 cách viết cho cùng kết quả (round 1 lần ở cuối)", () => {
    // Với mọi truocCK nguyên + ck nguyên: round(X×(1−ck/100)) phải khớp
    // cách tính dồn precision rồi round 1 lần. Kiểm vài giá trị 'lẻ'.
    for (const [x, ck] of [[10, 5], [333, 7], [12345, 13], [99999, 17]] as const) {
      expect(applyChietKhau(x, ck)).toBe(Math.round(x - (x * ck) / 100));
    }
  });
});

// ─── calcNHThanhTien ─────────────────────────────────────────────────────────

describe("calcNHThanhTien", () => {
  it("không FOC, không CK → soKhach × donGia", () => {
    expect(calcNHThanhTien(20, null, null, 150_000, null)).toBe(3_000_000);
  });
  it("có FOC, không CK: 20 khách 16免1 → 19 × 150.000", () => {
    expect(calcNHThanhTien(20, 16, 1, 150_000, null)).toBe(2_850_000);
  });
  it("không FOC, có CK 10%: 20 × 100.000 × 0.9", () => {
    expect(calcNHThanhTien(20, null, null, 100_000, 10)).toBe(1_800_000);
  });
  it("FOC + CK: 20 khách 16免1, đơn giá 100.000, CK 10% → 19×100k×0.9", () => {
    expect(calcNHThanhTien(20, 16, 1, 100_000, 10)).toBe(1_710_000);
  });
  it("CK 0 → bằng tiền trước CK", () => {
    expect(calcNHThanhTien(32, 16, 1, 200_000, 0)).toBe(calcNHThanhTien(32, 16, 1, 200_000, null));
  });
  it("số khách < focKhach → không trừ FOC", () => {
    expect(calcNHThanhTien(10, 16, 1, 100_000, null)).toBe(1_000_000);
  });
});
