import { describe, it, expect } from "vitest";
import { calcBaoGia, type ManualItem } from "./bao-gia-calc";

// CASES (hard-coded trong calcBaoGia):
//   case_16: { guests: 16, pax: 17, rooms: 9 }
//   case_20: { guests: 20, pax: 21, rooms: 11 }
// Hằng số: insurance=100k×pax, guide=200k×soNgay, tips=500k (lump).

const item = (
  loai: ManualItem["loai"],
  gia: number | null,
  ten = "",
  foc = 0,
): ManualItem => ({
  id: `${loai}-${gia}-${ten}-${foc}`,
  ngay: 1,
  loai,
  mo_ta: ten || `${loai} item`,
  bang_gia_ten: ten,
  gia,
  foc,
});

describe("calcBaoGia — hằng số (insurance/guide/tips)", () => {
  it("không item, soNgay=3 → case_16: insurance 1.7M + guide 600k + tips 500k = 2.8M", () => {
    const r = calcBaoGia([], "Test", 3, 24_000, 0);
    expect(r.case_16.insurance).toBe(1_700_000); // 100k × 17 pax
    expect(r.case_16.guide).toBe(600_000); // 200k × 3 ngày
    expect(r.case_16.tips).toBe(500_000);
    expect(r.case_16.hotel).toBe(0);
    expect(r.case_16.meal).toBe(0);
    expect(r.case_16.ticket).toBe(0);
    expect(r.case_16.transport).toBe(0);
    expect(r.case_16.total_cost).toBe(2_800_000);
  });

  it("case_20 dùng pax=21 (insurance) & rooms=11, guide vẫn theo ngày", () => {
    const r = calcBaoGia([], "Test", 5, 24_000, 0);
    expect(r.case_20.insurance).toBe(2_100_000); // 100k × 21
    expect(r.case_20.guide).toBe(1_000_000); // 200k × 5
    expect(r.case_20.tips).toBe(500_000);
  });
});

describe("calcBaoGia — categorize & nhân theo loại", () => {
  it("hotel × rooms (9 cho case_16, 11 cho case_20)", () => {
    const items = [item("hotel", 1_000_000, "KS A")];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.hotel).toBe(9_000_000); // 1M × 9 rooms
    expect(r.case_20.hotel).toBe(11_000_000); // 1M × 11 rooms
  });

  it("meal & ticket × pax", () => {
    const items = [item("meal", 100_000, "M"), item("ticket", 50_000, "T")];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.meal).toBe(1_700_000); // 100k × 17
    expect(r.case_16.ticket).toBe(850_000); // 50k × 17
    expect(r.case_20.meal).toBe(2_100_000);
    expect(r.case_20.ticket).toBe(1_050_000);
  });

  it("transport KHÔNG nhân pax — cộng thẳng (lump-sum cho cả đoàn)", () => {
    const items = [item("transport", 5_000_000, "Bus")];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.transport).toBe(5_000_000); // KHÔNG × pax
    expect(r.case_20.transport).toBe(5_000_000); // case_20 cũng vậy
  });

  it("extra cộng vào transport (cùng nhóm lump-sum)", () => {
    const items = [item("transport", 3_000_000, "Bus"), item("extra", 1_000_000, "Phí")];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.transport).toBe(4_000_000);
  });

  it("tienXe + tienPhuThu cộng vào transport", () => {
    const r = calcBaoGia([], "T", 3, 24_000, 0, 2_000_000, 500_000);
    expect(r.case_16.transport).toBe(2_500_000);
  });

  it("transport: tienXe + tienPhuThu + items transport/extra cùng cộng", () => {
    const items = [item("transport", 1_000_000), item("extra", 200_000)];
    const r = calcBaoGia(items, "T", 3, 24_000, 0, 500_000, 100_000);
    expect(r.case_16.transport).toBe(1_800_000); // 1M + 200k + 500k + 100k
  });
});

describe("calcBaoGia — loại bỏ item gia=null / gia=0", () => {
  it("gia=null bị bỏ qua khỏi sum", () => {
    const items = [item("hotel", null, "Free KS"), item("hotel", 1_000_000)];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.hotel).toBe(9_000_000);
  });

  it("gia=0 cũng bị filter (falsy) — KHÔNG cộng 0 lần rooms", () => {
    const items = [item("hotel", 0, "Free"), item("hotel", 1_000_000)];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.hotel).toBe(9_000_000); // chỉ tính 1 row có gia
  });

  it("baoGiaItems output cũng filter gia falsy", () => {
    const items = [
      item("hotel", null, "Skip"),
      item("hotel", 0, "Skip too"),
      item("meal", 100_000, "Keep"),
    ];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].mo_ta).toBe("Keep");
  });
});

describe("calcBaoGia — profit & final price", () => {
  it("profit_vnd = profitUsd × exchangeRate × guests", () => {
    const r = calcBaoGia([], "T", 3, 24_000, 10);
    expect(r.case_16.profit_vnd).toBe(3_840_000); // 10 × 24k × 16
    expect(r.case_20.profit_vnd).toBe(4_800_000); // 10 × 24k × 20
  });

  it("final_price_vnd = round((total + profit) / guests)", () => {
    const r = calcBaoGia([], "T", 3, 24_000, 10);
    // case_16: insurance 1.7M + guide 600k + tips 500k = 2.8M
    //          + profit 3.84M = 6.64M; / 16 = 415_000
    expect(r.case_16.final_price_vnd).toBe(415_000);
    // case_20: insurance 2.1M + guide 600k + tips 500k = 3.2M
    //          + profit 4.8M = 8.0M; / 20 = 400_000
    expect(r.case_20.final_price_vnd).toBe(400_000);
  });

  it("final_price_vnd luôn là số nguyên (Math.round)", () => {
    // Cố tình tạo phép chia lẻ: total=1_000_001 → /16 = 62_500.0625 → round
    const items = [item("transport", 1)]; // +1đ vào transport
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(Number.isInteger(r.case_16.final_price_vnd)).toBe(true);
    expect(Number.isInteger(r.case_20.final_price_vnd)).toBe(true);
  });

  it("final_price_usd = final_price_vnd / exchangeRate (KHÔNG round)", () => {
    const r = calcBaoGia([], "T", 3, 24_000, 10);
    expect(r.case_16.final_price_usd).toBeCloseTo(415_000 / 24_000, 6);
    expect(r.case_20.final_price_usd).toBeCloseTo(400_000 / 24_000, 6);
  });
});

describe("calcBaoGia — output structure", () => {
  it("trả về cả 2 case + giá trung bình", () => {
    const r = calcBaoGia([], "Tour A", 3, 24_000, 5);
    expect(r.ten_chuong_trinh).toBe("Tour A");
    expect(r.so_ngay).toBe(3);
    expect(r.case_16).toBeDefined();
    expect(r.case_20).toBeDefined();
    expect(r.gia_trung_binh_vnd).toBe(
      Math.round((r.case_16.final_price_vnd + r.case_20.final_price_vnd) / 2),
    );
    expect(r.gia_trung_binh_usd).toBeCloseTo(
      (r.case_16.final_price_usd + r.case_20.final_price_usd) / 2,
      6,
    );
  });

  it("baoGiaItems: extra → map sang loại 'transport' trong output", () => {
    const items = [item("extra", 100_000, "Phí phụ")];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].loai).toBe("transport");
  });

  it("baoGiaItems.mo_ta ưu tiên bang_gia_ten, fallback mo_ta", () => {
    const items = [
      { ...item("hotel", 1_000_000, "Khách sạn 4 sao"), mo_ta: "Item mô tả riêng" },
      { ...item("meal", 100_000, ""), mo_ta: "Cơm trưa" },
    ];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.items[0].mo_ta).toBe("Khách sạn 4 sao"); // bang_gia_ten thắng
    expect(r.items[1].mo_ta).toBe("Cơm trưa"); // fallback mo_ta khi bang_gia_ten=""
  });

  it("hotel/meal/ticket/transport/extra giữ thứ tự items đầu vào", () => {
    const items = [
      item("ticket", 50_000, "Vé 1"),
      item("hotel", 1_000_000, "KS 1"),
      item("meal", 100_000, "Bữa 1"),
    ];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.items.map((x) => x.mo_ta)).toEqual(["Vé 1", "KS 1", "Bữa 1"]);
  });
});

describe("calcBaoGia — FOC trừ khỏi multiplier", () => {
  it("meal foc=1 → (pax-1) × gia thay vì pax × gia", () => {
    const items = [item("meal", 100_000, "Bữa", 1)];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.meal).toBe(1_600_000); // (17 - 1) × 100k
    expect(r.case_20.meal).toBe(2_000_000); // (21 - 1) × 100k
  });

  it("ticket foc=1 → (pax-1) × gia", () => {
    const items = [item("ticket", 50_000, "Vé", 1)];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.ticket).toBe(800_000); // (17 - 1) × 50k
    expect(r.case_20.ticket).toBe(1_000_000); // (21 - 1) × 50k
  });

  it("hotel foc=0.5 → (rooms-0.5) × gia (half-room FOC)", () => {
    const items = [item("hotel", 1_000_000, "KS", 0.5)];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.hotel).toBe(8_500_000); // (9 - 0.5) × 1M
    expect(r.case_20.hotel).toBe(10_500_000); // (11 - 0.5) × 1M
  });

  it("foc=0 hoặc undefined → giữ multiplier nguyên", () => {
    const items = [
      item("meal", 100_000, "Bữa 1", 0),
      item("meal", 200_000, "Bữa 2"), // không truyền foc
    ];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.meal).toBe(5_100_000); // 100k×17 + 200k×17
  });

  it("foc > multiplier → clamp 0 (không lỗ ngược)", () => {
    const items = [item("meal", 100_000, "Bữa", 999)]; // foc lố
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.meal).toBe(0);
  });

  it("transport KHÔNG áp FOC (lump-sum)", () => {
    const items = [item("transport", 5_000_000, "Bus", 1)]; // foc bị bỏ qua
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.case_16.transport).toBe(5_000_000);
  });

  it("FOC snapshot vào BaoGiaItem output", () => {
    const items = [item("meal", 100_000, "M", 1)];
    const r = calcBaoGia(items, "T", 3, 24_000, 0);
    expect(r.items[0].foc).toBe(1);
  });
});

describe("calcBaoGia — kịch bản nghiệp vụ thực tế", () => {
  it("Tour 5 ngày, 3 KS + 8 bữa ăn + 4 vé, xe 8M, profit $40/khách", () => {
    const items: ManualItem[] = [
      item("hotel", 800_000, "KS 1"),
      item("hotel", 850_000, "KS 2"),
      item("hotel", 900_000, "KS 3"),
      ...Array.from({ length: 8 }, (_, i) => item("meal", 120_000, `Bữa ${i + 1}`)),
      ...Array.from({ length: 4 }, (_, i) => item("ticket", 80_000, `Vé ${i + 1}`)),
    ];
    const r = calcBaoGia(items, "Tour 5N", 5, 25_000, 40, 8_000_000, 0);

    // case_16 (rooms=9, pax=17):
    // hotel = (800k+850k+900k) × 9 = 22.95M
    // meal = 8 × 120k × 17 = 16.32M
    // ticket = 4 × 80k × 17 = 5.44M
    // transport = 8M
    // insurance = 100k × 17 = 1.7M
    // guide = 200k × 5 = 1M
    // tips = 500k
    expect(r.case_16.hotel).toBe(22_950_000);
    expect(r.case_16.meal).toBe(16_320_000);
    expect(r.case_16.ticket).toBe(5_440_000);
    expect(r.case_16.transport).toBe(8_000_000);
    expect(r.case_16.total_cost).toBe(55_910_000);
    expect(r.case_16.profit_vnd).toBe(16_000_000); // 40 × 25k × 16
    // final = round((55.91M + 16M) / 16) = round(4_494_375) = 4_494_375
    expect(r.case_16.final_price_vnd).toBe(4_494_375);
  });
});
