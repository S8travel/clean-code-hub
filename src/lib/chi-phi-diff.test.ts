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

  it("đổi nhiều field → nhiều dòng theo thứ tự field", () => {
    const out = buildChiPhiChangeList(
      { so_luong: 30, don_gia: 2_000_000, tien_cong_ty: 60_000_000 },
      { so_luong: 31, don_gia: 2_000_000, tien_cong_ty: 62_000_000 },
    );
    expect(out).toEqual([
      "Số lượng: 30 → 31",
      "Tiền công ty: 60.000.000 → 62.000.000",
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
