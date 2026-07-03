import { describe, it, expect } from "vitest";
import { splitTaiKhoanBlob, resolveNccTaiKhoanText } from "./ncc-tai-khoan";

describe("splitTaiKhoanBlob", () => {
  it("tách nhiều dòng, trim, bỏ dòng rỗng", () => {
    expect(
      splitTaiKhoanBlob("CONG TY CP KHACH SAN ROSEMARY\n3301100055555\n MB Branch Hoi An"),
    ).toEqual(["CONG TY CP KHACH SAN ROSEMARY", "3301100055555", "MB Branch Hoi An"]);
  });
  it("trả mảng rỗng khi null / rỗng", () => {
    expect(splitTaiKhoanBlob(null)).toEqual([]);
    expect(splitTaiKhoanBlob("   ")).toEqual([]);
  });
});

describe("resolveNccTaiKhoanText", () => {
  it("ưu tiên blob tai_khoan_thanh_toan, nối các dòng bằng ' · '", () => {
    expect(
      resolveNccTaiKhoanText({
        so_tai_khoan: null,
        ngan_hang: null,
        tai_khoan_thanh_toan: "CONG TY CP KHACH SAN ROSEMARY\n3301100055555\nMB Hoi An",
      }),
    ).toBe("CONG TY CP KHACH SAN ROSEMARY · 3301100055555 · MB Hoi An");
  });
  it("fallback ghép so_tai_khoan + ngan_hang khi blob trống", () => {
    expect(
      resolveNccTaiKhoanText({ so_tai_khoan: "123456", ngan_hang: "VCB", tai_khoan_thanh_toan: null }),
    ).toBe("123456 · VCB");
  });
  it("chỉ có 1 trong 2 cột cấu trúc", () => {
    expect(resolveNccTaiKhoanText({ so_tai_khoan: "123456", ngan_hang: null })).toBe("123456");
    expect(resolveNccTaiKhoanText({ so_tai_khoan: null, ngan_hang: "VCB" })).toBe("VCB");
  });
  it("trả null khi không có thông tin nào", () => {
    expect(resolveNccTaiKhoanText({ so_tai_khoan: null, ngan_hang: null, tai_khoan_thanh_toan: "" })).toBeNull();
  });
});
