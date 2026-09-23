import { describe, it, expect } from "vitest";
import {
  vaiTroHdvDoan,
  idsHdvDoan,
  danhSachHdvCoVaiTro,
  chuanHoaHdvDiCung,
  cungDanhSachHdv,
} from "./hdv-doan";

describe("vaiTroHdvDoan / idsHdvDoan", () => {
  it("đoàn 1 HDV → chỉ HDV chính", () => {
    expect(vaiTroHdvDoan({ huong_dan_vien_id: 5 })).toEqual([{ id: 5, vai_tro: "chinh" }]);
  });

  it("đoàn 6 HDV → chính, phụ, rồi 4 người đi cùng đúng thứ tự đã chọn", () => {
    const doan = { huong_dan_vien_id: 1, huong_dan_vien_id_2: 2, hdv_di_cung_ids: [9, 7, 8, 3] };
    expect(idsHdvDoan(doan)).toEqual([1, 2, 9, 7, 8, 3]);
    expect(vaiTroHdvDoan(doan).map((x) => x.vai_tro)).toEqual([
      "chinh", "phu", "di_cung", "di_cung", "di_cung", "di_cung",
    ]);
  });

  it("người trùng giữ vai trò ô đứng trước", () => {
    const doan = { huong_dan_vien_id: 1, huong_dan_vien_id_2: 1, hdv_di_cung_ids: [2, 1, 2] };
    expect(vaiTroHdvDoan(doan)).toEqual([
      { id: 1, vai_tro: "chinh" },
      { id: 2, vai_tro: "di_cung" },
    ]);
  });

  it("chưa có HDV chính mà có phụ + đi cùng → phụ vẫn mang vai 'phụ', không bị đôn lên 'chính'", () => {
    const doan = { huong_dan_vien_id: null, huong_dan_vien_id_2: 4, hdv_di_cung_ids: [6] };
    expect(vaiTroHdvDoan(doan)).toEqual([
      { id: 4, vai_tro: "phu" },
      { id: 6, vai_tro: "di_cung" },
    ]);
  });

  it("bỏ giá trị rác (null, 0, số âm, số lẻ)", () => {
    const doan = { huong_dan_vien_id: 0, huong_dan_vien_id_2: -3, hdv_di_cung_ids: [null, undefined, 2.5, 11] };
    expect(idsHdvDoan(doan)).toEqual([11]);
  });

  it("đoàn cũ chưa có cột hdv_di_cung_ids (undefined/null) vẫn chạy như 2 HDV", () => {
    expect(idsHdvDoan({ huong_dan_vien_id: 1, huong_dan_vien_id_2: 2 })).toEqual([1, 2]);
    expect(idsHdvDoan({ huong_dan_vien_id: 1, hdv_di_cung_ids: null })).toEqual([1]);
  });

  it("đoàn null/undefined → rỗng", () => {
    expect(idsHdvDoan(null)).toEqual([]);
    expect(idsHdvDoan(undefined)).toEqual([]);
  });
});

describe("danhSachHdvCoVaiTro", () => {
  const tatCa = [
    { id: 1, ten: "A" },
    { id: 2, ten: "B" },
    { id: 3, ten: "C" },
  ];

  it("tra đủ thông tin + vai trò, giữ thứ tự của đoàn chứ không theo danh mục", () => {
    const doan = { huong_dan_vien_id: 3, huong_dan_vien_id_2: 1, hdv_di_cung_ids: [2] };
    expect(danhSachHdvCoVaiTro(doan, tatCa)).toEqual([
      { id: 3, ten: "C", vai_tro: "chinh" },
      { id: 1, ten: "A", vai_tro: "phu" },
      { id: 2, ten: "B", vai_tro: "di_cung" },
    ]);
  });

  it("id không còn trong danh mục (HDV đã xoá) → bỏ qua, không làm hỏng cả danh sách", () => {
    const doan = { huong_dan_vien_id: 1, hdv_di_cung_ids: [99, 2] };
    expect(danhSachHdvCoVaiTro(doan, tatCa).map((h) => h.id)).toEqual([1, 2]);
  });
});

describe("chuanHoaHdvDiCung", () => {
  it("bỏ người đã ở ô chính/phụ — đổi HDV phụ sang người đang đi cùng thì người đó rời danh sách", () => {
    expect(chuanHoaHdvDiCung([3, 2, 4], 1, 2)).toEqual([3, 4]);
    expect(chuanHoaHdvDiCung([1, 5], 1, null)).toEqual([5]);
  });

  it("bỏ trùng + rác, giữ thứ tự đã chọn", () => {
    expect(chuanHoaHdvDiCung([7, null, 5, 7, NaN, 0, 5, 6], null, null)).toEqual([7, 5, 6]);
  });

  it("không có gì → mảng rỗng (cột NOT NULL DEFAULT '{}')", () => {
    expect(chuanHoaHdvDiCung(undefined, 1, 2)).toEqual([]);
    expect(chuanHoaHdvDiCung(null, null, null)).toEqual([]);
  });
});

describe("cungDanhSachHdv", () => {
  it("cùng người cùng thứ tự → true; khác thứ tự hoặc khác người → false", () => {
    expect(cungDanhSachHdv([1, 2], [1, 2])).toBe(true);
    expect(cungDanhSachHdv([1, 2], [2, 1])).toBe(false);
    expect(cungDanhSachHdv([1, 2], [1, 2, 3])).toBe(false);
  });

  it("null/undefined coi như rỗng", () => {
    expect(cungDanhSachHdv(null, [])).toBe(true);
    expect(cungDanhSachHdv(undefined, [4])).toBe(false);
  });
});
