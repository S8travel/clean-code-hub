import { describe, it, expect } from "vitest";
import { calcKSPaidTotal, type KSPaidDnttInfo } from "./ks-section-shared";

const dntt = (over: Partial<KSPaidDnttInfo> = {}): KSPaidDnttInfo => ({
  id: 1,
  trang_thai_duyet: "da_duyet",
  ref_loai: "khach_san",
  ref_id: 1034,
  paid_amount: 0,
  ...over,
});

describe("calcKSPaidTotal", () => {
  it("cộng paid_amount của ĐNTT non-cọc đã trả 1 phần (bug gốc)", () => {
    // #743 đã trả 58.760.000 (la_coc=false), đang in #858 còn lại 24.440.000.
    const list = [
      dntt({ id: 743, paid_amount: 58_760_000 }),
      dntt({ id: 858, paid_amount: 0 }),
    ];
    expect(calcKSPaidTotal(list, 858, 1034)).toBe(58_760_000);
  });

  it("loại ĐNTT đang in khỏi tổng", () => {
    const list = [dntt({ id: 858, paid_amount: 24_440_000 })];
    expect(calcKSPaidTotal(list, 858, 1034)).toBe(0);
  });

  it("loại ĐNTT đã hủy / từ chối", () => {
    const list = [
      dntt({ id: 743, paid_amount: 10_000_000, trang_thai_duyet: "da_huy" }),
      dntt({ id: 744, paid_amount: 20_000_000, trang_thai_duyet: "tu_choi" }),
      dntt({ id: 745, paid_amount: 30_000_000 }),
    ];
    expect(calcKSPaidTotal(list, 858, 1034)).toBe(30_000_000);
  });

  it("chỉ cộng ĐNTT cùng khách sạn (ref_loai + ref_id khớp)", () => {
    const list = [
      dntt({ id: 743, paid_amount: 10_000_000, ref_id: 9999 }),
      dntt({ id: 744, paid_amount: 20_000_000, ref_loai: "doan_chi_phi" }),
      dntt({ id: 745, paid_amount: 30_000_000 }),
    ];
    expect(calcKSPaidTotal(list, 858, 1034)).toBe(30_000_000);
  });

  it("gộp nhiều ĐNTT đã trả của cùng KS (cọc + bổ sung)", () => {
    const list = [
      dntt({ id: 743, paid_amount: 58_760_000 }),
      dntt({ id: 744, paid_amount: 10_000_000 }),
    ];
    expect(calcKSPaidTotal(list, 858, 1034)).toBe(68_760_000);
  });
});
