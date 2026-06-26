import { describe, it, expect } from "vitest";
import {
  companyAmount,
  remainingForGop,
  isGopEligible,
  gopLabel,
  extraParentId,
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

describe("extraParentId", () => {
  it("trả id cha cho extra [dvps_<id>]", () => {
    expect(extraParentId("[dvps_42] Vé thuyền")).toBe(42);
    expect(extraParentId("[dvps_9283] xe điện phố cổ")).toBe(9283);
  });
  it("dòng main (không prefix) → null", () => {
    expect(extraParentId("Phố cổ hội an")).toBeNull();
    expect(extraParentId(null)).toBeNull();
  });
  it("KHÔNG over-match: [dvps_12] không phải extra của main id=1", () => {
    // Dùng cho guard xóa cascade — bắt trọn cụm số nên 12 ≠ 1, tránh xóa nhầm.
    expect(extraParentId("[dvps_12] X")).toBe(12);
    expect(extraParentId("[dvps_12] X") === 1).toBe(false);
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

describe("groupGopByNcc — extras [dvps_]", () => {
  it("cộng tiền extra vào item của main (case Vin wonder + phụ thu vé bf)", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, ngay_so: 1, tien_cong_ty: 17_460_000 }),
      row({ id: 2, nha_cung_cap_id: 100, ngay_so: 3, tien_cong_ty: 15_732_000 }),
      row({ id: 9, mo_ta: "[dvps_2] Phụ thu vé bf", nha_cung_cap_id: null, ngay_so: null, tien_cong_ty: 3_600_000 }),
    ]);
    expect(groups).toHaveLength(1);
    const vin = groups[0].items.find((i) => i.chi_phi_id === 2)!;
    expect(vin.remaining).toBe(15_732_000 + 3_600_000);
    expect(vin.extraCount).toBe(1); // label sạch — suffix "(+N phụ thu)" do UI render
    expect(vin.label).toBe("Dịch vụ");
    expect(groups[0].total).toBe(17_460_000 + 19_332_000);
  });

  it("extra KHÔNG tạo item riêng — main + extra = 1 item (minRows đếm theo main)", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000 }),
      row({ id: 9, mo_ta: "[dvps_1] Phụ thu", nha_cung_cap_id: 100, tien_cong_ty: 200_000 }),
    ]);
    // 1 main duy nhất (< minRows 2) → không có nhóm, dù extra cùng NCC
    expect(groups).toHaveLength(0);
  });

  it("extra mồ côi (main không có trong rows) → bỏ qua", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 2_000_000 }),
      row({ id: 9, mo_ta: "[dvps_777] Phụ thu mồ côi", tien_cong_ty: 999_000 }),
    ]);
    expect(groups[0].total).toBe(3_000_000);
  });

  it("extra HDV trả / định kỳ → không cộng vào main", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 2_000_000 }),
      row({ id: 9, mo_ta: "[dvps_2] HDV mua", tien_cong_ty: 0, tien_hdv: 300_000 }),
      row({ id: 10, mo_ta: "[dvps_2] Định kỳ", tien_cong_ty: 400_000, thanh_toan_dinh_ky: true }),
    ]);
    expect(groups[0].items.find((i) => i.chi_phi_id === 2)!.remaining).toBe(2_000_000);
    expect(groups[0].items.find((i) => i.chi_phi_id === 2)!.extraCount).toBe(0);
  });

  it("đã cọc per-row (alloc dồn vào main GỒM cả tiền extra) → remaining nhóm trừ đúng", () => {
    // Per-row ĐNTT: cọc 5M alloc 100% vào main (dù tiền gồm cả extra).
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 15_000_000, so_tien_da_dntt: 5_000_000 }),
      row({ id: 9, mo_ta: "[dvps_2] Phụ thu", tien_cong_ty: 3_000_000, so_tien_da_dntt: 0 }),
    ]);
    // remaining nhóm = (15M + 3M) − 5M = 13M
    expect(groups[0].items.find((i) => i.chi_phi_id === 2)!.remaining).toBe(13_000_000);
  });

  it("main đã ĐNTT đủ nhưng extra mới phát sinh chưa ĐNTT → vẫn gộp phần extra", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 2_000_000, so_tien_da_dntt: 2_000_000 }),
      row({ id: 9, mo_ta: "[dvps_2] Phụ thu mới", tien_cong_ty: 500_000 }),
    ]);
    expect(groups[0].items.find((i) => i.chi_phi_id === 2)!.remaining).toBe(500_000);
  });

  it("extra sửa về 0 SAU khi đã có commitment → vẫn trừ so_tien_da_dntt (không phồng remaining)", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 15_000_000, so_tien_da_dntt: 5_000_000 }),
      // Extra bị OP sửa tien_cong_ty về 0 sau khi đã nằm trong ĐNTT (commitment 2M còn đó)
      row({ id: 9, mo_ta: "[dvps_2] Phụ thu đã bỏ", tien_cong_ty: 0, so_tien_da_dntt: 2_000_000 }),
    ]);
    const item = groups[0].items.find((i) => i.chi_phi_id === 2)!;
    // company = 15M (extra 0đ không cộng), daDntt = 5M + 2M → remaining = 8M, KHÔNG phải 10M
    expect(item.remaining).toBe(8_000_000);
    expect(item.extraCount).toBe(0); // extra 0đ không đếm vào label
  });

  it("extra có thanh_tien_thuc_te=0 (điều chỉnh) + commitment cũ → company bỏ qua, daDntt vẫn trừ", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 15_000_000 }),
      row({ id: 9, mo_ta: "[dvps_2] Phụ thu", tien_cong_ty: 3_000_000, thanh_tien_thuc_te: 0, so_tien_da_dntt: 2_000_000 }),
    ]);
    // company = 15M (thực tế extra = 0), daDntt = 0 + 2M → remaining = 13M
    expect(groups[0].items.find((i) => i.chi_phi_id === 2)!.remaining).toBe(13_000_000);
  });

  it("extra định kỳ có commitment → loại cả 2 vế (không cộng tiền, không trừ daDntt)", () => {
    const groups = groupGopByNcc([
      row({ id: 1, nha_cung_cap_id: 100, tien_cong_ty: 1_000_000 }),
      row({ id: 2, nha_cung_cap_id: 100, tien_cong_ty: 2_000_000 }),
      row({ id: 9, mo_ta: "[dvps_2] Định kỳ", tien_cong_ty: 400_000, so_tien_da_dntt: 400_000, thanh_toan_dinh_ky: true }),
    ]);
    expect(groups[0].items.find((i) => i.chi_phi_id === 2)!.remaining).toBe(2_000_000);
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
