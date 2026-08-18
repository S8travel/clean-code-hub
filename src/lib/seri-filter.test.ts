import { describe, it, expect } from "vitest";
import { boDauSeri, locSeri } from "./seri-filter";

describe("boDauSeri", () => {
  it("bỏ dấu + hạ chữ thường", () => {
    expect(boDauSeri("Đài Loan 5N4Đ")).toBe("dai loan 5n4d");
    expect(boDauSeri("Đà nẵng - Huế")).toBe("da nang - hue");
  });
  it("giữ nguyên chữ Hán, xử lý null", () => {
    expect(boDauSeri("越式料理")).toBe("越式料理");
    expect(boDauSeri(null)).toBe("");
    expect(boDauSeri(undefined)).toBe("");
  });
});

describe("locSeri", () => {
  const list = [
    { ten_seri: "COLA - PINWEI 5 NGÀY", mo_ta: null },
    { ten_seri: "COLA - CHAOZHI - X", mo_ta: "Đà Nẵng - Huế - Bà Nà" },
    { ten_seri: "COLA - SERI SAPA", mo_ta: null },
  ];

  it("query rỗng → trả nguyên danh sách", () => {
    expect(locSeri(list, "")).toHaveLength(3);
    expect(locSeri(list, "   ")).toHaveLength(3);
  });

  it("tìm không dấu, không phân biệt hoa thường", () => {
    expect(locSeri(list, "sapa").map((s) => s.ten_seri)).toEqual(["COLA - SERI SAPA"]);
    expect(locSeri(list, "PINWEI")).toHaveLength(1);
  });

  it("mọi từ đều phải khớp, không cần liền nhau", () => {
    expect(locSeri(list, "cola pinwei").map((s) => s.ten_seri)).toEqual(["COLA - PINWEI 5 NGÀY"]);
    expect(locSeri(list, "cola khong-co")).toEqual([]);
  });

  it("khớp cả mô tả", () => {
    expect(locSeri(list, "ba na").map((s) => s.ten_seri)).toEqual(["COLA - CHAOZHI - X"]);
  });
});
