import { describe, it, expect } from "vitest";
import { isXeLimousine, formatXeForEmail } from "./xe-email";

describe("isXeLimousine", () => {
  it("nhận diện LMS (mọi cách viết)", () => {
    expect(isXeLimousine("LMS 9C")).toBe(true);
    expect(isXeLimousine("KL LMS")).toBe(true);
    expect(isXeLimousine("LMS VIP THƯỢNG ĐỈNH")).toBe(true);
    expect(isXeLimousine("NTS LMS 11S")).toBe(true);
    expect(isXeLimousine("lms 9s")).toBe(true);
    expect(isXeLimousine("Limousine Dcar")).toBe(true);
    expect(isXeLimousine("Limo 7")).toBe(true);
  });

  it("xe thường / brand KHÔNG phải limo", () => {
    expect(isXeLimousine("29c")).toBe(false);
    expect(isXeLimousine("45c")).toBe(false);
    expect(isXeLimousine("Thường")).toBe(false);
    expect(isXeLimousine("Long Hiền")).toBe(false);
    expect(isXeLimousine("GALAXY")).toBe(false);
    expect(isXeLimousine("GRANDBIRD")).toBe(false);
    expect(isXeLimousine("LONG BEACH 45C")).toBe(false);
    expect(isXeLimousine("")).toBe(false);
    expect(isXeLimousine(null)).toBe(false);
  });
});

describe("formatXeForEmail", () => {
  it("LIMOUSINE: loại xe + số chỗ", () => {
    expect(formatXeForEmail("LMS 9C", 9)).toBe("LMS 9C (9 chỗ)");
    expect(formatXeForEmail("KL LMS", 29)).toBe("KL LMS (29 chỗ)");
    expect(formatXeForEmail("LMS VIP THƯỢNG ĐỈNH", 11)).toBe("LMS VIP THƯỢNG ĐỈNH (11 chỗ)");
  });

  it("LIMOUSINE thiếu so_cho → chỉ tên loại (số chỗ nằm trong tên)", () => {
    expect(formatXeForEmail("LMS 11S", null)).toBe("LMS 11S");
    expect(formatXeForEmail("LMS 9S", null)).toBe("LMS 9S");
  });

  it("THƯỜNG: chỉ số chỗ (bỏ tên loại/brand)", () => {
    expect(formatXeForEmail("Thường", 45)).toBe("45 chỗ");
    expect(formatXeForEmail("29c", 29)).toBe("29 chỗ");
    expect(formatXeForEmail("Long Hiền", 45)).toBe("45 chỗ");
    expect(formatXeForEmail("GRANDBIRD", 45)).toBe("45 chỗ");
    expect(formatXeForEmail(null, 16)).toBe("16 chỗ");
  });

  it("THƯỜNG thiếu so_cho → fallback tên loại (chứa số chỗ)", () => {
    expect(formatXeForEmail("45c", null)).toBe("45c");
    expect(formatXeForEmail("LONG BEACH 45C", null)).toBe("LONG BEACH 45C");
  });

  it("không có gì → —", () => {
    expect(formatXeForEmail(null, null)).toBe("—");
    expect(formatXeForEmail("", 0)).toBe("—");
  });

  it("so_cho ≤ 0 coi như thiếu", () => {
    expect(formatXeForEmail("Thường", 0)).toBe("Thường");
    expect(formatXeForEmail("LMS 9C", 0)).toBe("LMS 9C");
  });
});
