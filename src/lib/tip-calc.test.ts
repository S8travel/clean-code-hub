import { describe, it, expect } from "vitest";
import {
  TIP_RATE_CO_TL,
  TIP_RATE_KHONG_TL,
  defaultTipRate,
  defaultTipSoKhach,
  tipDaysInclusive,
  calcTipNDT,
  calcTipVND,
} from "./tip-calc";

describe("defaultTipRate", () => {
  it("có T/L → 150", () => {
    expect(defaultTipRate(1)).toBe(TIP_RATE_CO_TL);
    expect(defaultTipRate(3)).toBe(150);
  });
  it("không T/L → 300", () => {
    expect(defaultTipRate(0)).toBe(TIP_RATE_KHONG_TL);
    expect(defaultTipRate(0)).toBe(300);
  });
});

describe("defaultTipSoKhach", () => {
  it("trừ T/L khỏi tổng khách", () => {
    expect(defaultTipSoKhach(30, 2)).toBe(28);
  });
  it("không âm khi T/L >= tổng khách", () => {
    expect(defaultTipSoKhach(2, 5)).toBe(0);
    expect(defaultTipSoKhach(0, 0)).toBe(0);
  });
});

describe("tipDaysInclusive", () => {
  it("tính cả ngày đi lẫn ngày về (inclusive)", () => {
    expect(tipDaysInclusive("2026-05-21", "2026-05-28")).toBe(8);
    expect(tipDaysInclusive("2026-05-01", "2026-05-05")).toBe(5);
  });
  it("tour cùng ngày đi-về = 1", () => {
    expect(tipDaysInclusive("2026-05-21", "2026-05-21")).toBe(1);
  });
  it("thiếu ngày → 0", () => {
    expect(tipDaysInclusive(null, "2026-05-28")).toBe(0);
    expect(tipDaysInclusive("2026-05-21", null)).toBe(0);
    expect(tipDaysInclusive(undefined, undefined)).toBe(0);
  });
  it("ngày không hợp lệ → 0", () => {
    expect(tipDaysInclusive("not-a-date", "2026-05-28")).toBe(0);
  });
  it("ngày về trước ngày đi → clamp 1 (không âm/không 0)", () => {
    expect(tipDaysInclusive("2026-05-28", "2026-05-21")).toBe(1);
  });
  it("chấp nhận chuỗi có phần giờ (cắt còn ngày)", () => {
    expect(tipDaysInclusive("2026-05-21T09:30:00", "2026-05-23T18:00:00")).toBe(3);
  });
});

describe("calcTipNDT", () => {
  it("số khách × số ngày × đơn giá", () => {
    expect(calcTipNDT({ soKhach: 28, soNgay: 8, rate: 150 })).toBe(33_600);
  });
  it("0 khách → 0", () => {
    expect(calcTipNDT({ soKhach: 0, soNgay: 8, rate: 300 })).toBe(0);
  });
});

describe("calcTipVND", () => {
  it("tip(NDT) × tỷ giá", () => {
    // 28 × 8 × 150 = 33.600 NDT × 800 = 26.880.000 VND
    expect(calcTipVND({ soKhach: 28, soNgay: 8, rate: 150, tyGia: 800 })).toBe(26_880_000);
  });
  it("nhất quán với calcTipNDT × tỷ giá", () => {
    const ndt = calcTipNDT({ soKhach: 12, soNgay: 5, rate: 300 });
    expect(calcTipVND({ soKhach: 12, soNgay: 5, rate: 300, tyGia: 750 })).toBe(ndt * 750);
  });
});
