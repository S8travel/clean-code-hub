import { describe, it, expect } from "vitest";
import { normalizeEmailList, computeUncAmounts } from "./unc-email";

describe("normalizeEmailList", () => {
  it("giữ nguyên email đơn / nhiều email chuẩn", () => {
    expect(normalizeEmailList("a@x.com")).toBe("a@x.com");
    expect(normalizeEmailList("a@x.com, b@y.com")).toBe("a@x.com, b@y.com");
  });

  it("tách theo newline / tab / ; / fullwidth comma", () => {
    expect(normalizeEmailList("a@x.com\nb@y.com")).toBe("a@x.com, b@y.com");
    expect(normalizeEmailList("a@x.com\tb@y.com")).toBe("a@x.com, b@y.com");
    expect(normalizeEmailList("a@x.com;b@y.com")).toBe("a@x.com, b@y.com");
    expect(normalizeEmailList("a@x.com，b@y.com")).toBe("a@x.com, b@y.com");
    expect(normalizeEmailList("a@x.com；b@y.com")).toBe("a@x.com, b@y.com");
  });

  it("bỏ dấu phẩy / khoảng trắng thừa cuối", () => {
    expect(normalizeEmailList("a@x.com,\n")).toBe("a@x.com");
    expect(normalizeEmailList("  a@x.com  ")).toBe("a@x.com");
    expect(normalizeEmailList("a@x.com, b@y.com,")).toBe("a@x.com, b@y.com");
  });

  it("tách 'Tên người <email>' → chỉ lấy email", () => {
    expect(normalizeEmailList("San Hô Đỏ Travel Eco <sales1@sanhodotravel.com>"))
      .toBe("sales1@sanhodotravel.com");
    expect(normalizeEmailList("Đỗ Thị Anh Thư <a@x.com>, Lê Anh Thư <b@y.com>"))
      .toBe("a@x.com, b@y.com");
    expect(normalizeEmailList("<v.yenlnh@vinpearl.com>, <v.kien@vinpearl.com>"))
      .toBe("v.yenlnh@vinpearl.com, v.kien@vinpearl.com");
  });

  it("bỏ dấu nháy thừa", () => {
    expect(normalizeEmailList('"Lê Thị" <a@x.com>, b@y.com')).toBe("a@x.com, b@y.com");
    expect(normalizeEmailList('a@x.com" <a@x.com>')).toBe("a@x.com");
  });

  it("loại phần không phải email (không có @)", () => {
    expect(normalizeEmailList("ZALO ")).toBe("");
    expect(normalizeEmailList("Giang Dang <acc@x.com>, ZALO")).toBe("acc@x.com");
  });

  it("null/rỗng → chuỗi rỗng", () => {
    expect(normalizeEmailList(null)).toBe("");
    expect(normalizeEmailList("")).toBe("");
  });
});

describe("computeUncAmounts", () => {
  it("chưa trả gì → UNC chuyển trọn so_tien, không breakdown", () => {
    expect(computeUncAmounts(1_000_000, 0, 0)).toEqual({
      soTien: 1_000_000, daCoc: 0, canTru: 0, conLai: 1_000_000, hasDeduction: false,
    });
  });

  it("đã cọc tiền mặt → UNC chỉ chuyển phần còn lại", () => {
    expect(computeUncAmounts(1_000_000, 400_000, 0)).toEqual({
      soTien: 1_000_000, daCoc: 400_000, canTru: 0, conLai: 600_000, hasDeduction: true,
    });
  });

  it("cấn trừ công nợ (không cọc) → conLai = so_tien − cấn trừ", () => {
    expect(computeUncAmounts(1_000_000, 300_000, 300_000)).toEqual({
      soTien: 1_000_000, daCoc: 0, canTru: 300_000, conLai: 700_000, hasDeduction: true,
    });
  });

  it("vừa cọc vừa cấn trừ → tách daCoc và canTru, conLai = phần còn lại", () => {
    // paidBefore 500k = 200k cọc + 300k cấn trừ
    expect(computeUncAmounts(1_000_000, 500_000, 300_000)).toEqual({
      soTien: 1_000_000, daCoc: 200_000, canTru: 300_000, conLai: 500_000, hasDeduction: true,
    });
  });

  it("đã trả đủ → conLai = 0", () => {
    expect(computeUncAmounts(1_000_000, 1_000_000, 0)).toEqual({
      soTien: 1_000_000, daCoc: 1_000_000, canTru: 0, conLai: 0, hasDeduction: true,
    });
  });

  it("clamp khi dữ liệu lệch: paidBefore/canTru vượt tổng → các dòng cộng đúng tổng", () => {
    const r = computeUncAmounts(1_000_000, 1_500_000, 2_000_000);
    expect(r.conLai).toBe(0);
    expect(r.daCoc + r.canTru).toBe(r.soTien); // không vượt tổng
    expect(r.canTru).toBeLessThanOrEqual(r.soTien);
  });

  it("giá trị âm / NaN → coi như 0", () => {
    expect(computeUncAmounts(-5, -10, -3)).toEqual({
      soTien: 0, daCoc: 0, canTru: 0, conLai: 0, hasDeduction: false,
    });
    expect(computeUncAmounts(NaN, NaN, NaN)).toEqual({
      soTien: 0, daCoc: 0, canTru: 0, conLai: 0, hasDeduction: false,
    });
  });
});
