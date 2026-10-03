import { describe, it, expect } from "vitest";
import { conPhaiDeNghi, deNghiVuot, netPhaiTra, tongCumDinhKy } from "./dinh-ky-amounts";

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

describe("conPhaiDeNghi / deNghiVuot", () => {
  it("dòng đã đề nghị 1 phần (cọc) → còn = net − đã đề nghị, không vượt", () => {
    const r = { tien_cong_ty: 10_000_000, thanh_tien_thuc_te: null, so_tien_da_dntt: 4_000_000 };
    expect(conPhaiDeNghi(r)).toBe(6_000_000);
    expect(deNghiVuot(r)).toBe(0);
  });

  it("chi phí bị sửa về 0 SAU khi đề nghị → còn 0, phần phiếu đang gán thành vượt", () => {
    const r = { tien_cong_ty: 0, thanh_tien_thuc_te: null, so_tien_da_dntt: 3_000_000 };
    expect(conPhaiDeNghi(r)).toBe(0);
    expect(deNghiVuot(r)).toBe(3_000_000);
  });

  it("thanh_tien_thuc_te override cả hai phía", () => {
    const r = { tien_cong_ty: 10_000_000, thanh_tien_thuc_te: 4_000_000, so_tien_da_dntt: 5_000_000 };
    expect(conPhaiDeNghi(r)).toBe(0);
    expect(deNghiVuot(r)).toBe(1_000_000);
  });
});

describe("tongCumDinhKy", () => {
  const dong = (net: number, daDeNghi: number, daTra = 0) => ({
    tien_cong_ty: net, thanh_tien_thuc_te: null, so_tien_da_dntt: daDeNghi, so_tien_da_tt: daTra,
  });

  it("không dòng nào vượt → Còn = Tổng − Σ đã đề nghị (đúng số kế toán nhẩm)", () => {
    const rows = [dong(10_000_000, 6_000_000), dong(7_000_000, 0), dong(3_000_000, 1_000_000)];
    const t = tongCumDinhKy(rows);
    expect(t.tongPhaiTra).toBe(20_000_000);
    expect(t.conPhaiDeNghi).toBe(20_000_000 - 6_000_000 - 1_000_000);
    expect(t.deNghiVuot).toBe(0);
    expect(t.soDongVuot).toBe(0);
  });

  it("có dòng vượt (chi phí giảm sau khi đề nghị) → Còn phình đúng bằng phần vượt, tách riêng ra", () => {
    const rows = [dong(10_000_000, 5_000_000), dong(0, 3_000_000), dong(7_000_000, 0)];
    const t = tongCumDinhKy(rows);
    const tongDaDeNghi = 5_000_000 + 3_000_000;
    expect(t.tongPhaiTra).toBe(17_000_000);
    expect(t.conPhaiDeNghi).toBe(5_000_000 + 7_000_000);
    expect(t.deNghiVuot).toBe(3_000_000);
    expect(t.soDongVuot).toBe(1);
    // Còn − vượt = Tổng − đã đề nghị: phần lệch kế toán thấy chính là phần vượt.
    expect(t.conPhaiDeNghi - t.deNghiVuot).toBe(t.tongPhaiTra - tongDaDeNghi);
  });

  it("đã trả cộng theo so_tien_da_tt, độc lập với đã đề nghị", () => {
    const t = tongCumDinhKy([dong(10_000_000, 10_000_000, 4_000_000), dong(5_000_000, 0)]);
    expect(t.daTra).toBe(4_000_000);
    expect(t.conPhaiDeNghi).toBe(5_000_000);
  });

  it("cụm rỗng → toàn 0", () => {
    expect(tongCumDinhKy([])).toEqual({ tongPhaiTra: 0, daTra: 0, conPhaiDeNghi: 0, deNghiVuot: 0, soDongVuot: 0 });
  });
});
