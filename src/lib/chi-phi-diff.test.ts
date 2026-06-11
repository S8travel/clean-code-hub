import { describe, it, expect } from "vitest";
import { buildChiPhiChangeList } from "./chi-phi-diff";

describe("buildChiPhiChangeList", () => {
  it("đổi đơn giá → 1 dòng cũ → mới", () => {
    const out = buildChiPhiChangeList(
      { don_gia: 2_000_000, so_luong: 30 },
      { don_gia: 2_500_000 },
    );
    expect(out).toEqual(["Đơn giá: 2.000.000 → 2.500.000"]);
  });

  it("đổi input → CHỈ ghi input, ẩn tiền công ty (hệ quả suy ra)", () => {
    const out = buildChiPhiChangeList(
      { so_luong: 30, don_gia: 2_000_000, tien_cong_ty: 60_000_000 },
      { so_luong: 31, don_gia: 2_000_000, tien_cong_ty: 62_000_000 },
    );
    expect(out).toEqual(["Số lượng: 30 → 31"]);
  });

  it("đổi CK% (case GODA/THE PARADISE) → ghi đúng Chiết khấu 0 → 9, ẩn tiền", () => {
    const out = buildChiPhiChangeList(
      { chiet_khau_phan_tram_snapshot: 0, tien_cong_ty: 2_246_400 },
      { chiet_khau_phan_tram_snapshot: 9, tien_cong_ty: 2_044_224 },
    );
    expect(out).toEqual(["Chiết khấu (%): 0 → 9"]);
  });

  it("toggle người thanh toán (chỉ tiền đổi, không input nào đổi) → vẫn ghi derived", () => {
    const out = buildChiPhiChangeList(
      { tien_cong_ty: 3_000_000, tien_hdv: 0 },
      { tien_cong_ty: 0, tien_hdv: 3_000_000 },
    );
    expect(out).toEqual([
      "Tiền công ty: 3.000.000 → 0",
      "Tiền HDV: 0 → 3.000.000",
    ]);
  });

  it("visa: đổi tỷ giá → ghi tỷ giá, ẩn tiền công ty", () => {
    const out = buildChiPhiChangeList(
      { ty_gia: 26_450, don_gia: 714_150, tien_cong_ty: 714_150 },
      { ty_gia: 26_500, don_gia: 715_500, tien_cong_ty: 715_500 },
    );
    expect(out).toEqual([
      "Đơn giá: 714.150 → 715.500",
      "Tỷ giá: 26.450 → 26.500",
    ]);
  });

  it("field không có trong payload → bỏ qua (không gửi = không đụng)", () => {
    const out = buildChiPhiChangeList(
      { don_gia: 2_000_000, tien_hdv: 500_000 },
      { don_gia: 2_500_000 },
    );
    expect(out).toEqual(["Đơn giá: 2.000.000 → 2.500.000"]);
  });

  it("giá trị không đổi → không sinh dòng", () => {
    const out = buildChiPhiChangeList(
      { don_gia: 2_000_000 },
      { don_gia: 2_000_000, is_overridden: false },
    );
    expect(out).toEqual([]);
  });

  it("FOC 0.5 (số lẻ) đổi", () => {
    const out = buildChiPhiChangeList({ foc_count: 0 }, { foc_count: 0.5 });
    expect(out).toEqual(["FOC: 0 → 0,5"]);
  });

  it("thanh_tien_thuc_te: có giá trị → null hiển thị —", () => {
    const out = buildChiPhiChangeList(
      { thanh_tien_thuc_te: 1_000_000 },
      { thanh_tien_thuc_te: null },
    );
    expect(out).toEqual(["TT thực tế: 1.000.000 → —"]);
  });

  it("null → có giá trị", () => {
    const out = buildChiPhiChangeList(
      { thanh_tien_thuc_te: null },
      { thanh_tien_thuc_te: 1_000_000 },
    );
    expect(out).toEqual(["TT thực tế: — → 1.000.000"]);
  });

  it("oldRow null → mảng rỗng", () => {
    expect(buildChiPhiChangeList(null, { don_gia: 100 })).toEqual([]);
  });

  it("null ↔ null coi như không đổi", () => {
    const out = buildChiPhiChangeList(
      { thanh_tien_thuc_te: null },
      { thanh_tien_thuc_te: null },
    );
    expect(out).toEqual([]);
  });
});
