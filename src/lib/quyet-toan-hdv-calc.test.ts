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

// VND không có đơn vị lẻ. tongHdvChi cộng từ chi phí có phần thập phân (pro-rata,
// chiết khấu, FOC) → nếu không tròn thì ĐNTT ra kiểu 4044499.879999999 và kế toán
// phải sửa tay từng phiếu (OP báo 22/07/2026).
describe("làm tròn — mọi số tiền phải là số nguyên VND", () => {
  it("ca thật: tongHdvChi lẻ thập phân → conPhaiThanhToan vẫn tròn", () => {
    const r = calcQuyetToanHDV(base({
      tip: { soKhach: 18, donGiaNT: 150, soNgay: 5, tyGia: 803 }, // 10.840.500
      quyVp: { soLuong: 1, donGia: 250_000 },
      tongHdvChi: 15_134_999.879999999,
    }));
    expect(r.tongThu).toBe(11_090_500);
    expect(r.conPhaiThanhToan).toBe(4_044_500);
    expect(Number.isInteger(r.conPhaiThanhToan)).toBe(true);
  });

  it("mọi khoản lẻ đều được tròn, không sót cột nào", () => {
    const r = calcQuyetToanHDV(base({
      tamUng: 1_000_000.4,
      thuTrachNhiem: 500_000.6,
      tip: { soKhach: 3, donGiaNT: 33.33, soNgay: 1, tyGia: 800 }, // 79.992
      dauKhach: { soKhach: 3, donGia: 66_666.67 },
      quyVp: { soLuong: 1, donGia: 12_345.55 },
      thuBanOp: 111.4,
      thuKhac: 222.6,
      tongHdvChi: 9_999_999.99,
    }));
    for (const v of Object.values(r)) expect(Number.isInteger(v)).toBe(true);
  });

  it("tổng thu = đúng tổng CÁC KHOẢN ĐÃ TRÒN (không lệch 1đ với mắt nhìn)", () => {
    const r = calcQuyetToanHDV(base({
      tamUng: 100.5,
      thuTrachNhiem: 200.5,
      dauKhach: { soKhach: 1, donGia: 300.5 },
      quyVp: { soLuong: 1, donGia: 400.5 },
      thuBanOp: 500.5,
      thuKhac: 600.5,
    }));
    // Math.round: .5 làm tròn LÊN → 101+201+0+301+401+501+601
    expect(r.tongThu).toBe(101 + 201 + 0 + 301 + 401 + 501 + 601);
    expect(r.tongThu).toBe(
      101 + 201 + r.thuTipVnd + r.thuDauKhachVnd + r.thuQuyVpVnd + 501 + 601,
    );
  });

  it("tip khoán lẻ cũng được tròn", () => {
    const r = calcQuyetToanHDV(base({
      tip: { soKhach: 10, donGiaNT: 0, soNgay: 5, tyGia: 803.7, tongNT: 1_000 },
    }));
    expect(r.thuTipVnd).toBe(803_700);
    expect(Number.isInteger(r.thuTipVnd)).toBe(true);
  });
});
