import { describe, it, expect } from "vitest";
import { calcTotalThanhTien, isItemCoc } from "./export-dntt-ks-word";
import type { EdgeFunctionData } from "./export-dntt-ks-word";

type Room = EdgeFunctionData["roomEntries"][number];

const room = (over: Partial<Room> = {}): Room => ({
  name: "SGL",
  so_luong: 3,
  don_gia: 2_810_000,
  so_dem: 1,
  foc_count: 0,
  ...over,
});

const item = (over: Partial<EdgeFunctionData> = {}): EdgeFunctionData => ({
  doan: { ten_doan: "SGN03BR260602Z", so_khach: 3 },
  ks: { ten: "Sotetsu Grand Fresa", foc_khach: null, foc_mien: null },
  ncc: null,
  checkIn: "2/6/2026",
  checkOut: "4/6/2026",
  codeKS: "9259665554-1",
  soDem: 2,
  roomEntries: [room(), room()],
  cocTotal: 0,
  focDisplay: "—",
  soTien: 16_860_000,
  la_coc: false,
  ...over,
});

describe("calcTotalThanhTien", () => {
  it("cộng thành tiền các dòng (đơn giá × SL × số đêm)", () => {
    // 2 dòng × 2.810.000 × 3 phòng × 1 đêm = 16.860.000
    expect(calcTotalThanhTien([room(), room()])).toBe(16_860_000);
  });

  it("trừ FOC khỏi số lượng tính tiền", () => {
    // 3 phòng − 1 FOC = 2 billed × 2.810.000 = 5.620.000
    expect(calcTotalThanhTien([room({ foc_count: 1 })])).toBe(5_620_000);
  });

  it("nhân số đêm > 1", () => {
    expect(calcTotalThanhTien([room({ so_dem: 2 })])).toBe(16_860_000);
  });

  it("FOC vượt số lượng → billed kẹp về 0, không âm", () => {
    expect(calcTotalThanhTien([room({ so_luong: 1, foc_count: 5 })])).toBe(0);
  });

  it("roomEntries rỗng → 0", () => {
    expect(calcTotalThanhTien([])).toBe(0);
  });
});

describe("isItemCoc", () => {
  it("Thanh toán < tổng tiền phòng → là cọc", () => {
    expect(isItemCoc(item({ soTien: 8_430_000 }))).toBe(true);
  });

  it("Thanh toán = tổng tiền phòng → không phải cọc", () => {
    expect(isItemCoc(item({ soTien: 16_860_000 }))).toBe(false);
  });

  it("Thanh toán > tổng tiền phòng → không phải cọc", () => {
    expect(isItemCoc(item({ soTien: 20_000_000 }))).toBe(false);
  });

  it("la_coc=true → dùng layout cọc riêng, không tính là cọc ở đây", () => {
    expect(isItemCoc(item({ soTien: 8_430_000, la_coc: true }))).toBe(false);
  });

  it("có cấn trừ → dùng layout cấn trừ, không tính là cọc", () => {
    expect(isItemCoc(item({ soTien: 8_430_000, canTruTotal: 1_000_000 }))).toBe(false);
  });

  it("soTien = 0 → không phải cọc", () => {
    expect(isItemCoc(item({ soTien: 0 }))).toBe(false);
  });
});
