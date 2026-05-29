import { describe, it, expect } from "vitest";
import { normalizeEmailList } from "./unc-email";

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
