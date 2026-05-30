import { describe, it, expect } from "vitest";
import { calcQuyetToanHDV, type QuyetToanHDVInput } from "./quyet-toan-hdv-calc";

const base = (p: Partial<QuyetToanHDVInput> = {}): QuyetToanHDVInput => ({
  tamUng: 0,
  thuTrachNhiem: 0,
  tip: { soKhach: 0, donGiaNT: 0, soNgay: 0, tyGia: 0 },
  dauKhach: { soKhach: 0, donGia: 0 },
  quyVp: { soLuong: 0, donGia: 0 },
  thuBanOp: 0,
  thuKhac: 0,
  tongHdvChi: 0,
  ...p,
});

describe("calcQuyetToanHDV", () => {
  it("cộng đủ các khoản thu + tip quy VND", () => {
    const r = calcQuyetToanHDV(base({
      tamUng: 5_000_000,
      thuTrachNhiem: 1_000_000,
      tip: { soKhach: 28, donGiaNT: 150, soNgay: 8, tyGia: 800 }, // 26.880.000
      dauKhach: { soKhach: 28, donGia: 200_000 },                 // 5.600.000
      quyVp: { soLuong: 1, donGia: 200_000 },                     // 200.000
      thuBanOp: 300_000,
      thuKhac: 100_000,
      tongHdvChi: 50_000_000,
    }));
    expect(r.thuTipVnd).toBe(26_880_000);
    expect(r.thuDauKhachVnd).toBe(5_600_000);
    expect(r.thuQuyVpVnd).toBe(200_000);
    expect(r.tongThu).toBe(
      5_000_000 + 1_000_000 + 26_880_000 + 5_600_000 + 200_000 + 300_000 + 100_000,
    );
    expect(r.tongThu).toBe(39_080_000);
    expect(r.conPhaiThanhToan).toBe(50_000_000 - 39_080_000); // 10.920.000 > 0 → cty trả HDV
  });

  it("conPhaiThanhToan < 0 → HDV phải hoàn lại (thu hồi tạm ứng thừa)", () => {
    const r = calcQuyetToanHDV(base({
      tamUng: 20_000_000,
      tongHdvChi: 12_000_000,
    }));
    expect(r.tongThu).toBe(20_000_000);
    expect(r.conPhaiThanhToan).toBe(-8_000_000);
  });

  it("toàn 0 → mọi kết quả 0", () => {
    const r = calcQuyetToanHDV(base());
    expect(r).toEqual({
      thuTipVnd: 0,
      thuDauKhachVnd: 0,
      thuQuyVpVnd: 0,
      tongThu: 0,
      conPhaiThanhToan: 0,
    });
  });

  it("cân bằng (tổng thu = HDV chi) → conPhaiThanhToan = 0", () => {
    const r = calcQuyetToanHDV(base({
      tamUng: 8_000_000,
      tongHdvChi: 8_000_000,
    }));
    expect(r.conPhaiThanhToan).toBe(0);
  });
});
