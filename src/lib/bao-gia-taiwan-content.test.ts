import { describe, it, expect } from "vitest";
import {
  boMucTien, laChuongTrinhGolf, taiwanDefaultBrackets, taiwanExportDefaults, taiwanQuoteContent,
} from "./bao-gia-taiwan-content";
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

  it("đủ 6 mốc, nhãn liền mạch không chồng khoảng", () => {
    expect(b.map((x) => x.label)).toEqual([
      "6-9 pax", "10-14 pax", "15-19 pax", "20-24 pax", "25-29 pax", "30pax以上",
    ]);
  });

  it("15-19 = ĐÚNG giá chuẩn 16 pax — neo của cả bảng", () => {
    expect(at("15-19").price_usd).toBe(365);
  });

  it("đoàn nhỏ cộng lên: 10-14 = 15-19 + 30; 6-9 = 10-14 + 70", () => {
    expect(at("10-14").price_usd).toBe(395);
    expect(at("6-9").price_usd).toBe(465);
  });

  it("đoàn to bớt dần theo bậc liền trước: −15, rồi −7, rồi −7", () => {
    expect(at("20-24").price_usd).toBe(350);
    expect(at("25-29").price_usd).toBe(343);
    expect(at("30pax").price_usd).toBe(336);
  });

  it("giá giảm dần theo cỡ đoàn — đoàn to không bao giờ đắt hơn đoàn nhỏ", () => {
    const gia = b.map((x) => x.price_usd!);
    for (let i = 1; i < gia.length; i++) expect(gia[i]).toBeLessThanOrEqual(gia[i - 1]);
  });

  it("KHÔNG mốc nào trôi theo cỡ đoàn OP đặt ở bảng chi phí", () => {
    // OP đổi tier_guests sang [12, 30] để xem thử — bảng chào khách vẫn neo 16 pax.
    const b2 = taiwanDefaultBrackets(ket(365, 352, { tier_guests: [12, 30] }));
    expect(b2).toEqual(b);
  });

  it("bậc 20 pax trong bảng chi phí KHÔNG còn kéo giá chào (chính sách 09/2026)", () => {
    expect(taiwanDefaultBrackets(ket(365, 300))).toEqual(b);
  });

  it("báo giá cũ thiếu case_16 → lùi về giá trung bình, không ra NaN", () => {
    const cu = { ...ket(0, 0), gia_trung_binh_usd: 300 } as unknown as BaoGiaKetQua;
    delete (cu as Partial<BaoGiaKetQua>).case_16;
    delete (cu as Partial<BaoGiaKetQua>).case_20;
    const b3 = taiwanDefaultBrackets(cu);
    expect(b3.map((x) => x.price_usd)).toEqual([400, 330, 300, 285, 278, 271]);
  });

  it("mỗi mốc kèm cỡ xe — đoàn càng đông xe càng nhiều chỗ, từ 15-19 trở lên là 45 chỗ", () => {
    expect(b.map((x) => x.xe)).toEqual([
      "29人坐", "35人坐", "45人坐", "45人坐", "45人坐", "45人坐",
    ]);
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

  it("備註 mặc định nói trước: cao điểm phải đổi khách sạn thì thu bù chênh lệch", () => {
    const c = taiwanQuoteContent(ket(365, 352), items, 26000);
    expect(c.notes).toEqual([
      "以上價格使用行程寫上的飯店為主",
      "若遇到高峰期間 同等級都沒有房 需要拿到其他酒店價格過高 一定需要補價差的 價差多少會以實際狀況回報正確的價格",
    ]);
  });

  it("OP xoá trắng ô 備註 thì tôn trọng — không tự dựng lại câu mặc định", () => {
    const k = ket(365, 352, { export_config: { notes: "" } });
    expect(taiwanQuoteContent(k, items, 26000).notes).toEqual([]);
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
    expect(c.brackets).toEqual([{ label: "16 pax", price_usd: 400, xe: undefined }]);
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

describe("mốc 4-5 pax — riêng chương trình đánh golf", () => {
  const ve = (mo_ta: string, ten_zh?: string): BaoGiaItem =>
    ({ loai: "ticket", mo_ta, don_gia: 100_000, ghi_chu: "", ngay_so: 1, ten_zh });

  const thuong = ket(365, 352);
  const golf = ket(365, 352, { ten_chuong_trinh: "GOLF SERI 5天3球" });

  it("tour thường: vẫn 6 mốc như cũ, không tự đẻ thêm cột", () => {
    expect(taiwanDefaultBrackets(thuong)).toHaveLength(6);
    expect(taiwanDefaultBrackets(thuong)[0].label).toBe("6-9 pax");
  });

  it("tên chương trình có GOLF → thêm mốc 4-5 pax ở ĐẦU bảng, xe 16 chỗ", () => {
    const b = taiwanDefaultBrackets(golf);
    expect(b).toHaveLength(7);
    expect(b[0]).toEqual({ label: "4-5pax", price_usd: null, xe: "16人坐" });
  });

  it("giá mốc 4-5 pax ĐỂ TRỐNG (null) — không phải 0, kẻo file in $0 cho khách", () => {
    expect(taiwanDefaultBrackets(golf)[0].price_usd).toBeNull();
  });

  it("thêm mốc 4-5 pax KHÔNG làm xê dịch giá của 6 mốc còn lại", () => {
    expect(taiwanDefaultBrackets(golf).slice(1).map((b) => b.price_usd))
      .toEqual(taiwanDefaultBrackets(thuong).map((b) => b.price_usd));
  });

  it("dòng vé green fee cũng tính — tên chương trình không nhắc golf vẫn bắt được", () => {
    expect(laChuongTrinhGolf(thuong, [ve("Sân golf 18 hố")])).toBe(true);
    expect(laChuongTrinhGolf(thuong, [ve("Sân bóng", "高爾夫球場（18洞）")])).toBe(true);
    expect(laChuongTrinhGolf(thuong, [ve("Vịnh Hạ Long", "下龍灣")])).toBe(false);
  });

  it("bắt cả chữ toàn chiều rộng và viết tắt Đài Loan", () => {
    expect(laChuongTrinhGolf(thuong, [ve("ＧＯＬＦ ５Ｄ")])).toBe(true);
    expect(laChuongTrinhGolf(thuong, [ve("", "高球套裝行程")])).toBe(true);
    expect(laChuongTrinhGolf(thuong, [ve("", "高尔夫球场")])).toBe(true);
  });

  it("ngủ ở resort tên golf KHÔNG tính là đi đánh golf", () => {
    const ksGolf: BaoGiaItem = {
      loai: "hotel", mo_ta: "Resort Golf ven biển", don_gia: 2_000_000, ghi_chu: "", ngay_so: 1,
    };
    expect(laChuongTrinhGolf(thuong, [ksGolf])).toBe(false);
  });

  it("đi cả đường qua taiwanQuoteContent — file Word và cổng cùng thấy mốc này", () => {
    const c = taiwanQuoteContent(thuong, [ve("Sân golf 18 hố")], 26000);
    expect(c.brackets[0]).toEqual({ label: "4-5pax", price_usd: null, xe: "16人坐" });
  });
});

describe("cỡ xe dưới nhãn pax", () => {
  const k = ket(365, 352);

  it("báo giá lưu trước khi có cột xe → tự điền cỡ xe theo nhãn bậc", () => {
    const cu = ket(365, 352, {
      export_config: { brackets: [{ label: "15-19 pax", price_usd: 365 }] },
    });
    expect(taiwanQuoteContent(cu, [], 26000).brackets[0].xe).toBe("45人坐");
  });

  it("OP xoá trắng ô xe thì tôn trọng — không tự dựng lại cỡ mặc định", () => {
    const k2 = ket(365, 352, {
      export_config: { brackets: [{ label: "15-19 pax", price_usd: 365, xe: "" }] },
    });
    expect(taiwanQuoteContent(k2, [], 26000).brackets[0].xe).toBe("");
  });

  it("nhãn tự gõ không có trong bảng → ô xe để trống, không đoán bừa", () => {
    const k2 = ket(365, 352, {
      export_config: { brackets: [{ label: "40 pax trở lên", price_usd: 300 }] },
    });
    expect(taiwanQuoteContent(k2, [], 26000).brackets[0].xe).toBeUndefined();
  });

  it("taiwanExportDefaults cũng mang cỡ xe — editor hiện đúng thứ file Word in", () => {
    expect(taiwanExportDefaults(k, [], 26000).brackets.every((b) => !!b.xe)).toBe(true);
  });
});

describe("報價不含 đã bỏ — chỉ còn MỘT khối không-bao-gồm", () => {
  const k = ket(365, 352);

  it("excluded luôn rỗng, kể cả báo giá cũ còn lưu nội dung đó", () => {
    const cu = ket(365, 352, {
      export_config: { excluded: "簽證、機票" } as BaoGiaKetQua["export_config"],
    });
    expect(taiwanQuoteContent(k, [], 26000).excluded).toEqual([]);
    expect(taiwanQuoteContent(cu, [], 26000).excluded).toEqual([]);
  });

  it("nội dung không-bao-gồm vẫn còn nguyên ở 以上價格不含", () => {
    const c = taiwanQuoteContent(k, [], 26000);
    expect(c.above_notes.some((l) => l.includes("簽證"))).toBe(true);
  });
});

describe("升等車資 — bù tiền đổi loại xe", () => {
  const k = ket(365, 352);
  const golf = ket(365, 352, { ten_chuong_trinh: "GOLF SERI 5天3球" });

  it("mặc định có câu dẫn + đủ 4 mức bù, khớp đúng cỡ xe in trong bảng", () => {
    const d = taiwanQuoteContent(k, [], 26000).xe_nang_cap;
    expect(d).toHaveLength(5);
    expect(d[0]).toContain("本報價用普通的遊覽車車資估價");
    expect(d.slice(1)).toEqual([
      "1. 16人坐改 9人坐保姆車 要補 250USD/台",
      "2. 29人坐改VIP三排椅 要補 300USD/台",
      "3. 35人坐改VIP三排椅 要補 250USD/台",
      "4. 45人坐改 VIP 三排椅 要補 200USD/台",
    ]);
  });

  it("mọi cỡ xe có trong bảng giá đều có mức bù tương ứng — không để hở cỡ nào", () => {
    const c = taiwanQuoteContent(golf, [], 26000);
    const coXe = [...new Set(c.brackets.map((b) => b.xe).filter(Boolean))];
    const vanBan = c.xe_nang_cap.join(" ");
    for (const xe of coXe) expect(vanBan).toContain(xe as string);
  });

  it("OP sửa tay thì đè lên mặc định", () => {
    const k2 = ket(365, 352, { export_config: { xe_nang_cap: "自訂升等價" } });
    expect(taiwanQuoteContent(k2, [], 26000).xe_nang_cap).toEqual(["自訂升等價"]);
  });

  it("OP xoá trắng thì tôn trọng — không dựng lại câu mặc định", () => {
    const k2 = ket(365, 352, { export_config: { xe_nang_cap: "" } });
    expect(taiwanQuoteContent(k2, [], 26000).xe_nang_cap).toEqual([]);
  });
});
