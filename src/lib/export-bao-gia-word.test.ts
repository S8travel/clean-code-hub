import { describe, it, expect } from "vitest";
import { taiwanDefaultBrackets, taiwanExportDefaults } from "./export-bao-gia-word";
import type { BaoGiaCase, BaoGiaKetQua } from "@/hooks/use-bao-gia";

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
