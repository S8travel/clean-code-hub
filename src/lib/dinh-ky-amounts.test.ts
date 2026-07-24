import { describe, it, expect } from "vitest";
import { netPhaiTra } from "./dinh-ky-amounts";

describe("netPhaiTra", () => {
  it("dòng KS có FOC → trả net (tien_cong_ty), KHÔNG dùng gross thanh_tien", () => {
    // TWIN 11 phòng × 1.45M, FOC 1 phòng:
    // thanh_tien (gross) = 15.950.000; tien_cong_ty (net) = 14.500.000.
    expect(netPhaiTra({ tien_cong_ty: 14_500_000, thanh_tien_thuc_te: null })).toBe(14_500_000);
  });

  it("dòng không FOC → net == gross (không đổi)", () => {
    expect(netPhaiTra({ tien_cong_ty: 1_850_000, thanh_tien_thuc_te: null })).toBe(1_850_000);
  });

  it("thanh_tien_thuc_te (điều chỉnh) override tien_cong_ty", () => {
    expect(netPhaiTra({ tien_cong_ty: 14_500_000, thanh_tien_thuc_te: 12_000_000 })).toBe(12_000_000);
  });

  it("thanh_tien_thuc_te = 0 vẫn override (không rơi về tien_cong_ty)", () => {
    expect(netPhaiTra({ tien_cong_ty: 14_500_000, thanh_tien_thuc_te: 0 })).toBe(0);
  });
});
