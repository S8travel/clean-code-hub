import { describe, it, expect } from "vitest";
import { calcTotalThanhTien } from "./export-dntt-ks-word";
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
