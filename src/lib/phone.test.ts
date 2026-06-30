import { describe, it, expect } from "vitest";
import { normalizePhone, phonesMatch } from "./phone";

describe("normalizePhone", () => {
  it("null / undefined / rỗng → ''", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
    expect(normalizePhone("")).toBe("");
  });
  it("bỏ khoảng trắng, dấu gạch, dấu ngoặc, dấu chấm", () => {
    expect(normalizePhone("098 123 4567")).toBe("0981234567");
    expect(normalizePhone("098-123-4567")).toBe("0981234567");
    expect(normalizePhone("(098) 123.4567")).toBe("0981234567");
  });
  it("giữ số trong tiền tố quốc tế +886 (khớp DB regexp [^0-9])", () => {
    expect(normalizePhone("(+886) 0921054768")).toBe("8860921054768");
  });
  it("toàn ký tự lạ → ''", () => {
    expect(normalizePhone("mmm")).toBe("");
    expect(normalizePhone("---")).toBe("");
  });
});

describe("phonesMatch", () => {
  it("cùng số sau normalize → true", () => {
    expect(phonesMatch("0981234567", "098 123 4567")).toBe(true);
    expect(phonesMatch("(+886)0921054768", "886 0921 054 768")).toBe(true);
  });
  it("khác số → false", () => {
    expect(phonesMatch("0981234567", "0964256588")).toBe(false);
  });
  it("một/both rỗng → false (KHÔNG gộp khách thiếu SĐT)", () => {
    expect(phonesMatch("", "")).toBe(false);
    expect(phonesMatch(null, null)).toBe(false);
    expect(phonesMatch("0981234567", "")).toBe(false);
    expect(phonesMatch("mmm", "xyz")).toBe(false);
  });
});
