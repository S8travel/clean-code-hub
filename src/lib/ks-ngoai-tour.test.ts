import { describe, it, expect } from "vitest";
import {
  buildKsNgoaiTourPayload, nightsBetween, calcKsNgoaiTourThanhTien,
} from "./ks-ngoai-tour";

describe("nightsBetween", () => {
  it("2 đêm", () => expect(nightsBetween("2026-07-23", "2026-07-25")).toBe(2));
  it("1 đêm", () => expect(nightsBetween("2026-07-23", "2026-07-24")).toBe(1));
  it("thiếu ngày → 1", () => {
    expect(nightsBetween(null, "2026-07-24")).toBe(1);
    expect(nightsBetween("2026-07-23", null)).toBe(1);
  });
  it("co ≤ ci → 1", () => {
    expect(nightsBetween("2026-07-25", "2026-07-23")).toBe(1);
    expect(nightsBetween("2026-07-23", "2026-07-23")).toBe(1);
  });
});

describe("calcKsNgoaiTourThanhTien", () => {
  it("(số phòng − FOC) × giá × đêm — khớp ảnh: (27−3)×800k×1 = 19.2tr", () => {
    expect(calcKsNgoaiTourThanhTien(27, 3, 800_000, 1)).toBe(19_200_000);
  });
  it("nhiều đêm", () => {
    expect(calcKsNgoaiTourThanhTien(10, 0, 1_000_000, 3)).toBe(30_000_000);
  });
  it("FOC ≥ số phòng → 0 (không âm)", () => {
    expect(calcKsNgoaiTourThanhTien(2, 5, 800_000, 1)).toBe(0);
  });
  it("FOC thập phân 0.5", () => {
    expect(calcKsNgoaiTourThanhTien(10, 0.5, 1_000_000, 1)).toBe(9_500_000);
  });
});

describe("buildKsNgoaiTourPayload", () => {
  it("phòng: net = (SP−FOC)×giá×đêm; set tien_cong_ty + thanh_tien_thuc_te = net", () => {
    const p = buildKsNgoaiTourPayload({
      doanId: 5, khachSanId: 12, nccId: 10, loaiRow: "phong",
      loaiPhong: "19 twn 8 dbl", soPhong: 27, focCount: 3,
      ci: "2026-07-23", co: "2026-07-24", giaPhong: 800_000, dinhKy: true,
    });
    expect(p).toMatchObject({
      doan_id: 5, loai: "chi", danh_muc: "khach_san", ngoai_tour: true,
      ref_doan_ngay_id: null, ref_doan_ngay_item_id: null,
      khach_san_id: 12, loai_row: "phong",
      ngoai_tour_ci: "2026-07-23", ngoai_tour_co: "2026-07-24",
      mo_ta: "19 twn 8 dbl", don_gia: 800_000, so_luong: 27, foc_count: 3,
      tien_cong_ty: 19_200_000, tien_hdv: 0, thanh_tien_thuc_te: 19_200_000,
      nha_cung_cap_id: 10, thanh_toan_dinh_ky: true,
    });
    expect("id" in p).toBe(false);
  });

  it("nhiều đêm: 2 đêm → ×2", () => {
    const p = buildKsNgoaiTourPayload({
      doanId: 1, khachSanId: 3, nccId: null, loaiRow: "phong",
      loaiPhong: "twn", soPhong: 10, focCount: 0,
      ci: "2026-07-23", co: "2026-07-25", giaPhong: 1_000_000, dinhKy: false,
    });
    expect(p.so_luong).toBe(10);
    expect(p.tien_cong_ty).toBe(20_000_000);   // (10-0)×1tr×2 đêm
    expect(p.thanh_tien_thuc_te).toBe(20_000_000);
  });

  it("dịch vụ: đêm = 1 dù không có ngày", () => {
    const p = buildKsNgoaiTourPayload({
      doanId: 1, khachSanId: 3, nccId: 2, loaiRow: "dich_vu_khac",
      loaiPhong: "Ăn sáng thêm", soPhong: 5, focCount: 0,
      ci: null, co: null, giaPhong: 100_000, dinhKy: true,
    });
    expect(p.loai_row).toBe("dich_vu_khac");
    expect(p.tien_cong_ty).toBe(500_000);   // 5×100k×1
  });

  it("có id → UPDATE; mô tả trống → fallback", () => {
    const p = buildKsNgoaiTourPayload({
      id: 99, doanId: 1, khachSanId: 3, nccId: null, loaiRow: "phong",
      loaiPhong: "   ", soPhong: 1, focCount: 0, ci: null, co: null, giaPhong: 500_000, dinhKy: false,
    });
    expect(p.id).toBe(99);
    expect(p.mo_ta).toBe("Phòng");
  });

  it("luôn công ty trả (tien_hdv = 0)", () => {
    const p = buildKsNgoaiTourPayload({
      doanId: 1, khachSanId: 1, nccId: 3, loaiRow: "phong",
      loaiPhong: "a", soPhong: 1, focCount: 0, ci: null, co: null, giaPhong: 999, dinhKy: true,
    });
    expect(p.tien_hdv).toBe(0);
  });
});
