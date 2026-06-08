import { describe, it, expect } from "vitest";
import {
  companyAmount,
  remainingForGop,
  isGopEligible,
  gopLabel,
  groupGopByNcc,
  sumSelected,
  buildCanTruPaymentItems,
  type GopDvRow,
  type CanTruPick,
} from "./dntt-gop-calc";

const row = (p: Partial<GopDvRow>): GopDvRow => ({
  id: 1,
  mo_ta: "Dịch vụ",
  nha_cung_cap_id: 100,
  ngay_so: 1,
  tien_cong_ty: 1_000_000,
  tien_hdv: 0,
  thanh_tien_thuc_te: null,
  so_tien_da_dntt: 0,
  thanh_toan_dinh_ky: false,
  ...p,
});

describe("companyAmount", () => {
  it("ưu tiên thanh_tien_thuc_te khi có", () => {
    expect(companyAmount({ thanh_tien_thuc_te: 800_000, tien_cong_ty: 1_000_000 })).toBe(800_000);
  });
  it("fallback tien_cong_ty khi thuc_te null", () => {
    expect(companyAmount({ thanh_tien_thuc_te: null, tien_cong_ty: 1_000_000 })).toBe(1_000_000);
  });
});

describe("remainingForGop", () => {
  it("company − so_tien_da_dntt", () => {
    expect(remainingForGop(row({ tien_cong_ty: 1_000_000, so_tien_da_dntt: 300_000 }))).toBe(700_000);
  });
  it("đã ĐNTT đủ → 0, không âm", () => {
    expect(remainingForGop(row({ tien_cong_ty: 1_000_000, so_tien_da_dntt: 1_200_000 }))).toBe(0);
  });
});

describe("isGopEligible", () => {
  it("dòng công ty chưa ĐNTT → eligible", () => {
    expect(isGopEligible(row({}))).toBe(true);
  });
  it("dòng HDV trả (tien_hdv>0) → loại", () => {
    expect(isGopEligible(row({ tien_cong_ty: 0, tien_hdv: 1_000_000 }))).toBe(false);
  });
  it("không có NCC → loại", () => {
    expect(isGopEligible(row({ nha_cung_cap_id: null }))).toBe(false);
  });
  it("thanh_toan_dinh_ky → loại (đã có flow định kỳ)", () => {
    expect(isGopEligible(row({ thanh_toan_dinh_ky: true }))).toBe(false);
  });
  it("đã ĐNTT đủ (remaining=0) → loại", () => {
    expect(isGopEligible(row({ so_tien_da_dntt: 1_000_000 }))).toBe(false);
  });
});

describe("gopLabel", () => {
  it("bỏ prefix extras [dvps_]", () => {
    expect(gopLabel("[dvps_42] Vé thuyền")).toBe("Vé thuyền");
    expect(gopLabel("Vé cáp treo")).toBe("Vé cáp treo");
    expect(gopLabel(null)).toBe("Dịch vụ");
  });
});

describe("groupGopByNcc", () => {
  it("gom theo NCC, chỉ giữ nhóm ≥2 dòng, sort theo ngày", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, ngay_so: 3, tien_cong_ty: 2_000_000 }),
      row({ id: 2, nha_cung_cap_id: 100, ngay_so: 1, tien_cong_ty: 1_000_000 }),
      row({ id: 3, nha_cung_cap_id: 200, ngay_so: 2, tien_cong_ty: 500_000 }), // NCC khác, 1 dòng → bỏ
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].nccId).toBe(100);
    expect(groups[0].items.map((i) => i.chi_phi_id)).toEqual([2, 1]); // sort ngày 1,3
    expect(groups[0].total).toBe(3_000_000);
  });

  it("gộp phần còn lại: dòng đã cọc tính remaining", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000, so_tien_da_dntt: 400_000 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 2_000_000, so_tien_da_dntt: 0 }),
    ]);
    expect(groups[0].total).toBe(600_000 + 2_000_000); // 2.6M
    expect(groups[0].items.find((i) => i.chi_phi_id === 1)!.remaining).toBe(600_000);
  });

  it("loại HDV-paid + định kỳ + không NCC trước khi gom", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 0, tien_hdv: 500_000 }), // HDV
      row({ id: 3, nha_cung_cap_id: 100, thanh_toan_dinh_ky: true }),            // định kỳ
    ]);
    // chỉ còn 1 dòng eligible cho NCC 100 → < 2 → không có nhóm
    expect(groups).toHaveLength(0);
  });
});

describe("sumSelected", () => {
  it("cộng remaining của các item được tick", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 2_000_000 }),
    ]);
    const items = groups[0].items;
    expect(sumSelected(items, new Set([1]))).toBe(1_000_000);
    expect(sumSelected(items, new Set([1, 2]))).toBe(3_000_000);
    expect(sumSelected(items, new Set())).toBe(0);
  });
});

describe("buildCanTruPaymentItems", () => {
  const pick = (p: Partial<CanTruPick>): CanTruPick => ({
    congNoId: 1,
    soTienConLai: 1_000_000,
    soTienCanTru: 1_000_000,
    tenDoan: "Đoàn A",
    ...p,
  });

  it("map sang payload payment (congNoId, soTien, sourceTenDoan)", () => {
    const out = buildCanTruPaymentItems(
      [pick({ congNoId: 7, soTienCanTru: 500_000, tenDoan: "VDC052705BR6" })],
      1_000_000,
    );
    expect(out).toEqual([{ congNoId: 7, soTien: 500_000, sourceTenDoan: "VDC052705BR6" }]);
  });

  it("clamp tổng ≤ maxAmount (số tiền ĐNTT) — cắt greedy, không cấn quá", () => {
    // Tổng chọn 4.131.000 nhưng ĐNTT chỉ 3.000.000 → cấn đủ dòng 1, cắt dòng 2.
    const out = buildCanTruPaymentItems(
      [
        pick({ congNoId: 47, soTienConLai: 3_591_000, soTienCanTru: 3_591_000 }),
        pick({ congNoId: 48, soTienConLai: 540_000, soTienCanTru: 540_000 }),
      ],
      3_000_000,
    );
    expect(out).toEqual([{ congNoId: 47, soTien: 3_000_000, sourceTenDoan: "Đoàn A" }]);
    expect(out.reduce((s, i) => s + i.soTien, 0)).toBe(3_000_000);
  });

  it("clamp mỗi dòng ≤ số dư công nợ", () => {
    const out = buildCanTruPaymentItems(
      [pick({ soTienConLai: 200_000, soTienCanTru: 999_999 })],
      1_000_000,
    );
    expect(out[0].soTien).toBe(200_000);
  });

  it("bỏ dòng ≤ 0 và không sinh payload khi maxAmount = 0", () => {
    expect(buildCanTruPaymentItems([pick({ soTienCanTru: 0 })], 1_000_000)).toEqual([]);
    expect(buildCanTruPaymentItems([pick({})], 0)).toEqual([]);
  });
});
