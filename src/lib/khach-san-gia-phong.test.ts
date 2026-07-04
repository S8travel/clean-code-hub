import { describe, it, expect } from "vitest";
import { resolveGiaPhong, resolveGiaPhongValue, type GiaPhongRow } from "./khach-san-gia-phong";

const row = (p: Partial<GiaPhongRow> & { id: number; gia: number }): GiaPhongRow => ({
  khach_san_id: 1,
  ten_giai_doan: null,
  tu_ngay: null,
  den_ngay: null,
  loai_phong: null,
  ghi_chu: null,
  active: true,
  ...p,
});

describe("resolveGiaPhong — chọn giá theo giai đoạn", () => {
  it("không có dòng → null", () => {
    expect(resolveGiaPhong([], "2026-07-15")).toBeNull();
    expect(resolveGiaPhongValue([], "2026-07-15")).toBeNull();
  });

  it("chỉ có dòng Mặc định → luôn trả giá đó bất kể ngày", () => {
    const rows = [row({ id: 1, gia: 1_500_000 })];
    expect(resolveGiaPhongValue(rows, "2026-07-15")).toBe(1_500_000);
    expect(resolveGiaPhongValue(rows, "2026-01-01")).toBe(1_500_000);
    expect(resolveGiaPhongValue(rows)).toBe(1_500_000);
  });

  it("ngày trong giai đoạn cụ thể → giá giai đoạn (thắng Mặc định)", () => {
    const rows = [
      row({ id: 1, gia: 1_500_000, ten_giai_doan: "Mặc định" }),
      row({ id: 2, gia: 2_200_000, ten_giai_doan: "Cao điểm hè", tu_ngay: "2026-06-01", den_ngay: "2026-08-31" }),
    ];
    expect(resolveGiaPhongValue(rows, "2026-07-15")).toBe(2_200_000);
  });

  it("ngày ngoài mọi giai đoạn → fallback Mặc định", () => {
    const rows = [
      row({ id: 1, gia: 1_500_000 }),
      row({ id: 2, gia: 2_200_000, tu_ngay: "2026-06-01", den_ngay: "2026-08-31" }),
    ];
    expect(resolveGiaPhongValue(rows, "2026-03-10")).toBe(1_500_000);
  });

  it("không có Mặc định + ngày ngoài mọi giai đoạn → null (chưa định nghĩa giá)", () => {
    const rows = [row({ id: 2, gia: 2_200_000, tu_ngay: "2026-06-01", den_ngay: "2026-08-31" })];
    expect(resolveGiaPhongValue(rows, "2026-03-10")).toBeNull();
    // nhưng ngày TRONG giai đoạn vẫn ra giá
    expect(resolveGiaPhongValue(rows, "2026-07-01")).toBe(2_200_000);
  });

  it("2 giai đoạn cùng phủ → giai đoạn HẸP hơn thắng", () => {
    const rows = [
      row({ id: 1, gia: 2_000_000, ten_giai_doan: "Hè", tu_ngay: "2026-06-01", den_ngay: "2026-08-31" }),
      row({ id: 2, gia: 3_500_000, ten_giai_doan: "Lễ 30/4 cao điểm", tu_ngay: "2026-06-28", den_ngay: "2026-07-02" }),
    ];
    expect(resolveGiaPhongValue(rows, "2026-07-01")).toBe(3_500_000); // hẹp hơn
    expect(resolveGiaPhongValue(rows, "2026-07-20")).toBe(2_000_000); // chỉ Hè phủ
  });

  it("cận đầu/cuối là biên (inclusive)", () => {
    const rows = [row({ id: 1, gia: 1_000_000, tu_ngay: "2026-07-01", den_ngay: "2026-07-31" })];
    expect(resolveGiaPhongValue(rows, "2026-07-01")).toBe(1_000_000);
    expect(resolveGiaPhongValue(rows, "2026-07-31")).toBe(1_000_000);
    expect(resolveGiaPhongValue(rows, "2026-08-01")).toBeNull(); // ngoài, không có Mặc định
  });

  it("nửa hở: chỉ tu_ngay (từ X trở đi) / chỉ den_ngay (tới X)", () => {
    const tuOnly = [row({ id: 1, gia: 900_000, tu_ngay: "2026-07-01", den_ngay: null })];
    expect(resolveGiaPhongValue(tuOnly, "2026-09-01")).toBe(900_000);
    expect(resolveGiaPhongValue(tuOnly, "2026-06-30")).toBeNull();

    const denOnly = [row({ id: 1, gia: 900_000, tu_ngay: null, den_ngay: "2026-07-31" })];
    expect(resolveGiaPhongValue(denOnly, "2026-06-30")).toBe(900_000);
    expect(resolveGiaPhongValue(denOnly, "2026-08-01")).toBeNull();
  });

  it("giai đoạn cụ thể (2 cận) thắng nửa-hở dù nửa-hở cũng phủ", () => {
    const rows = [
      row({ id: 1, gia: 1_200_000, tu_ngay: "2026-06-01", den_ngay: null }), // từ 1/6 trở đi
      row({ id: 2, gia: 2_500_000, tu_ngay: "2026-07-01", den_ngay: "2026-07-31" }), // tháng 7
    ];
    expect(resolveGiaPhongValue(rows, "2026-07-15")).toBe(2_500_000);
  });

  it("dòng inactive bị loại", () => {
    const rows = [
      row({ id: 1, gia: 1_500_000 }),
      row({ id: 2, gia: 2_200_000, tu_ngay: "2026-06-01", den_ngay: "2026-08-31", active: false }),
    ];
    expect(resolveGiaPhongValue(rows, "2026-07-15")).toBe(1_500_000); // giai đoạn hè bị tắt → Mặc định
  });

  it("không truyền ngày → Mặc định (bỏ qua giai đoạn)", () => {
    const rows = [
      row({ id: 1, gia: 1_500_000 }),
      row({ id: 2, gia: 2_200_000, tu_ngay: "2026-06-01", den_ngay: "2026-08-31" }),
    ];
    expect(resolveGiaPhongValue(rows)).toBe(1_500_000);
  });
});
