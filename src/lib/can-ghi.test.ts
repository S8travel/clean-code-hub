import { describe, it, expect } from "vitest";
import { canGhi } from "./can-ghi";

const cu = {
  so_khach: 20, so_khach_lon: 18, so_khach_em1: 2, so_khach_em2: 0, so_khach_tl: 0,
  bang_don: "S8 TRAVEL", shopping: false, truong_doan: null,
  chuyen_bay_don: "VN123", chuyen_bay_tien: null,
  co_tinh_suat_tl_nha_hang: false, chu_thich_khach: null,
  tang_pham: ["Nón lá", "Khăn"], ghi_chu_dieu_tour: null,
  thu_tip: true, tip_rate: 3, tip_so_ngay_override: null, tip_so_khach_override: null, tip_lump_sum: null,
};

describe("canGhi", () => {
  it("y nguyên (OP chỉ sửa lịch trình) → KHÔNG ghi", () => {
    expect(canGhi(cu, { ...cu })).toBe(false);
  });

  it("đổi một trường chữ → ghi", () => {
    expect(canGhi(cu, { ...cu, bang_don: "S8" })).toBe(true);
  });

  it("đổi số khách → ghi", () => {
    expect(canGhi(cu, { ...cu, so_khach_lon: 19, so_khach: 21 })).toBe(true);
  });

  it("bật/tắt cờ → ghi", () => {
    expect(canGhi(cu, { ...cu, thu_tip: false })).toBe(true);
  });

  it("tặng phẩm thêm/bớt/đổi thứ tự → ghi", () => {
    expect(canGhi(cu, { ...cu, tang_pham: ["Nón lá"] })).toBe(true);
    expect(canGhi(cu, { ...cu, tang_pham: ["Khăn", "Nón lá"] })).toBe(true);
    expect(canGhi(cu, { ...cu, tang_pham: null })).toBe(true);
  });

  it("numeric về dạng chuỗi vẫn so đúng theo giá trị", () => {
    expect(canGhi({ ...cu, tip_rate: "3.00" }, { ...cu, tip_rate: 3 })).toBe(false);
    expect(canGhi({ ...cu, tip_rate: "3.5" }, { ...cu, tip_rate: 3 })).toBe(true);
  });

  it("chuỗi rỗng trong DB khác null gửi lên → ghi (chuẩn hoá về null)", () => {
    expect(canGhi({ ...cu, truong_doan: "" }, { ...cu, truong_doan: null })).toBe(true);
  });

  it("trường không gửi (undefined) thì bỏ qua", () => {
    expect(canGhi(cu, { bang_don: "S8 TRAVEL", shopping: undefined })).toBe(false);
  });

  it("không đọc được dòng cũ → ghi như trước", () => {
    expect(canGhi(null, { ...cu })).toBe(true);
    expect(canGhi(undefined, { ...cu })).toBe(true);
  });

  it("dòng cũ thiếu cột (quên thêm vào select) → ghi, không đoán", () => {
    const thieuCot = Object.fromEntries(Object.entries(cu).filter(([k]) => k !== "tip_lump_sum"));
    expect(canGhi(thieuCot, { ...cu })).toBe(true);
  });
});
