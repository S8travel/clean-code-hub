import { describe, it, expect } from "vitest";
import { nhanTrangThaiTTCanTru, gomCanTruTheoChiPhi } from "./trang-thai-tt-can-tru";

describe("nhanTrangThaiTTCanTru", () => {
  it("không có cấn trừ → giữ nguyên nhãn gốc", () => {
    expect(
      nhanTrangThaiTTCanTru({ nhanGoc: "Chưa thanh toán", trangThai: "unpaid", canTru: 0 }),
    ).toBe("Chưa thanh toán");
  });

  it("đã cấn trừ nhưng phiếu chưa duyệt → ghi thêm số đã cấn trừ", () => {
    expect(
      nhanTrangThaiTTCanTru({ nhanGoc: "Chưa thanh toán", trangThai: "unpaid", canTru: 10_000_000 }),
    ).toBe("Chưa thanh toán · đã cấn trừ 10.000.000 (chờ duyệt)");
  });

  it("dòng đã được tính là trả xong → không thêm gì (tránh nhiễu)", () => {
    expect(
      nhanTrangThaiTTCanTru({ nhanGoc: "Đã thanh toán", trangThai: "paid", canTru: 10_000_000 }),
    ).toBe("Đã thanh toán");
  });

  it("trả một phần mà có cấn trừ → vẫn ghi chú", () => {
    expect(
      nhanTrangThaiTTCanTru({ nhanGoc: "Một phần", trangThai: "partial_paid", canTru: 2_500_000 }),
    ).toBe("Một phần · đã cấn trừ 2.500.000 (chờ duyệt)");
  });
});

describe("gomCanTruTheoChiPhi", () => {
  const pay = (chi_phi_id: number, method: string, payment_so_tien: number) =>
    ({ chi_phi_id, method, payment_so_tien });

  it("chỉ cộng payment cấn trừ, gom theo dòng chi phí", () => {
    expect(
      gomCanTruTheoChiPhi([
        pay(1, "can_tru", 800_000),
        pay(1, "can_tru", 200_000),
        pay(1, "cash", 5_000_000),
        pay(2, "can_tru", 300_000),
        pay(3, "voucher", 100_000),
      ]),
    ).toEqual({ 1: 1_000_000, 2: 300_000 });
  });

  it("không có payment nào → map rỗng", () => {
    expect(gomCanTruTheoChiPhi([])).toEqual({});
  });
});
