import { describe, it, expect } from "vitest";
import {
  buildRedemptionMap,
  canApplyVoucher,
  resolveVoucherPrintAmount,
  sumGroupVoucherMua,
  buildAggAllocations,
  splitVoucherCoverage,
  calcVoucherEditDelta,
  calcCoveredSoKhachEdit,
  calcMuaVoucherPaymentSync,
  type RedemptionLike,
  type CoveredInfo,
} from "./voucher";

const mkCovered = (giaTri: number, loai: "mua" | "tang"): CoveredInfo => ({
  redemptionId: 1, voucherId: 1, giaTri, soVe: 0, voucherTen: "", voucherLoai: loai, dnttId: null,
});

describe("buildRedemptionMap", () => {
  it("map chi_phi_id → thông tin voucher (tên + loại + dnttId)", () => {
    const reds: RedemptionLike[] = [
      { id: 1, voucher_id: 10, chi_phi_id: 100, gia_tri: 850000, so_luong: 16, dntt_id: 77, voucher: { ten: "Voucher trưa", loai: "mua" } },
      { id: 2, voucher_id: 11, chi_phi_id: 200, gia_tri: 1200000, so_luong: 2, voucher: { ten: "Voucher tối", loai: "tang" } },
    ];
    const m = buildRedemptionMap(reds);
    expect(m[100]).toEqual({ redemptionId: 1, voucherId: 10, giaTri: 850000, soVe: 16, voucherTen: "Voucher trưa", voucherLoai: "mua", dnttId: 77 });
    expect(m[200].voucherLoai).toBe("tang");
    expect(m[200].soVe).toBe(2);
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

describe("splitVoucherCoverage", () => {
  // Vé tàu: 24 khách × 1.150.000, không CK, voucher TẶNG 2 vé.
  it("TẶNG phủ 2/24 vé → cover 2.3M, công ty còn trả 22 ghế = 25.3M", () => {
    const r = splitVoucherCoverage({ soKhachThucTe: 24, donGia: 1150000, ckPct: null, soVe: 2, loai: "tang" });
    expect(r.fullValue).toBe(27600000);
    expect(r.coverValue).toBe(2300000);
    expect(r.remainderNet).toBe(25300000);
    expect(r.tienCongTy).toBe(25300000); // tặng → công ty trả phần còn lại
    expect(r.veApplied).toBe(2);
    // Bất biến: cover + tienCongTy(tặng) === full
    expect(r.coverValue + r.tienCongTy).toBe(r.fullValue);
  });

  it("TẶNG phủ HẾT (vé = số khách) → cover full, công ty = 0", () => {
    const r = splitVoucherCoverage({ soKhachThucTe: 24, donGia: 1150000, ckPct: null, soVe: 24, loai: "tang" });
    expect(r.coverValue).toBe(27600000);
    expect(r.remainderNet).toBe(0);
    expect(r.tienCongTy).toBe(0);
  });

  it("MUA phủ 2/24 vé → công ty GIỮ full 27.6M (voucher chỉ là cách trả), cover 2.3M", () => {
    const r = splitVoucherCoverage({ soKhachThucTe: 24, donGia: 1150000, ckPct: null, soVe: 2, loai: "mua" });
    expect(r.tienCongTy).toBe(27600000);
    expect(r.coverValue).toBe(2300000);
    expect(r.remainderNet).toBe(25300000);
  });

  it("có CK%: cover + remainder bù trừ ĐÚNG full (không lệch làm tròn)", () => {
    // 20 khách × 172.800, CK 5% → full = 3.283.200. Tặng 4 vé.
    const r = splitVoucherCoverage({ soKhachThucTe: 20, donGia: 172800, ckPct: 5, soVe: 4, loai: "tang" });
    expect(r.fullValue).toBe(3283200);
    // remainderNet = applyChietKhau(16 × 172800, 5%) = 2.626.560
    expect(r.remainderNet).toBe(2626560);
    expect(r.coverValue).toBe(3283200 - 2626560);
    expect(r.coverValue + r.tienCongTy).toBe(r.fullValue);
  });

  it("vé vượt số khách → kẹp về số khách (phủ hết)", () => {
    const r = splitVoucherCoverage({ soKhachThucTe: 10, donGia: 100000, ckPct: null, soVe: 99, loai: "tang" });
    expect(r.veApplied).toBe(10);
    expect(r.tienCongTy).toBe(0);
  });

  it("vé ≤ 0 → kẹp về 0 (không phủ gì), công ty trả full", () => {
    const r = splitVoucherCoverage({ soKhachThucTe: 10, donGia: 100000, ckPct: null, soVe: 0, loai: "tang" });
    expect(r.veApplied).toBe(0);
    expect(r.coverValue).toBe(0);
    expect(r.tienCongTy).toBe(1000000);
  });
});

describe("calcVoucherEditDelta", () => {
  // Vé tàu: 24 khách × 1.150.000, không CK. full = 27.6M.
  const boat = { soKhachThucTe: 24, donGia: 1150000, ckPct: null, tonKhoConLai: 100 };

  it("TẶNG 2→4: cover +2.3M, công ty trả ÍT đi 2.3M, trả thêm 2 vé khỏi kho", () => {
    const d = calcVoucherEditDelta({ ...boat, veCu: 2, veMoi: 4, loai: "tang" });
    expect(d.route).toBe("edit");
    expect(d.veClamped).toBe(4);
    expect(d.coverCu).toBe(2300000);
    expect(d.coverMoi).toBe(4600000);
    expect(d.deltaCover).toBe(2300000);
    expect(d.tienCongTyCu).toBe(25300000);
    expect(d.tienCongTyMoi).toBe(23000000);
    expect(d.deltaTienCongTy).toBe(-2300000); // tặng nhiều hơn → công ty trả ít hơn
    expect(d.deltaVe).toBe(2);
    expect(d.paymentVoucherMoi).toBe(0); // tặng không sinh payment voucher
  });

  it("TẶNG 4→2 (giảm): công ty trả THÊM 2.3M, trả lại 2 vé về kho", () => {
    const d = calcVoucherEditDelta({ ...boat, veCu: 4, veMoi: 2, loai: "tang" });
    expect(d.deltaCover).toBe(-2300000);
    expect(d.deltaTienCongTy).toBe(2300000);
    expect(d.deltaVe).toBe(-2);
    expect(d.route).toBe("edit");
  });

  it("MUA 2→5: tien_cong_ty GIỮ full, chỉ cover + payment voucher tăng", () => {
    const d = calcVoucherEditDelta({ ...boat, veCu: 2, veMoi: 5, loai: "mua" });
    expect(d.tienCongTyCu).toBe(27600000);
    expect(d.tienCongTyMoi).toBe(27600000);
    expect(d.deltaTienCongTy).toBe(0);
    expect(d.coverMoi).toBe(5750000);
    expect(d.paymentVoucherMoi).toBe(5750000);
    expect(d.deltaVe).toBe(3);
    expect(d.route).toBe("edit");
  });

  it("MUA 5→2 (giảm trên ĐNTT đã trả): payment voucher giảm, công ty giữ full", () => {
    const d = calcVoucherEditDelta({ ...boat, veCu: 5, veMoi: 2, loai: "mua" });
    expect(d.deltaTienCongTy).toBe(0);
    expect(d.coverCu).toBe(5750000);
    expect(d.coverMoi).toBe(2300000);
    expect(d.paymentVoucherMoi).toBeLessThan(d.paymentVoucherCu);
  });

  it("kẹp tồn kho: veCu=2, tồn=1, veMoi=5 → veClamped=min(10, 2+1)=3", () => {
    const d = calcVoucherEditDelta({ soKhachThucTe: 10, donGia: 100000, ckPct: null, tonKhoConLai: 1, veCu: 2, veMoi: 5, loai: "tang" });
    expect(d.veClamped).toBe(3);
    expect(d.clamped).toBe(true);
    expect(d.route).toBe("edit");
  });

  it("kẹp số khách: soKhach=10, veMoi=15, tồn dư → veClamped=10", () => {
    const d = calcVoucherEditDelta({ soKhachThucTe: 10, donGia: 100000, ckPct: null, tonKhoConLai: 100, veCu: 4, veMoi: 15, loai: "tang" });
    expect(d.veClamped).toBe(10);
    expect(d.clamped).toBe(true);
  });

  it("veMoi = 0 → route='remove' (gỡ hẳn vì CHECK so_luong>0)", () => {
    const d = calcVoucherEditDelta({ ...boat, veCu: 4, veMoi: 0, loai: "mua" });
    expect(d.route).toBe("remove");
    expect(d.veClamped).toBe(0);
  });

  it("veMoi âm → kẹp về 0 → route='remove'", () => {
    const d = calcVoucherEditDelta({ ...boat, veCu: 4, veMoi: -3, loai: "tang" });
    expect(d.veClamped).toBe(0);
    expect(d.route).toBe("remove");
  });

  it("veMoi === veCu → route='noop', mọi delta = 0", () => {
    const d = calcVoucherEditDelta({ ...boat, veCu: 3, veMoi: 3, loai: "mua" });
    expect(d.route).toBe("noop");
    expect(d.deltaVe).toBe(0);
    expect(d.deltaCover).toBe(0);
    expect(d.deltaTienCongTy).toBe(0);
  });

  it("tăng vượt trần (vé cũ đã = số khách) → noop, không tăng được", () => {
    const d = calcVoucherEditDelta({ ...boat, veCu: 24, veMoi: 30, loai: "mua" });
    expect(d.veClamped).toBe(24);
    expect(d.route).toBe("noop");
    expect(d.clamped).toBe(true);
  });

  it("có CK% MUA: 20kh×172.8k CK5%, 4→6 → cover+remainder bù trừ đúng full, deltaTienCongTy=0", () => {
    const d = calcVoucherEditDelta({ soKhachThucTe: 20, donGia: 172800, ckPct: 5, tonKhoConLai: 50, veCu: 4, veMoi: 6, loai: "mua" });
    // full = applyChietKhau(20×172800, 5%) = 3.283.200
    const full = 3283200;
    expect(d.coverMoi + d.tienCongTyMoi - full).toBe(d.coverMoi); // mua: tienCongTy=full
    expect(d.deltaTienCongTy).toBe(0);
    expect(d.paymentVoucherMoi).toBe(d.coverMoi);
  });

  it("có CK% TẶNG: 20kh×172.8k CK5%, 4→6 → deltaTienCongTy = -(coverMoi - coverCu)", () => {
    const d = calcVoucherEditDelta({ soKhachThucTe: 20, donGia: 172800, ckPct: 5, tonKhoConLai: 50, veCu: 4, veMoi: 6, loai: "tang" });
    expect(d.deltaTienCongTy).toBe(-(d.coverMoi - d.coverCu));
    expect(d.paymentVoucherCu).toBe(0);
    expect(d.paymentVoucherMoi).toBe(0);
  });
});

describe("calcCoveredSoKhachEdit", () => {
  // Tàu Sea Octopus: 604.800/vé, không CK, MUA, vé == số khách (phủ hết).
  it("MUA giảm khách 39→37 (vé phủ hết) → vé tụt 37, cover/cty = 37×604800", () => {
    const r = calcCoveredSoKhachEdit({ veCu: 39, soKhachThucTe: 37, donGia: 604800, ckPct: null, loai: "mua" });
    expect(r.veNew).toBe(37);
    expect(r.coverValue).toBe(37 * 604800); // 22.377.600
    expect(r.tienCongTy).toBe(37 * 604800); // mua giữ full
  });

  it("MUA tăng khách 37→39 (vé đang 37) → vé GIỮ 37 (khách thêm không tự phủ), cty=full 39", () => {
    const r = calcCoveredSoKhachEdit({ veCu: 37, soKhachThucTe: 39, donGia: 604800, ckPct: null, loai: "mua" });
    expect(r.veNew).toBe(37);
    expect(r.coverValue).toBe(37 * 604800);
    expect(r.tienCongTy).toBe(39 * 604800); // full theo số khách mới
  });

  it("MUA phủ MỘT PHẦN: vé 20, khách 39→35 (vẫn ≥20) → vé giữ 20", () => {
    const r = calcCoveredSoKhachEdit({ veCu: 20, soKhachThucTe: 35, donGia: 100000, ckPct: null, loai: "mua" });
    expect(r.veNew).toBe(20);
    expect(r.coverValue).toBe(20 * 100000);
    expect(r.tienCongTy).toBe(35 * 100000);
  });

  it("MUA giảm khách DƯỚI số vé: vé 20, khách 15 → vé kẹp 15", () => {
    const r = calcCoveredSoKhachEdit({ veCu: 20, soKhachThucTe: 15, donGia: 100000, ckPct: null, loai: "mua" });
    expect(r.veNew).toBe(15);
    expect(r.coverValue).toBe(15 * 100000);
  });

  it("TẶNG giảm khách 24→20 (vé tặng 2) → vé giữ 2, cty = remainderNet 18 ghế", () => {
    const r = calcCoveredSoKhachEdit({ veCu: 2, soKhachThucTe: 20, donGia: 1150000, ckPct: null, loai: "tang" });
    expect(r.veNew).toBe(2);
    expect(r.coverValue).toBe(2 * 1150000);
    expect(r.tienCongTy).toBe(18 * 1150000); // 18 ghế công ty trả
  });

  it("số khách = 0 → vé 0 (caller sẽ gỡ voucher)", () => {
    const r = calcCoveredSoKhachEdit({ veCu: 39, soKhachThucTe: 0, donGia: 604800, ckPct: null, loai: "mua" });
    expect(r.veNew).toBe(0);
    expect(r.coverValue).toBe(0);
  });

  it("có CK%: cover + remainder vẫn bù trừ đúng full (MUA, CK5%)", () => {
    const r = calcCoveredSoKhachEdit({ veCu: 4, soKhachThucTe: 20, donGia: 172800, ckPct: 5, loai: "mua" });
    // full = applyChietKhau(20×172800, 5%) = 3.283.200; mua → tienCongTy = full
    expect(r.tienCongTy).toBe(3283200);
    expect(r.veNew).toBe(4);
  });
});

describe("calcMuaVoucherPaymentSync", () => {
  it("GIẢM phủ + ĐNTT ĐÃ trả đủ → keepPaid (giữ payment, vé về kho) — case Sea Octopus", () => {
    // ĐNTT 38.197.200; đã trả: cash+cấn trừ 14.610.000 + voucher 23.587.200 = đủ.
    // Giảm boat 23.587.200 → 22.377.600.
    const r = calcMuaVoucherPaymentSync({
      coverMoi: 22377600, coverCu: 23587200, dnttSoTien: 38197200,
      otherPaidSum: 14610000, ourVoucherPaidCu: 23587200,
    });
    expect(r.keepPaid).toBe(true);
    expect(r.newVoucherPay).toBe(23587200); // GIỮ NGUYÊN → ĐNTT đứng yên 'paid'
    expect(r.overpaidFromKho).toBe(1209600); // = voucherKhoRefund UI loại khỏi lệch
    expect(r.payClamped).toBe(false);
  });

  it("GIẢM phủ + ĐNTT CHƯA trả đủ → hạ payment (logic cũ, phần chênh là cash thật)", () => {
    // ĐNTT 38.197.200; mới trả cash 5tr + voucher 23.587.200 = 28.587.200 < so_tien.
    const r = calcMuaVoucherPaymentSync({
      coverMoi: 22377600, coverCu: 23587200, dnttSoTien: 38197200,
      otherPaidSum: 5000000, ourVoucherPaidCu: 23587200,
    });
    expect(r.keepPaid).toBe(false);
    // capacity = 38.197.200 − 5.000.000 = 33.197.200 ≥ coverMoi → newVoucherPay = coverMoi
    expect(r.newVoucherPay).toBe(22377600);
    expect(r.overpaidFromKho).toBe(0);
  });

  it("TĂNG phủ → hạ/đặt payment theo coverMoi, clamp ≤ capacity", () => {
    const r = calcMuaVoucherPaymentSync({
      coverMoi: 25000000, coverCu: 22377600, dnttSoTien: 38197200,
      otherPaidSum: 14610000, ourVoucherPaidCu: 22377600,
    });
    expect(r.keepPaid).toBe(false);
    // capacity = 38.197.200 − 14.610.000 = 23.587.200 < coverMoi 25.000.000 → clamp
    expect(r.newVoucherPay).toBe(23587200);
    expect(r.payClamped).toBe(true);
  });

  it("GIẢM phủ + đã trả đúng bằng so_tien (paidBefore === dnttSoTien) → keepPaid", () => {
    const r = calcMuaVoucherPaymentSync({
      coverMoi: 100, coverCu: 200, dnttSoTien: 1000,
      otherPaidSum: 800, ourVoucherPaidCu: 200,
    });
    expect(r.keepPaid).toBe(true);
    expect(r.overpaidFromKho).toBe(100);
  });
});
