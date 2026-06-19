import { describe, it, expect } from "vitest";
import {
  buildRedemptionMap,
  canApplyVoucher,
  resolveVoucherPrintAmount,
  type RedemptionLike,
} from "./voucher";

describe("buildRedemptionMap", () => {
  it("map chi_phi_id → thông tin voucher (tên + loại + dnttId)", () => {
    const reds: RedemptionLike[] = [
      { id: 1, voucher_id: 10, chi_phi_id: 100, gia_tri: 850000, dntt_id: 77, voucher: { ten: "Voucher trưa", loai: "mua" } },
      { id: 2, voucher_id: 11, chi_phi_id: 200, gia_tri: 1200000, voucher: { ten: "Voucher tối", loai: "tang" } },
    ];
    const m = buildRedemptionMap(reds);
    expect(m[100]).toEqual({ redemptionId: 1, voucherId: 10, giaTri: 850000, voucherTen: "Voucher trưa", voucherLoai: "mua", dnttId: 77 });
    expect(m[200].voucherLoai).toBe("tang");
    expect(m[200].dnttId).toBeNull();
    expect(Object.keys(m)).toHaveLength(2);
  });

  it("loại thiếu/null → mặc định 'mua'", () => {
    const m = buildRedemptionMap([{ id: 1, voucher_id: 10, chi_phi_id: 100, gia_tri: 0 }]);
    expect(m[100].voucherLoai).toBe("mua");
  });

  it("bỏ qua bản ghi chi_phi_id = null (chi phí gốc đã xóa)", () => {
    const reds: RedemptionLike[] = [
      { id: 1, voucher_id: 10, chi_phi_id: null, gia_tri: 500000, voucher: null },
      { id: 2, voucher_id: 11, chi_phi_id: 200, gia_tri: 600000, voucher: { ten: "V" } },
    ];
    const m = buildRedemptionMap(reds);
    expect(m[200]).toBeDefined();
    expect(Object.keys(m)).toHaveLength(1);
  });

  it("voucher.ten thiếu → voucherTen rỗng (không crash)", () => {
    const m = buildRedemptionMap([{ id: 1, voucher_id: 10, chi_phi_id: 100, gia_tri: 0 }]);
    expect(m[100].voucherTen).toBe("");
  });

  it("trùng chi_phi_id → bản ghi sau ghi đè", () => {
    const m = buildRedemptionMap([
      { id: 1, voucher_id: 10, chi_phi_id: 100, gia_tri: 100, voucher: { ten: "A" } },
      { id: 2, voucher_id: 11, chi_phi_id: 100, gia_tri: 200, voucher: { ten: "B" } },
    ]);
    expect(m[100].redemptionId).toBe(2);
    expect(m[100].giaTri).toBe(200);
  });
});

describe("canApplyVoucher", () => {
  it("đủ điều kiện: công ty + chưa có ĐNTT + có id", () => {
    expect(canApplyVoucher({ nguoiTt: "cong_ty", activeDnttCount: 0, hasChiPhiId: true })).toBe(true);
  });

  it("HDV trả → không được áp", () => {
    expect(canApplyVoucher({ nguoiTt: "hdv", activeDnttCount: 0, hasChiPhiId: true })).toBe(false);
  });

  it("đã có ĐNTT đang hiệu lực → không được áp", () => {
    expect(canApplyVoucher({ nguoiTt: "cong_ty", activeDnttCount: 1, hasChiPhiId: true })).toBe(false);
  });

  it("chưa lưu chi phí (không có id) → không được áp", () => {
    expect(canApplyVoucher({ nguoiTt: "cong_ty", activeDnttCount: 0, hasChiPhiId: false })).toBe(false);
  });
});

describe("resolveVoucherPrintAmount", () => {
  it("mua + payment khớp giaTri → trừ đúng phần voucher", () => {
    expect(
      resolveVoucherPrintAmount({ voucherLoai: "mua", redeemGiaTri: 10281600, paymentVoucherAmount: 10281600 }),
    ).toBe(10281600);
  });

  it("mua + cache payments STALE (=0) → vẫn trừ theo giaTri (fix tàu Sea Octopus)", () => {
    expect(
      resolveVoucherPrintAmount({ voucherLoai: "mua", redeemGiaTri: 10281600, paymentVoucherAmount: 0 }),
    ).toBe(10281600);
  });

  it("mua + payment lớn hơn giaTri → lấy payment (max 2 chiều)", () => {
    expect(
      resolveVoucherPrintAmount({ voucherLoai: "mua", redeemGiaTri: 9000000, paymentVoucherAmount: 9500000 }),
    ).toBe(9500000);
  });

  it("tang → 0 (suất chính đã bị loại khỏi bản in, không trừ thêm)", () => {
    expect(
      resolveVoucherPrintAmount({ voucherLoai: "tang", redeemGiaTri: 1200000, paymentVoucherAmount: 0 }),
    ).toBe(0);
  });

  it("không có voucher → trả về payment voucher (thường 0)", () => {
    expect(
      resolveVoucherPrintAmount({ voucherLoai: null, redeemGiaTri: 0, paymentVoucherAmount: 0 }),
    ).toBe(0);
  });

  it("giaTri null/âm → bỏ qua, không trừ âm", () => {
    expect(
      resolveVoucherPrintAmount({ voucherLoai: "mua", redeemGiaTri: null, paymentVoucherAmount: 0 }),
    ).toBe(0);
    expect(
      resolveVoucherPrintAmount({ voucherLoai: "mua", redeemGiaTri: -5, paymentVoucherAmount: 0 }),
    ).toBe(0);
  });
});
