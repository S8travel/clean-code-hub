import { describe, it, expect } from "vitest";
import { calcBaoGia, type ManualItem } from "@/lib/bao-gia-calc";

const makeItem = (overrides: Partial<ManualItem> = {}): ManualItem => ({
  id: "1",
  ngay: 1,
  loai: "hotel",
  mo_ta_zh: "",
  mo_ta_goi_y: "suggestion",
  bang_gia_ten: "service name",
  gia: 100_000,
  ...overrides,
});

describe("calcBaoGia", () => {
  const BASE_ARGS = {
    tenChuongTrinh: "Test Tour",
    soNgay: 3,
    exchangeRate: 25_000,
    profitUsd: 10,
    tienXe: 0,
    tienPhuThu: 0,
  };

  describe("output shape", () => {
    it("returns both case_16 and case_20 with correct guest counts", () => {
      const result = calcBaoGia([], BASE_ARGS.tenChuongTrinh, BASE_ARGS.soNgay, BASE_ARGS.exchangeRate, BASE_ARGS.profitUsd);
      expect(result.case_16.guests).toBe(16);
      expect(result.case_20.guests).toBe(20);
    });

    it("returns the tour program name", () => {
      const result = calcBaoGia([], "My Tour", 3, 25_000, 10);
      expect(result.ten_chuong_trinh).toBe("My Tour");
    });

    it("returns so_ngay correctly", () => {
      const result = calcBaoGia([], "T", 5, 25_000, 10);
      expect(result.so_ngay).toBe(5);
    });

    it("average price is arithmetic mean of the two case final prices", () => {
      const result = calcBaoGia([], "T", 3, 25_000, 10);
      expect(result.gia_trung_binh_vnd).toBe(
        Math.round((result.case_16.final_price_vnd + result.case_20.final_price_vnd) / 2)
      );
      expect(result.gia_trung_binh_usd).toBeCloseTo(
        (result.case_16.final_price_usd + result.case_20.final_price_usd) / 2
      );
    });
  });

  describe("hotel cost", () => {
    it("multiplies hotel item price by rooms (9 for case_16, 11 for case_20)", () => {
      const items = [makeItem({ loai: "hotel", gia: 500_000 })];
      const result = calcBaoGia(items, "T", 3, 25_000, 10);
      expect(result.case_16.hotel).toBe(500_000 * 9);
      expect(result.case_20.hotel).toBe(500_000 * 11);
    });

    it("sums multiple hotel items", () => {
      const items = [
        makeItem({ id: "1", loai: "hotel", gia: 500_000 }),
        makeItem({ id: "2", loai: "hotel", gia: 300_000 }),
      ];
      const result = calcBaoGia(items, "T", 3, 25_000, 10);
      expect(result.case_16.hotel).toBe((500_000 + 300_000) * 9);
    });

    it("excludes hotel items with null gia", () => {
      const items = [
        makeItem({ id: "1", loai: "hotel", gia: 500_000 }),
        makeItem({ id: "2", loai: "hotel", gia: null }),
      ];
      const result = calcBaoGia(items, "T", 3, 25_000, 10);
      expect(result.case_16.hotel).toBe(500_000 * 9);
    });
  });

  describe("meal cost", () => {
    it("multiplies meal price by pax (17 for case_16, 21 for case_20)", () => {
      const items = [makeItem({ loai: "meal", gia: 200_000 })];
      const result = calcBaoGia(items, "T", 3, 25_000, 10);
      expect(result.case_16.meal).toBe(200_000 * 17);
      expect(result.case_20.meal).toBe(200_000 * 21);
    });
  });

  describe("ticket cost", () => {
    it("multiplies ticket price by pax", () => {
      const items = [makeItem({ loai: "ticket", gia: 150_000 })];
      const result = calcBaoGia(items, "T", 3, 25_000, 10);
      expect(result.case_16.ticket).toBe(150_000 * 17);
      expect(result.case_20.ticket).toBe(150_000 * 21);
    });
  });

  describe("transport cost", () => {
    it("adds tienXe and tienPhuThu to transport", () => {
      const result = calcBaoGia([], "T", 3, 25_000, 10, 5_000_000, 1_000_000);
      expect(result.case_16.transport).toBe(6_000_000);
      expect(result.case_20.transport).toBe(6_000_000);
    });

    it("adds flat transport items to transport", () => {
      const items = [makeItem({ loai: "transport", gia: 2_000_000 })];
      const result = calcBaoGia(items, "T", 3, 25_000, 10, 0, 0);
      expect(result.case_16.transport).toBe(2_000_000);
    });

    it("adds flat extra items to transport", () => {
      const items = [makeItem({ loai: "extra", gia: 1_500_000 })];
      const result = calcBaoGia(items, "T", 3, 25_000, 10, 0, 0);
      expect(result.case_16.transport).toBe(1_500_000);
    });
  });

  describe("fixed costs", () => {
    it("insurance = 100,000 × pax", () => {
      const result = calcBaoGia([], "T", 3, 25_000, 10);
      expect(result.case_16.insurance).toBe(100_000 * 17);
      expect(result.case_20.insurance).toBe(100_000 * 21);
    });

    it("guide cost = 200,000 × soNgay", () => {
      const result = calcBaoGia([], "T", 4, 25_000, 10);
      expect(result.case_16.guide).toBe(200_000 * 4);
      expect(result.case_20.guide).toBe(200_000 * 4);
    });

    it("tips = 500,000 fixed", () => {
      const result = calcBaoGia([], "T", 3, 25_000, 10);
      expect(result.case_16.tips).toBe(500_000);
      expect(result.case_20.tips).toBe(500_000);
    });
  });

  describe("price calculation", () => {
    it("total_cost equals sum of all cost buckets", () => {
      const result = calcBaoGia([], "T", 3, 25_000, 10);
      const c = result.case_16;
      expect(c.total_cost).toBe(c.hotel + c.meal + c.ticket + c.transport + c.insurance + c.guide + c.tips);
    });

    it("profit_vnd uses guests (not pax)", () => {
      const result = calcBaoGia([], "T", 3, 25_000, 10);
      // case_16: guests=16, profit=10 USD * 25,000 * 16
      expect(result.case_16.profit_vnd).toBe(10 * 25_000 * 16);
      expect(result.case_20.profit_vnd).toBe(10 * 25_000 * 20);
    });

    it("final_price_vnd is rounded to nearest integer", () => {
      const result = calcBaoGia([], "T", 3, 25_000, 10);
      expect(Number.isInteger(result.case_16.final_price_vnd)).toBe(true);
      expect(Number.isInteger(result.case_20.final_price_vnd)).toBe(true);
    });

    it("final_price_usd = final_price_vnd / exchangeRate", () => {
      const result = calcBaoGia([], "T", 3, 25_000, 10);
      expect(result.case_16.final_price_usd).toBeCloseTo(result.case_16.final_price_vnd / 25_000);
    });
  });

  describe("baoGiaItems mapping", () => {
    it("excludes items with null gia", () => {
      const items = [
        makeItem({ id: "1", gia: 100_000, bang_gia_ten: "Keep" }),
        makeItem({ id: "2", gia: null, bang_gia_ten: "Exclude" }),
      ];
      const result = calcBaoGia(items, "T", 3, 25_000, 10);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].mo_ta).toBe("Keep");
    });

    it("prefers bang_gia_ten over mo_ta_goi_y for mo_ta", () => {
      const items = [makeItem({ bang_gia_ten: "Primary", mo_ta_goi_y: "Fallback", gia: 100_000 })];
      const result = calcBaoGia(items, "T", 3, 25_000, 10);
      expect(result.items[0].mo_ta).toBe("Primary");
    });

    it("falls back to mo_ta_goi_y when bang_gia_ten is empty", () => {
      const items = [makeItem({ bang_gia_ten: "", mo_ta_goi_y: "Fallback", gia: 100_000 })];
      const result = calcBaoGia(items, "T", 3, 25_000, 10);
      expect(result.items[0].mo_ta).toBe("Fallback");
    });

    it("returns zero items for empty input", () => {
      const result = calcBaoGia([], "T", 3, 25_000, 10);
      expect(result.items).toHaveLength(0);
    });
  });
});
