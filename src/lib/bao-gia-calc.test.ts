import { describe, it, expect } from "vitest";
import {
  calcBaoGia, calcTier, calcTiers, tierConfig,
  giaCuoiTierLines, giaCuoiBrackets, findBracketIndexForPax,
  type ManualItem,
} from "./bao-gia-calc";

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

describe("tierConfig — số khách → pax/phòng (khớp 2 mức cũ)", () => {
  it("16 khách → pax 17, phòng 9", () => {
    expect(tierConfig(16)).toEqual({ guests: 16, pax: 17, rooms: 9 });
  });
  it("20 khách → pax 21, phòng 11", () => {
    expect(tierConfig(20)).toEqual({ guests: 20, pax: 21, rooms: 11 });
  });
  it("pax = khách + 1 HDV; phòng = ceil(khách/2) + 1", () => {
    expect(tierConfig(10)).toEqual({ guests: 10, pax: 11, rooms: 6 });
    expect(tierConfig(15)).toEqual({ guests: 15, pax: 16, rooms: 9 });
  });
});

describe("calcTier / calcTiers — ma trận nhiều bậc", () => {
  const items: ManualItem[] = [
    item("hotel", 1_000_000, "KS"),
    item("meal", 200_000, "Ăn"),
    item("ticket", 100_000, "Vé"),
  ];

  it("calcTier(16) khớp case_16 của calcBaoGia (refactor không đổi hành vi)", () => {
    const tier = calcTier(items, 1, 26_000, 0, 16);
    expect(tier).toEqual(calcBaoGia(items, "T", 1, 26_000, 0).case_16);
  });
  it("calcTier(20) khớp case_20", () => {
    const tier = calcTier(items, 1, 26_000, 0, 20);
    expect(tier).toEqual(calcBaoGia(items, "T", 1, 26_000, 0).case_20);
  });

  it("calcTiers trả 1 case mỗi bậc, đúng số khách + thứ tự", () => {
    const cases = calcTiers(items, 1, 26_000, 0, [10, 16, 25]);
    expect(cases.map((c) => c.guests)).toEqual([10, 16, 25]);
  });

  it("giá/khách bậc 16 = 1,031,250 (16.5M / 16)", () => {
    const c = calcTier(items, 1, 26_000, 0, 16);
    expect(c.total_cost).toBe(16_500_000);
    expect(c.final_price_vnd).toBe(1_031_250);
  });

  it("nhóm đông hơn → giá/khách GIẢM (chi phí cố định chia đều)", () => {
    const [c10, c20, c30] = calcTiers(items, 1, 26_000, 0, [10, 20, 30]);
    expect(c10.final_price_vnd).toBeGreaterThan(c20.final_price_vnd);
    expect(c20.final_price_vnd).toBeGreaterThan(c30.final_price_vnd);
    expect(c10.final_price_vnd).toBe(1_110_000);
    expect(c30.final_price_vnd).toBe(970_000);
  });
});

describe("giaCuoiTierLines — bảng giá cuối nhập tay (land tour)", () => {
  it("USD = VND / tỷ giá; làm tròn VND", () => {
    const lines = giaCuoiTierLines([{ guests: 10, gia_ban_vnd: 5_200_001 }], 26_000);
    expect(lines).toHaveLength(1);
    expect(lines[0].gia_ban_vnd).toBe(5_200_001);
    expect(lines[0].gia_ban_usd).toBeCloseTo(5_200_001 / 26_000, 6);
  });

  it("sắp xếp tăng dần theo số khách", () => {
    const lines = giaCuoiTierLines(
      [
        { guests: 30, gia_ban_vnd: 3_000_000 },
        { guests: 10, gia_ban_vnd: 5_000_000 },
        { guests: 20, gia_ban_vnd: 4_000_000 },
      ],
      26_000,
    );
    expect(lines.map((l) => l.guests)).toEqual([10, 20, 30]);
  });

  it("lọc bậc guests ≤ 0", () => {
    const lines = giaCuoiTierLines(
      [
        { guests: 0, gia_ban_vnd: 1_000_000 },
        { guests: -5, gia_ban_vnd: 1_000_000 },
        { guests: 12, gia_ban_vnd: 2_000_000 },
      ],
      26_000,
    );
    expect(lines.map((l) => l.guests)).toEqual([12]);
  });

  it("tỷ giá ≤ 0 → USD = 0 (tránh chia 0), KHÔNG NaN/Infinity", () => {
    const lines = giaCuoiTierLines([{ guests: 10, gia_ban_vnd: 5_000_000 }], 0);
    expect(lines[0].gia_ban_usd).toBe(0);
  });

  it("undefined / rỗng → []", () => {
    expect(giaCuoiTierLines(undefined, 26_000)).toEqual([]);
    expect(giaCuoiTierLines([], 26_000)).toEqual([]);
  });

  it("gia_ban_vnd falsy (0/NaN) → 0, không vỡ", () => {
    const lines = giaCuoiTierLines(
      [{ guests: 10, gia_ban_vnd: 0 }, { guests: 20, gia_ban_vnd: NaN }],
      26_000,
    );
    expect(lines.map((l) => l.gia_ban_vnd)).toEqual([0, 0]);
    expect(lines.map((l) => l.gia_ban_usd)).toEqual([0, 0]);
  });
});

describe("giaCuoiBrackets — suy khoảng khách từ ngưỡng 'từ X'", () => {
  const tiers = [
    { guests: 10, gia_ban_vnd: 5_000_000 },
    { guests: 16, gia_ban_vnd: 4_500_000 },
    { guests: 26, gia_ban_vnd: 4_000_000 },
  ];

  it("khoảng nối liền theo ngưỡng kế; bậc cuối để mở", () => {
    const b = giaCuoiBrackets(tiers, 26_000);
    expect(b.map((x) => [x.guests_from, x.guests_to])).toEqual([
      [10, 15], [16, 25], [26, null],
    ]);
    expect(b.map((x) => x.label)).toEqual([
      "10–15 khách", "16–25 khách", "từ 26 khách",
    ]);
  });

  it("bậc rộng 1 khách (ngưỡng kế = +1) → label '1 số'", () => {
    const b = giaCuoiBrackets([{ guests: 10, gia_ban_vnd: 1 }, { guests: 11, gia_ban_vnd: 2 }], 26_000);
    expect(b[0].label).toBe("10 khách");
    expect(b[0].guests_to).toBe(10);
  });

  it("1 bậc duy nhất → 'từ X khách' (mở)", () => {
    const b = giaCuoiBrackets([{ guests: 8, gia_ban_vnd: 3_000_000 }], 26_000);
    expect(b).toHaveLength(1);
    expect(b[0].label).toBe("từ 8 khách");
    expect(b[0].guests_to).toBeNull();
  });

  it("rỗng → []", () => {
    expect(giaCuoiBrackets([], 26_000)).toEqual([]);
  });
});

describe("findBracketIndexForPax — tra bậc theo số khách", () => {
  const b = giaCuoiBrackets(
    [
      { guests: 10, gia_ban_vnd: 5_000_000 },
      { guests: 16, gia_ban_vnd: 4_500_000 },
      { guests: 26, gia_ban_vnd: 4_000_000 },
    ],
    26_000,
  );

  it("pax giữa khoảng → đúng bậc", () => {
    expect(findBracketIndexForPax(b, 12)).toBe(0); // 10–15
    expect(findBracketIndexForPax(b, 20)).toBe(1); // 16–25
    expect(findBracketIndexForPax(b, 40)).toBe(2); // từ 26
  });

  it("pax đúng ngưỡng → vào bậc đó (không phải bậc trước)", () => {
    expect(findBracketIndexForPax(b, 16)).toBe(1);
    expect(findBracketIndexForPax(b, 26)).toBe(2);
  });

  it("pax nhỏ hơn bậc thấp nhất → -1 (không bậc nào phủ)", () => {
    expect(findBracketIndexForPax(b, 5)).toBe(-1);
  });

  it("pax ≤ 0 → -1", () => {
    expect(findBracketIndexForPax(b, 0)).toBe(-1);
    expect(findBracketIndexForPax([], 10)).toBe(-1);
  });
});
