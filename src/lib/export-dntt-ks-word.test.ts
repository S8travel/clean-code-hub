import { describe, it, expect } from "vitest";
import { calcTotalThanhTien, calcThucChuyen, dungLayoutCanTru, calcConLaiPrint } from "./export-dntt-ks-word";
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

describe("calcThucChuyen — số NCC thực nhận sau cấn trừ", () => {
  it("không cấn trừ → nguyên số tiền ĐNTT", () => {
    expect(calcThucChuyen(10_000_000)).toBe(10_000_000);
  });

  it("cấn trừ một phần → phần còn lại", () => {
    expect(calcThucChuyen(26_000_000, 10_000_000)).toBe(16_000_000);
  });

  it("cọc cấn trừ HẾT → 0 (không phải in nguyên mệnh giá)", () => {
    // Case đoàn thật: cọc 10tr, cấn trừ 10tr → bản in phải là 0.
    expect(calcThucChuyen(10_000_000, 10_000_000)).toBe(0);
  });

  it("cấn trừ vượt (dữ liệu lệch) → kẹp về 0, không âm", () => {
    expect(calcThucChuyen(10_000_000, 12_000_000)).toBe(0);
  });
});

describe("calcConLaiPrint — phần còn lại đối chiếu trên bản in", () => {
  it("cọc chưa phủ hết tổng → hiện phần còn (case đoàn thật 6.05tr − 6tr)", () => {
    expect(calcConLaiPrint(6_050_000, 0, 6_000_000)).toBe(50_000);
  });

  it("phiếu phủ đủ tổng → 0 (ẩn dòng còn lại)", () => {
    expect(calcConLaiPrint(6_050_000, 0, 6_050_000)).toBe(0);
  });

  it("đã cọc trước ở phiếu khác → trừ cả cocTotal", () => {
    // Tổng 10tr, đã cọc 4tr phiếu trước, phiếu này 3tr → còn 3tr.
    expect(calcConLaiPrint(10_000_000, 4_000_000, 3_000_000)).toBe(3_000_000);
  });

  it("phủ quá tổng (dữ liệu lệch) → kẹp về 0, không âm", () => {
    expect(calcConLaiPrint(6_000_000, 0, 6_050_000)).toBe(0);
  });
});

describe("dungLayoutCanTru — chọn layout 16 cột", () => {
  it("có cấn trừ → dùng layout cấn trừ", () => {
    expect(dungLayoutCanTru(10_000_000)).toBe(true);
  });

  it("KHÔNG cấn trừ, không ép layout → layout thường/cọc", () => {
    expect(dungLayoutCanTru(0)).toBe(false);
  });

  it("ép layout (bảng gộp có ít nhất 1 ĐNTT cấn trừ) → true cả dòng không cấn trừ", () => {
    expect(dungLayoutCanTru(0, true)).toBe(true);
  });

  it("ĐNTT cọc có cấn trừ VẪN dùng layout cấn trừ (đây là bug đã sửa)", () => {
    // Trước fix: la_coc chặn layout cấn trừ → in nguyên mệnh giá cọc.
    expect(dungLayoutCanTru(10_000_000)).toBe(true);
  });
});
