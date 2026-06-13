import { describe, it, expect } from "vitest";
import { calcNHDnttAmount } from "./nh-dntt-calc";

describe("calcNHDnttAmount", () => {
  it("case thực tế TÂY THIÊN: main 6.6tr CK10% + phát sinh (100k CK10% + 5.94tr CK0) = 11.970.000", () => {
    const r = calcNHDnttAmount({
      mainGrossAfterFoc: 6_600_000,
      mainCkPct: 10,
      extras: [
        { so_luong: 1, don_gia: 100_000, chiet_khau_phan_tram: 10, nguoi_tt: "cong_ty" },
        { so_luong: 1, don_gia: 5_940_000, chiet_khau_phan_tram: 0, nguoi_tt: "cong_ty" },
      ],
    });
    expect(r.mainNet).toBe(5_940_000);
    expect(r.extrasGrossCompany).toBe(6_040_000);
    expect(r.extrasNetCompany).toBe(6_030_000); // 90.000 + 5.940.000
    expect(r.grossCompany).toBe(12_640_000);
    expect(r.chietKhau).toBe(670_000);          // 660k chính + 10k phát sinh
    expect(r.netCompany).toBe(11_970_000);
  });

  it("không phát sinh → chỉ suất chính sau CK", () => {
    const r = calcNHDnttAmount({ mainGrossAfterFoc: 1_000_000, mainCkPct: 10, extras: [] });
    expect(r.netCompany).toBe(900_000);
    expect(r.chietKhau).toBe(100_000);
    expect(r.extrasGrossCompany).toBe(0);
  });

  it("CK null/0 → không trừ chiết khấu", () => {
    const r = calcNHDnttAmount({
      mainGrossAfterFoc: 1_000_000,
      mainCkPct: null,
      extras: [{ so_luong: 2, don_gia: 50_000, nguoi_tt: "cong_ty" }],
    });
    expect(r.netCompany).toBe(1_100_000);
    expect(r.chietKhau).toBe(0);
  });

  it("extras HDV trả bị loại khỏi ĐNTT công ty", () => {
    const r = calcNHDnttAmount({
      mainGrossAfterFoc: 1_000_000,
      mainCkPct: 0,
      extras: [
        { so_luong: 1, don_gia: 200_000, chiet_khau_phan_tram: 0, nguoi_tt: "hdv" },
        { so_luong: 1, don_gia: 300_000, chiet_khau_phan_tram: 0, nguoi_tt: "cong_ty" },
      ],
    });
    expect(r.extrasGrossCompany).toBe(300_000); // HDV 200k bị loại
    expect(r.netCompany).toBe(1_300_000);
  });

  it("voucher TẶNG phủ suất chính → main = 0, chỉ tính phát sinh", () => {
    const r = calcNHDnttAmount({
      mainGrossAfterFoc: 6_600_000,
      mainCkPct: 10,
      mainCovered: true,
      extras: [{ so_luong: 1, don_gia: 100_000, chiet_khau_phan_tram: 10, nguoi_tt: "cong_ty" }],
    });
    expect(r.mainNet).toBe(0);
    expect(r.grossCompany).toBe(100_000);
    expect(r.netCompany).toBe(90_000);
  });

  it("CK làm tròn 1 lần/dòng (Mức A): 2 dòng lẻ không gộp trước khi tròn", () => {
    // mỗi dòng tròn riêng: applyChietKhau(333,10)=round(299.7)=300 mỗi dòng → 600
    const r = calcNHDnttAmount({
      mainGrossAfterFoc: 0,
      mainCkPct: 0,
      extras: [
        { so_luong: 1, don_gia: 333, chiet_khau_phan_tram: 10, nguoi_tt: "cong_ty" },
        { so_luong: 1, don_gia: 333, chiet_khau_phan_tram: 10, nguoi_tt: "cong_ty" },
      ],
    });
    expect(r.extrasNetCompany).toBe(600);
  });
});
