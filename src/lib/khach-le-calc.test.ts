import { describe, it, expect } from "vitest";
import { sumRosterPax, rosterTotalPax, sumRosterTien, thuStatus } from "./khach-le-calc";

describe("sumRosterPax / rosterTotalPax", () => {
  it("rỗng → 0", () => {
    expect(sumRosterPax([])).toEqual({ lon: 0, em1: 0, em2: 0 });
    expect(rosterTotalPax([])).toBe(0);
  });
  it("cộng theo loại + tổng đầu khách", () => {
    const rows = [
      { so_khach_lon: 2, so_khach_em1: 1, so_khach_em2: 0 },
      { so_khach_lon: 1, so_khach_em1: 0, so_khach_em2: 2 },
    ];
    expect(sumRosterPax(rows)).toEqual({ lon: 3, em1: 1, em2: 2 });
    expect(rosterTotalPax(rows)).toBe(6);
  });
});

describe("sumRosterTien", () => {
  it("rỗng → 0", () => {
    expect(sumRosterTien([])).toEqual({ giaBan: 0, daThu: 0, conLai: 0 });
  });
  it("còn lại = giá bán − đã thu", () => {
    const rows = [
      { gia_ban: 5_000_000, da_thu: 2_000_000 },
      { gia_ban: 3_000_000, da_thu: 3_000_000 },
    ];
    expect(sumRosterTien(rows)).toEqual({ giaBan: 8_000_000, daThu: 5_000_000, conLai: 3_000_000 });
  });
});

describe("thuStatus", () => {
  it("chưa thu đồng nào → chua_thu", () => {
    expect(thuStatus({ gia_ban: 5_000_000, da_thu: 0 })).toBe("chua_thu");
  });
  it("thu 1 phần → da_coc", () => {
    expect(thuStatus({ gia_ban: 5_000_000, da_thu: 2_000_000 })).toBe("da_coc");
  });
  it("thu đủ → da_thu", () => {
    expect(thuStatus({ gia_ban: 5_000_000, da_thu: 5_000_000 })).toBe("da_thu");
    expect(thuStatus({ gia_ban: 5_000_000, da_thu: 6_000_000 })).toBe("da_thu");
  });
  it("chưa nhập giá nhưng đã thu → da_coc (chưa coi là đủ)", () => {
    expect(thuStatus({ gia_ban: 0, da_thu: 1_000_000 })).toBe("da_coc");
  });
});
