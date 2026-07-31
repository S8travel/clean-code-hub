import { describe, it, expect } from "vitest";
import { computeInitialDinhKyNhKeys, type DinhKyNhMeal } from "@/lib/nh-dinh-ky";

const meal = (over: Partial<DinhKyNhMeal> & { key: string }): DinhKyNhMeal => ({
  daCoChiPhi: false,
  ...over,
});

describe("computeInitialDinhKyNhKeys", () => {
  it("không có bữa nào → rỗng", () => {
    expect(computeInitialDinhKyNhKeys([]).size).toBe(0);
  });

  it("bữa CHƯA có chi phí + nhà hàng gắn cờ → seed định kỳ", () => {
    const s = computeInitialDinhKyNhKeys([meal({ key: "10_trua", nhMacDinh: true })]);
    expect([...s]).toEqual(["10_trua"]);
  });

  it("bữa CHƯA có chi phí + nhà hàng không gắn cờ → không seed", () => {
    expect(computeInitialDinhKyNhKeys([meal({ key: "10_trua", nhMacDinh: false })]).size).toBe(0);
  });

  // Chốt quan trọng: đổi cờ danh mục KHÔNG được đụng đoàn đã có chi phí.
  it("bữa ĐÃ có chi phí → theo DB, KHÔNG hồi sinh từ cờ danh mục", () => {
    const s = computeInitialDinhKyNhKeys([
      meal({ key: "10_trua", daCoChiPhi: true, chiPhiDinhKy: false, nhMacDinh: true }),
    ]);
    expect(s.size).toBe(0);
  });

  it("bữa ĐÃ có chi phí bật định kỳ → giữ, kể cả khi cờ danh mục tắt", () => {
    const s = computeInitialDinhKyNhKeys([
      meal({ key: "10_toi", daCoChiPhi: true, chiPhiDinhKy: true, nhMacDinh: false }),
    ]);
    expect([...s]).toEqual(["10_toi"]);
  });

  it("cùng nhà hàng ăn 2 bữa → xét riêng từng bữa", () => {
    const s = computeInitialDinhKyNhKeys([
      meal({ key: "10_trua", daCoChiPhi: true, chiPhiDinhKy: false, nhMacDinh: true }),
      meal({ key: "10_toi", daCoChiPhi: false, nhMacDinh: true }),
    ]);
    expect([...s]).toEqual(["10_toi"]);
  });

  it("null/undefined coi như tắt, không ném lỗi", () => {
    const s = computeInitialDinhKyNhKeys([
      meal({ key: "1_trua", daCoChiPhi: true, chiPhiDinhKy: null }),
      meal({ key: "2_trua", nhMacDinh: null }),
      meal({ key: "3_trua" }),
    ]);
    expect(s.size).toBe(0);
  });
});
