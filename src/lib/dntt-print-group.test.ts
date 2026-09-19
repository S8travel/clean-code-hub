import { describe, it, expect } from "vitest";
import { chonDnttInPhieu, tinhTienPhieuDntt } from "./dntt-print-group";

describe("chonDnttInPhieu", () => {
  it("không có ĐNTT nào → null", () => {
    expect(chonDnttInPhieu([])).toBeNull();
  });

  it("ưu tiên ĐNTT cọc chưa trả xong", () => {
    const chon = chonDnttInPhieu([
      { id: 10, la_coc: false, payment_status: "unpaid" },
      { id: 11, la_coc: true, payment_status: "unpaid" },
    ]);
    expect(chon?.id).toBe(11);
  });

  it("không có cọc → lấy ĐNTT chưa trả xong đầu tiên", () => {
    const chon = chonDnttInPhieu([
      { id: 10, la_coc: false, payment_status: "paid" },
      { id: 11, la_coc: false, payment_status: "partial" },
      { id: 12, la_coc: false, payment_status: "unpaid" },
    ]);
    expect(chon?.id).toBe(11);
  });

  it("tất cả đã trả xong (cấn trừ đủ) → VẪN giữ nhóm, lấy phiếu mới nhất", () => {
    // Ca thật: ĐNTT gộp nhiều vé cùng NCC, cấn trừ đủ ngay khi tạo. Trả null thì
    // nhóm vỡ thành từng phiếu lẻ và cấn trừ bị nuốt ở các phiếu sau.
    const chon = chonDnttInPhieu([
      { id: 40, la_coc: false, payment_status: "paid" },
      { id: 41, la_coc: false, payment_status: "paid" },
    ]);
    expect(chon?.id).toBe(41);
  });
});

describe("tinhTienPhieuDntt", () => {
  it("chưa trả gì → còn thanh toán = mệnh giá", () => {
    expect(
      tinhTienPhieuDntt({ soTienDntt: 10_000_000, canTru: 0, daTraTrenPhieu: 0, daTraPhieuKhac: 0 }),
    ).toEqual({ soTienCoc: 0, soTienConTT: 10_000_000 });
  });

  it("cấn trừ đủ → còn thanh toán = 0", () => {
    expect(
      tinhTienPhieuDntt({
        soTienDntt: 10_000_000,
        canTru: 10_000_000,
        daTraTrenPhieu: 0,
        daTraPhieuKhac: 0,
      }),
    ).toEqual({ soTienCoc: 0, soTienConTT: 0 });
  });

  it("cấn trừ một phần → còn lại phần thiếu", () => {
    expect(
      tinhTienPhieuDntt({
        soTienDntt: 10_000_000,
        canTru: 8_800_000,
        daTraTrenPhieu: 0,
        daTraPhieuKhac: 0,
      }).soTienConTT,
    ).toBe(1_200_000);
  });

  it("đã trả một phần bằng tiền trên chính phiếu → vào cột cọc + trừ khỏi còn lại", () => {
    expect(
      tinhTienPhieuDntt({
        soTienDntt: 10_000_000,
        canTru: 0,
        daTraTrenPhieu: 4_000_000,
        daTraPhieuKhac: 0,
      }),
    ).toEqual({ soTienCoc: 4_000_000, soTienConTT: 6_000_000 });
  });

  it("cọc trả qua ĐNTT khác cộng vào cột cọc, không trừ mệnh giá phiếu này", () => {
    expect(
      tinhTienPhieuDntt({
        soTienDntt: 6_000_000,
        canTru: 0,
        daTraTrenPhieu: 0,
        daTraPhieuKhac: 4_000_000,
      }),
    ).toEqual({ soTienCoc: 4_000_000, soTienConTT: 6_000_000 });
  });

  it("cấn trừ + tiền vượt mệnh giá → không in số âm", () => {
    expect(
      tinhTienPhieuDntt({
        soTienDntt: 1_000_000,
        canTru: 800_000,
        daTraTrenPhieu: 500_000,
        daTraPhieuKhac: 0,
      }).soTienConTT,
    ).toBe(0);
  });
});
