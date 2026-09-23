import { describe, it, expect } from "vitest";
import { calcNHEntryTotal, calcConLaiPrintNH } from "./export-dntt-nh-word";
import type { NHDocItem } from "./export-dntt-nh-word";

const item = (so_luong: number, don_gia: number, ck?: number): NHDocItem => ({
  so_luong,
  don_gia,
  chiet_khau_phan_tram: ck,
});

describe("calcNHEntryTotal", () => {
  it("cộng thành tiền các item (so_luong × don_gia)", () => {
    expect(calcNHEntryTotal([item(10, 200_000), item(2, 50_000)])).toBe(2_100_000);
  });

  it("trừ chiết khấu riêng từng dòng (main + extras)", () => {
    // dòng 1: 10×100k = 1.000.000, CK 10% → 900.000
    // dòng 2:  2×100k =   200.000, CK  5% → 190.000
    expect(calcNHEntryTotal([item(10, 100_000, 10), item(2, 100_000, 5)])).toBe(1_090_000);
  });

  it("dòng không có CK → giữ nguyên gross", () => {
    expect(calcNHEntryTotal([item(10, 100_000, 10), item(2, 100_000)])).toBe(1_100_000);
  });

  it("làm tròn chiết khấu (Mức A — round 1 lần/dòng)", () => {
    // 1×99.000, CK 10% → round(89.100) = 89.100
    expect(calcNHEntryTotal([item(1, 99_000, 10)])).toBe(89_100);
  });

  it("items rỗng → 0", () => {
    expect(calcNHEntryTotal([])).toBe(0);
  });
});

describe("calcConLaiPrintNH — dòng \"Còn lại\" trên bản in NH/DV", () => {
  const base = { tongTien: 10_000_000, soTienCoc: 0, canTruHienThi: 0, soTienConTT: 10_000_000 };

  it("phiếu phủ đủ tổng → 0 (không in dòng nào)", () => {
    expect(calcConLaiPrintNH(base)).toBe(0);
  });
  it("phiếu bổ sung 2tr, phần kia đã nằm ở phiếu khác chưa chi → còn lại 8tr", () => {
    expect(calcConLaiPrintNH({ ...base, soTienConTT: 2_000_000 })).toBe(8_000_000);
  });
  it("đã trả trước ở phiếu khác → trừ cả cột cọc", () => {
    expect(calcConLaiPrintNH({
      ...base, soTienCoc: 4_000_000, soTienConTT: 6_000_000,
    })).toBe(0);
  });
  it("cấn trừ + voucher đã hiển thị ở cột Cấn trừ → không tính là còn lại", () => {
    expect(calcConLaiPrintNH({
      ...base, canTruHienThi: 3_000_000, soTienConTT: 7_000_000,
    })).toBe(0);
  });
  it("số cộng vượt tổng (dữ liệu lệch) → kẹp 0, không in số âm", () => {
    expect(calcConLaiPrintNH({
      ...base, soTienCoc: 5_000_000, soTienConTT: 10_000_000,
    })).toBe(0);
  });
});

describe("calcConLaiPrintNH — vé TẶNG không bị đòi tiền", () => {
  it("phiếu [Bổ sung] của bữa có vé tặng → Còn lại 0, không đòi phần được tặng", () => {
    // Bữa gross 27.600.000, trong đó 2.300.000 là suất được TẶNG bằng voucher.
    // Phiếu gốc đã trả 24.150.000, phiếu bổ sung lo nốt 1.150.000 → không còn nợ gì.
    expect(calcConLaiPrintNH({
      tongTien: 27_600_000, soTienCoc: 24_150_000, canTruHienThi: 0,
      soTienConTT: 1_150_000, phanNgoaiPhieu: 2_300_000,
    })).toBe(0);
  });
  it("vé tặng đã nằm ở cột Cấn trừ (phiếu thường) → không trừ hai lần", () => {
    expect(calcConLaiPrintNH({
      tongTien: 27_600_000, soTienCoc: 0, canTruHienThi: 2_300_000,
      soTienConTT: 25_300_000, phanNgoaiPhieu: 0,
    })).toBe(0);
  });
  it("vừa có vé tặng vừa còn nợ thật → chỉ in phần nợ thật", () => {
    expect(calcConLaiPrintNH({
      tongTien: 10_000_000, soTienCoc: 0, canTruHienThi: 0,
      soTienConTT: 6_000_000, phanNgoaiPhieu: 1_000_000,
    })).toBe(3_000_000);
  });
});
