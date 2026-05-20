import { describe, it, expect } from "vitest";
import { computeDoanStatus } from "./doan-status";

describe("computeDoanStatus — ưu tiên: huy > da_quyet_toan > hoan_thanh > dang_chay", () => {
  it("trang_thai='huy' → 'huy' (kể cả qtPaidSet có)", () => {
    expect(computeDoanStatus({ id: 1, trang_thai: "huy" }, new Set([1]))).toBe("huy");
  });

  it("id ∈ qtPaidSet → 'da_quyet_toan'", () => {
    expect(computeDoanStatus({ id: 5, trang_thai: "dang_chay" }, new Set([5])))
      .toBe("da_quyet_toan");
  });

  it("id KHÔNG ∈ qtPaidSet → fallthrough", () => {
    expect(computeDoanStatus({ id: 7, trang_thai: "dang_chay" }, new Set([1, 2])))
      .toBe("dang_chay");
  });

  it("ngay_ve < hôm nay → 'hoan_thanh'", () => {
    expect(computeDoanStatus({ trang_thai: "dang_chay", ngay_ve: "2020-01-01" }))
      .toBe("hoan_thanh");
  });

  it("ngay_ve trong tương lai xa → 'dang_chay'", () => {
    expect(computeDoanStatus({ trang_thai: "dang_chay", ngay_ve: "2999-01-01" }))
      .toBe("dang_chay");
  });

  it("không có ngay_ve → 'dang_chay'", () => {
    expect(computeDoanStatus({ trang_thai: "dang_chay" })).toBe("dang_chay");
  });

  it("qtPaidSet = null + ngay_ve quá khứ → 'hoan_thanh'", () => {
    expect(computeDoanStatus({ id: 9, trang_thai: "dang_chay", ngay_ve: "2020-01-01" }, null))
      .toBe("hoan_thanh");
  });
});
