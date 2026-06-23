import { describe, it, expect } from "vitest";
import {
  buildRedemptionMap,
  canApplyVoucher,
  resolveVoucherPrintAmount,
  sumGroupVoucherMua,
  buildAggAllocations,
  type RedemptionLike,
  type CoveredInfo,
} from "./voucher";

const mkCovered = (giaTri: number, loai: "mua" | "tang"): CoveredInfo => ({
  redemptionId: 1, voucherId: 1, giaTri, voucherTen: "", voucherLoai: loai, dnttId: null,
});

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

describe("sumGroupVoucherMua", () => {
  it("nhóm có 1 extra 'mua' phủ voucher + 1 dòng không voucher → tổng + perChiPhi đúng", () => {
    const map = { 101: mkCovered(604800, "mua") };
    const r = sumGroupVoucherMua([101, 102, 103], map);
    expect(r.total).toBe(604800);
    expect(r.perChiPhi).toEqual([{ chiPhiId: 101, giaTri: 604800 }]);
  });

  it("nhóm không có voucher → 0", () => {
    const r = sumGroupVoucherMua([1, 2], {});
    expect(r.total).toBe(0);
    expect(r.perChiPhi).toEqual([]);
  });

  it("voucher 'tang' KHÔNG tính (suất 0đ, đã loại khỏi ĐNTT)", () => {
    const map = { 1: mkCovered(500000, "tang"), 2: mkCovered(300000, "mua") };
    const r = sumGroupVoucherMua([1, 2], map);
    expect(r.total).toBe(300000);
    expect(r.perChiPhi).toEqual([{ chiPhiId: 2, giaTri: 300000 }]);
  });

  it("nhiều extra 'mua' → cộng dồn", () => {
    const map = { 1: mkCovered(100000, "mua"), 2: mkCovered(200000, "mua") };
    const r = sumGroupVoucherMua([1, 2], map);
    expect(r.total).toBe(300000);
    expect(r.perChiPhi).toHaveLength(2);
  });

  it("giaTri = 0 → bỏ qua (không tạo alloc rỗng)", () => {
    const map = { 1: mkCovered(0, "mua") };
    expect(sumGroupVoucherMua([1], map).total).toBe(0);
    expect(sumGroupVoucherMua([1], map).perChiPhi).toEqual([]);
  });
});

describe("buildAggAllocations", () => {
  it("Sea Octopus +1: vé tàu + Vé Vịnh + Soft Drink mỗi dòng về đúng chi_phi; tổng = 959.800", () => {
    const allocs = buildAggAllocations(959800, 9 /* main */, [
      { chiPhiId: 101, soTien: 604800 }, // vé tàu (voucher)
      { chiPhiId: 102, soTien: 310000 }, // Vé Vịnh (cash)
      { chiPhiId: 103, soTien: 45000 },  // Soft Drink (cash)
    ]);
    expect(allocs).toEqual([
      { chi_phi_id: 101, so_tien: 604800 },
      { chi_phi_id: 102, so_tien: 310000 },
      { chi_phi_id: 103, so_tien: 45000 },
    ]);
    expect(allocs.reduce((s, a) => s + a.so_tien, 0)).toBe(959800);
  });

  it("không có dòng phát sinh → dồn toàn bộ vào main (giữ hành vi footer cũ)", () => {
    expect(buildAggAllocations(959800, 9, [])).toEqual([{ chi_phi_id: 9, so_tien: 959800 }]);
  });

  it("Σ dòng == absDelta → không có dòng dư main", () => {
    const allocs = buildAggAllocations(604800, 9, [{ chiPhiId: 101, soTien: 604800 }]);
    expect(allocs).toEqual([{ chi_phi_id: 101, so_tien: 604800 }]);
    expect(allocs.reduce((s, a) => s + a.so_tien, 0)).toBe(604800);
  });

  it("Σ dòng > absDelta (giá đổi sau redeem) → clamp, tổng vẫn = absDelta", () => {
    const allocs = buildAggAllocations(500000, 9, [
      { chiPhiId: 101, soTien: 400000 },
      { chiPhiId: 102, soTien: 300000 },
    ]);
    expect(allocs.reduce((s, a) => s + a.so_tien, 0)).toBe(500000);
    expect(allocs).toEqual([
      { chi_phi_id: 101, so_tien: 400000 },
      { chi_phi_id: 102, so_tien: 100000 },
    ]);
  });

  it("Σ dòng < absDelta (có điều chỉnh dòng chính) → phần dư về main", () => {
    const allocs = buildAggAllocations(1000000, 9, [
      { chiPhiId: 101, soTien: 300000 },
      { chiPhiId: 102, soTien: 200000 },
    ]);
    expect(allocs).toEqual([
      { chi_phi_id: 101, so_tien: 300000 },
      { chi_phi_id: 102, so_tien: 200000 },
      { chi_phi_id: 9, so_tien: 500000 },
    ]);
  });
});
