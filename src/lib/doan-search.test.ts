import { describe, it, expect } from "vitest";
import { normForSearch, doanMatchesSearch } from "./doan-search";

describe("normForSearch", () => {
  it("bỏ hết khoảng trắng + thường hóa", () => {
    expect(normForSearch("  HAN05JX 261008 SB ")).toBe("han05jx261008sb");
    expect(normForSearch(null)).toBe("");
  });
});

describe("doanMatchesSearch", () => {
  const g = { tenDoan: "HAN05JX261008SB", hdv: "Nguyễn Văn A", agent: "喜瑞旅遊", op: "Đào Ngọc Quý" };

  it("khớp mã đoàn dù dán kèm khoảng trắng đầu/cuối", () => {
    expect(doanMatchesSearch(g, "  HAN05JX261008SB ")).toBe(true);
  });
  it("khớp mã đoàn dù có khoảng trắng GIỮA (copy-paste)", () => {
    expect(doanMatchesSearch(g, "HAN05JX 261008SB")).toBe(true);
  });
  it("không phân biệt hoa thường", () => {
    expect(doanMatchesSearch(g, "han05jx261008sb")).toBe(true);
  });
  it("khớp theo HDV / agent / OP (bỏ cách + case, GIỮ dấu)", () => {
    expect(doanMatchesSearch(g, "nguyễn văn a")).toBe(true);
    expect(doanMatchesSearch(g, "đào ngọc quý")).toBe(true);
  });
  it("KHÔNG bỏ dấu tiếng Việt (chỉ xử lý khoảng trắng theo yêu cầu)", () => {
    expect(doanMatchesSearch(g, "nguyen van a")).toBe(false);
  });
  it("từ khóa rỗng / chỉ khoảng trắng → khớp hết", () => {
    expect(doanMatchesSearch(g, "")).toBe(true);
    expect(doanMatchesSearch(g, "   ")).toBe(true);
  });
  it("không khớp → false", () => {
    expect(doanMatchesSearch(g, "XYZ999")).toBe(false);
  });
  it("field null không gây lỗi", () => {
    expect(doanMatchesSearch({ tenDoan: null, hdv: null }, "abc")).toBe(false);
  });
});
