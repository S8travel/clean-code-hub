import { describe, it, expect } from "vitest";
import { boMucTien, taiwanDefaultBrackets, taiwanExportDefaults, taiwanQuoteContent } from "./bao-gia-taiwan-content";
import type { BaoGiaCase, BaoGiaItem, BaoGiaKetQua } from "@/hooks/use-bao-gia";

const kase = (guests: number, usd: number): BaoGiaCase => ({
  guests, pax: guests + 1, rooms: Math.ceil(guests / 2) + 1,
  hotel: 0, meal: 0, ticket: 0, transport: 0, insurance: 0, guide: 0, tips: 0,
  total_cost: 0, profit_vnd: 0,
  final_price_vnd: Math.round(usd * 26000), final_price_usd: usd,
});

const ket = (p16: number, p20: number, over: Partial<BaoGiaKetQua> = {}): BaoGiaKetQua => ({
  ten_chuong_trinh: "Tour test",
  so_ngay: 5,
  items: [],
  case_16: kase(16, p16),
  case_20: kase(20, p20),
  gia_trung_binh_vnd: Math.round((p16 + p20) / 2 * 26000),
  gia_trung_binh_usd: (p16 + p20) / 2,
  ...over,
});

describe("taiwanDefaultBrackets — mốc giá mặc định bảng báo giá Đài Loan", () => {
  // Số mẫu lấy từ hồ sơ Đài Loan thật: 16 pax = 365 USD, 20 pax = 352 USD.
  const b = taiwanDefaultBrackets(ket(365, 352));
  const at = (label: string) => b.find((x) => x.label.startsWith(label))!;

  it("đủ 5 mốc, nhãn liền mạch không chồng khoảng", () => {
    expect(b.map((x) => x.label)).toEqual([
      "10-14 pax", "15-19 pax", "20-24 pax", "25-29 pax", "30pax以上",
    ]);
  });

  it("10-14 giữ nguyên cách cũ: giá trung bình + 30", () => {
    expect(at("10-14").price_usd).toBe(Math.round((365 + 352) / 2) + 30); // 359 + 30
  });

  it("15-19 = ĐÚNG giá chuẩn 16 pax, 20-24 = ĐÚNG giá chuẩn 20 pax", () => {
    expect(at("15-19").price_usd).toBe(365);
    expect(at("20-24").price_usd).toBe(352);
  });

  it("25-29 = giá 20 pax − 7; 30+ = giá 20 pax − 12", () => {
    expect(at("25-29").price_usd).toBe(345);
    expect(at("30pax").price_usd).toBe(340);
  });

  it("giá giảm dần theo cỡ đoàn — đoàn to không bao giờ đắt hơn đoàn nhỏ", () => {
    const gia = b.map((x) => x.price_usd);
    for (let i = 1; i < gia.length; i++) expect(gia[i]).toBeLessThanOrEqual(gia[i - 1]);
  });

  it("mốc 15-19 và 20-24 KHÔNG trôi theo cỡ đoàn OP đặt ở bảng chi phí", () => {
    // OP đổi tier_guests sang [12, 30] để xem thử — mốc chào khách vẫn neo 16/20.
    const b2 = taiwanDefaultBrackets(ket(365, 352, { tier_guests: [12, 30] }));
    expect(b2[1].price_usd).toBe(365);
    expect(b2[2].price_usd).toBe(352);
  });

  it("báo giá cũ thiếu case_16/case_20 → lùi về giá trung bình, không ra NaN", () => {
    const cu = { ...ket(0, 0), gia_trung_binh_usd: 300 } as unknown as BaoGiaKetQua;
    delete (cu as Partial<BaoGiaKetQua>).case_16;
    delete (cu as Partial<BaoGiaKetQua>).case_20;
    const b3 = taiwanDefaultBrackets(cu);
    expect(b3.map((x) => x.price_usd)).toEqual([330, 300, 300, 293, 288]);
  });

  it("taiwanExportDefaults dùng chính bộ mốc này (editor + file Word cùng nguồn)", () => {
    const k = ket(365, 352);
    expect(taiwanExportDefaults(k, [], 26000).brackets).toEqual(taiwanDefaultBrackets(k));
  });
});

describe("taiwanQuoteContent — nội dung 報價 dùng chung Word + cổng đối tác", () => {
  const items: BaoGiaItem[] = [
    { loai: "hotel", mo_ta: "Hotel B", don_gia: 1_000_000, ghi_chu: "", ngay_so: 2 },
    { loai: "hotel", mo_ta: "Hotel A", don_gia: 1_600_000, ghi_chu: "", ngay_so: 1 },
    { loai: "hotel", mo_ta: "   ",     don_gia: 500_000,   ghi_chu: "", ngay_so: 3 },
    { loai: "ticket", mo_ta: "Vịnh Hạ Long", don_gia: 300_000, ghi_chu: "", ngay_so: 2, ten_zh: "下龍灣" },
    { loai: "ticket", mo_ta: "Vịnh Hạ Long", don_gia: 300_000, ghi_chu: "", ngay_so: 3, ten_zh: "下龍灣" },
    { loai: "ticket", mo_ta: "Bà Nà Hills", don_gia: 900_000, ghi_chu: "", ngay_so: 4 },
    { loai: "meal",  mo_ta: "Nhà hàng X", don_gia: 150_000, ghi_chu: "", ngay_so: 1 },
  ];

  it("khách sạn xếp theo ngày tăng dần, bỏ dòng trống tên", () => {
    const c = taiwanQuoteContent(ket(365, 352), items, 26000);
    expect(c.hotel_days).toEqual([
      { ngay: 1, ten: "Hotel A" },
      { ngay: 2, ten: "Hotel B" },
    ]);
  });

  it("cảnh điểm mất phí: ưu tiên tên tiếng Trung, lọc trùng, nối vào 報價包含", () => {
    const c = taiwanQuoteContent(ket(365, 352), items, 26000);
    expect(c.sights).toEqual(["下龍灣", "Bà Nà Hills"]);
    // 5 mục mặc định + 2 cảnh điểm
    expect(c.included).toHaveLength(7);
    expect(c.included.slice(-2)).toEqual(["下龍灣", "Bà Nà Hills"]);
  });

  it("單房差 mặc định = nửa tiền phòng cả tour quy USD + 10", () => {
    const c = taiwanQuoteContent(ket(365, 352), items, 26000);
    // (1.000.000 + 1.600.000 + 500.000) / 2 / 26.000 ≈ 60 → +10
    expect(c.single_supplement_usd).toBe(Math.round(3_100_000 / 2 / 26000) + 10);
  });

  it("OP sửa tay (export_config) ĐÈ lên mặc định — cả bậc giá lẫn text", () => {
    const k = ket(365, 352, {
      export_config: {
        brackets: [{ label: "16 pax", price_usd: 400 }],
        single_supplement_usd: 99,
        notes: "特別備註\n\n第二行",
      },
    });
    const c = taiwanQuoteContent(k, items, 26000);
    expect(c.brackets).toEqual([{ label: "16 pax", price_usd: 400 }]);
    expect(c.single_supplement_usd).toBe(99);
    expect(c.notes).toEqual(["特別備註", "第二行"]); // dòng trống bị loại
  });

  it("chỉ chứa giá BÁN — không mang theo đơn giá vốn của bất kỳ dòng nào", () => {
    const c = taiwanQuoteContent(ket(365, 352), items, 26000);
    const blob = JSON.stringify(c);
    for (const gia of ["1000000", "1600000", "300000", "900000", "150000"]) {
      expect(blob).not.toContain(gia);
    }
  });
});

describe("boMucTien — chặn mức tiền lọt vào bản gửi khách, giữ nguyên chữ", () => {
  it("cắt ký hiệu tiền đứng trước số, kèm phần /người", () => {
    expect(boMucTien("越式SPA／按摩 90分鐘$700/位")).toBe("越式SPA／按摩 90分鐘");
  });

  it("cắt số đứng trước đơn vị tiền", () => {
    expect(boMucTien("越式料理 7USD")).toBe("越式料理");
    expect(boMucTien("海鮮餐合菜 8美金")).toBe("海鮮餐合菜");
  });

  it("GIỮ NGUYÊN lời hứa tặng — đó là điểm bán, khách phải thấy", () => {
    expect(boMucTien("電瓶車遊36古街(送古街下午茶)")).toBe("電瓶車遊36古街(送古街下午茶)");
    expect(boMucTien("百年酒窖贈紅酒一杯")).toBe("百年酒窖贈紅酒一杯");
    expect(boMucTien("加贈法國山城百年酒窖(含每人一杯葡萄酒或無酒精飲料)"))
      .toBe("加贈法國山城百年酒窖(含每人一杯葡萄酒或無酒精飲料)");
  });

  it("KHÔNG đụng số đi kèm đơn vị vô hại — cắt nhầm là hỏng tên dịch vụ", () => {
    expect(boMucTien("下龍灣遊船4小時")).toBe("下龍灣遊船4小時");
    expect(boMucTien("三十六古街")).toBe("三十六古街");
    expect(boMucTien("長安生態保護區 含遊船四人一艘")).toBe("長安生態保護區 含遊船四人一艘");
  });

  it("dọn dấu ngoặc rỗng và dấu câu thừa còn lại sau khi cắt", () => {
    expect(boMucTien("按摩 ($700)")).toBe("按摩");
    expect(boMucTien("Buffet trưa, 10USD")).toBe("Buffet trưa");
  });

  it("chuỗi không có tiền thì trả về y nguyên", () => {
    expect(boMucTien("會安古鎮")).toBe("會安古鎮");
    expect(boMucTien("")).toBe("");
  });
});
