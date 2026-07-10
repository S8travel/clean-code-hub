import { describe, it, expect } from "vitest";
import { anKhoiDinhKy } from "./dinh-ky-doan-huy";

const row = (over: Partial<Parameters<typeof anKhoiDinhKy>[0]> = {}) => ({
  doan_trang_thai: "huy",
  so_tien_da_dntt: 0,
  so_tien_da_tt: 0,
  ...over,
});

describe("anKhoiDinhKy", () => {
  it("đoàn đã hủy, chưa cam kết, chưa trả → ẩn (13 dòng bảo hiểm trên prod)", () => {
    expect(anKhoiDinhKy(row())).toBe(true);
  });

  it("đoàn đang chạy → luôn giữ", () => {
    expect(anKhoiDinhKy(row({ doan_trang_thai: "dang_chay" }))).toBe(false);
  });

  it("trang_thai null (đoàn chưa nạp được) → giữ, không ẩn nhầm", () => {
    expect(anKhoiDinhKy(row({ doan_trang_thai: null }))).toBe(false);
  });

  // Chốt tiền: đây là lý do KHÔNG lọc mù theo trang_thai='huy'.
  it("đoàn đã hủy NHƯNG đã có ĐNTT cam kết → GIỮ, không được giấu", () => {
    expect(anKhoiDinhKy(row({ so_tien_da_dntt: 1 }))).toBe(false);
  });

  it("đoàn đã hủy NHƯNG đã trả tiền → GIỮ, không được giấu", () => {
    expect(anKhoiDinhKy(row({ so_tien_da_tt: 1 }))).toBe(false);
  });

  it("đoàn đã hủy, có cả cam kết lẫn đã trả → GIỮ", () => {
    expect(anKhoiDinhKy(row({ so_tien_da_dntt: 5_000_000, so_tien_da_tt: 5_000_000 }))).toBe(false);
  });
});
