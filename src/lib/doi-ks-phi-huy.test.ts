import { describe, it, expect } from "vitest";
import { planDoiKsPhiHuy } from "./doi-ks-phi-huy";

describe("planDoiKsPhiHuy", () => {
  it("phí hủy 50% (ca Wyndham): 1 ĐNTT 40.68M, phí 20.34M → refund 20.34M", () => {
    const p = planDoiKsPhiHuy({
      paidByDntt: [{ dnttId: 1344, paidAmount: 40_680_000 }],
      phiHuyInput: 20_340_000,
    });
    expect(p.paidTotal).toBe(40_680_000);
    expect(p.phiHuy).toBe(20_340_000);
    expect(p.refund).toBe(20_340_000);
    expect(p.allocByDntt).toEqual([{ dnttId: 1344, soTien: 20_340_000 }]);
  });

  it("phí hủy = 0 → refund toàn bộ, alloc toàn 0", () => {
    const p = planDoiKsPhiHuy({
      paidByDntt: [{ dnttId: 1, paidAmount: 10_000_000 }],
      phiHuyInput: 0,
    });
    expect(p.refund).toBe(10_000_000);
    expect(p.phiHuy).toBe(0);
    expect(p.allocByDntt[0].soTien).toBe(0);
  });

  it("phí hủy vượt đã trả → kẹp về paidTotal, refund 0 (mất trắng)", () => {
    const p = planDoiKsPhiHuy({
      paidByDntt: [{ dnttId: 1, paidAmount: 5_000_000 }],
      phiHuyInput: 99_000_000,
    });
    expect(p.phiHuy).toBe(5_000_000);
    expect(p.refund).toBe(0);
    expect(p.allocByDntt[0].soTien).toBe(5_000_000);
  });

  it("nhiều ĐNTT: chia pro-rata theo paidAmount, tổng alloc === phí hủy", () => {
    const p = planDoiKsPhiHuy({
      paidByDntt: [
        { dnttId: 1, paidAmount: 30_000_000 }, // cọc
        { dnttId: 2, paidAmount: 10_000_000 }, // phần còn lại
      ],
      phiHuyInput: 15_000_000,
    });
    expect(p.paidTotal).toBe(40_000_000);
    const sum = p.allocByDntt.reduce((s, a) => s + a.soTien, 0);
    expect(sum).toBe(15_000_000); // không drift làm tròn (proRataInts)
    // tỷ lệ 3:1
    expect(p.allocByDntt[0].soTien).toBe(11_250_000);
    expect(p.allocByDntt[1].soTien).toBe(3_750_000);
  });

  it("không có ĐNTT trả (silent path) → mọi thứ 0", () => {
    const p = planDoiKsPhiHuy({ paidByDntt: [], phiHuyInput: 0 });
    expect(p.paidTotal).toBe(0);
    expect(p.phiHuy).toBe(0);
    expect(p.refund).toBe(0);
    expect(p.allocByDntt).toEqual([]);
  });

  it("số lẻ: chia không tròn vẫn khớp tổng (largest remainder)", () => {
    const p = planDoiKsPhiHuy({
      paidByDntt: [
        { dnttId: 1, paidAmount: 1_000_000 },
        { dnttId: 2, paidAmount: 1_000_000 },
        { dnttId: 3, paidAmount: 1_000_000 },
      ],
      phiHuyInput: 1_000_000, // 1M / 3 = 333,333.33
    });
    expect(p.allocByDntt.reduce((s, a) => s + a.soTien, 0)).toBe(1_000_000);
  });
});
