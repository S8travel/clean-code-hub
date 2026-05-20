import { describe, it, expect } from "vitest";
import { parseVNNumber, isAmountMatch } from "./ocr-invoice";

describe("parseVNNumber — parse số VN với dấu nghìn / thập phân", () => {
  it("thousand sep '.' → integer", () => {
    expect(parseVNNumber("1.234.567")).toBe(1234567);
  });

  it("thousand sep ',' → integer", () => {
    expect(parseVNNumber("1,234,567")).toBe(1234567);
  });

  it("mixed: '.' thousand + ',' decimal → ưu tiên dấu cuối là decimal", () => {
    expect(parseVNNumber("1.234.567,89")).toBe(1234567.89);
  });

  it("mixed: ',' thousand + '.' decimal", () => {
    expect(parseVNNumber("1,234,567.89")).toBe(1234567.89);
  });

  it("1 dấu, sau ≤ 2 chữ số → decimal", () => {
    expect(parseVNNumber("100,5")).toBe(100.5);
  });

  it("số liền không dấu", () => {
    expect(parseVNNumber("1234567")).toBe(1234567);
  });

  it("chuỗi không có chữ số → null", () => {
    expect(parseVNNumber("abc")).toBeNull();
  });

  it("khoảng trắng giữa số → bị loại bỏ", () => {
    expect(parseVNNumber("1 234 567")).toBe(1234567);
  });
});

describe("isAmountMatch — so sánh số tiền với dung sai", () => {
  it("khớp tuyệt đối", () => {
    expect(isAmountMatch(1_000_000, 1_000_000)).toBe(true);
  });

  it("lệch 1₫ → khớp (rounding chấp nhận)", () => {
    expect(isAmountMatch(1_000_001, 1_000_000)).toBe(true);
  });

  it("lệch 4₫ trên 1000₫ (0.4%) → khớp (<0.5%)", () => {
    expect(isAmountMatch(1004, 1000)).toBe(true);
  });

  it("lệch 6₫ trên 1000₫ (0.6%) → KHÔNG khớp", () => {
    expect(isAmountMatch(1006, 1000)).toBe(false);
  });

  it("detected = null → KHÔNG khớp", () => {
    expect(isAmountMatch(null, 1000)).toBe(false);
  });

  it("expected = 0 (edge): chỉ khớp khi diff ≤ 1", () => {
    expect(isAmountMatch(0, 0)).toBe(true);
    expect(isAmountMatch(100, 0)).toBe(false);
  });
});
