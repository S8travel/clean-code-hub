import { describe, it, expect } from "vitest";
import {
  computePhaiThu,
  parsePhaiThuExtras,
  sumHdvExtrasVND,
  DAU_KHACH_DEFAULT_RATE,
  QUY_VP_DEFAULT_AMOUNT,
  TY_GIA_NDT_DEFAULT,
} from "./phai-thu-calc";

describe("computePhaiThu", () => {
  it("đoàn null/undefined → rỗng", () => {
    expect(computePhaiThu(null)).toEqual({ items: [], totalVND: 0, hdvVND: 0, ctyVND: 0 });
    expect(computePhaiThu(undefined)).toEqual({ items: [], totalVND: 0, hdvVND: 0, ctyVND: 0 });
  });

  it("tip auto (có T/L) + quỹ VP mặc định, đầu khách = 0", () => {
    // 18 khách + 0 T/L? screenshot: 18 khách, 6 ngày, 150 NDT, tỷ giá 800.
    const r = computePhaiThu(
      { so_khach: 18, so_khach_tl: 0, ngay_di: "2026-05-21", ngay_ve: "2026-05-26" },
      800,
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    // không T/L → rate mặc định 300, soKhach = 18, soNgay = 6 (inclusive)
    expect(tip.soKhach).toBe(18);
    expect(tip.soNgay).toBe(6);
    expect(tip.donGia).toBe(300);
    expect(tip.tongGoc).toBe(18 * 6 * 300); // 32.400 NDT
    expect(tip.thanhTienVND).toBe(18 * 6 * 300 * 800);
    expect(tip.nguoiThu).toBe("hdv");

    // đầu khách mặc định 0 khách → không show
    const dk = r.items.find((i) => i.key === "dau_khach")!;
    expect(dk.show).toBe(false);
    expect(dk.thanhTienVND).toBe(0);

    // quỹ VP mặc định 200k → show
    const vp = r.items.find((i) => i.key === "quy_vp")!;
    expect(vp.show).toBe(true);
    expect(vp.thanhTienVND).toBe(QUY_VP_DEFAULT_AMOUNT);
  });

  it("quỹ VP: null = chưa nhập → default 200k; 0 = đã xóa → KHÔNG in (bug Excel 2026-06-12)", () => {
    // null (đoàn mới) → gợi ý mặc định 200k
    const chuaNhap = computePhaiThu({ quy_vp_amount: null }, 800);
    const vpDefault = chuaNhap.items.find((i) => i.key === "quy_vp")!;
    expect(vpDefault.show).toBe(true);
    expect(vpDefault.thanhTienVND).toBe(QUY_VP_DEFAULT_AMOUNT);

    // 0 (user xóa trống ô tiền — UI lưu 0, KHÔNG lưu null) → ẩn khỏi export
    const daXoa = computePhaiThu({ quy_vp_amount: 0 }, 800);
    const vpXoa = daXoa.items.find((i) => i.key === "quy_vp")!;
    expect(vpXoa.show).toBe(false);
    expect(daXoa.totalVND).toBe(0);

    // đầu khách rate=0 (đã xóa) + có khách → vẫn 0, không rơi về default 200k
    const dkXoa = computePhaiThu(
      { dau_khach_rate: 0, dau_khach_so_khach_override: 7, quy_vp_amount: 0 },
      800,
    );
    const dk = dkXoa.items.find((i) => i.key === "dau_khach")!;
    expect(dk.show).toBe(false);
    expect(dk.thanhTienVND).toBe(0);
  });

  it("khớp screenshot: 18 khách, 6 ngày, 150 NDT override, tỷ giá 800 → tip 12.960.000đ", () => {
    const r = computePhaiThu(
      {
        so_khach: 18,
        so_khach_tl: 0,
        ngay_di: "2026-05-21",
        ngay_ve: "2026-05-26",
        tip_rate: 150, // override rate
        quy_vp_amount: 200_000,
      },
      800,
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    expect(tip.tongGoc).toBe(16_200); // 18 × 6 × 150
    expect(tip.thanhTienVND).toBe(12_960_000); // × 800
  });

  it("thu_tip=false → tip không show, không cộng tổng", () => {
    const r = computePhaiThu(
      { so_khach: 20, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-05", thu_tip: false },
      800,
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    expect(tip.show).toBe(false);
    expect(tip.thanhTienVND).toBe(0);
    // tổng chỉ còn quỹ VP mặc định
    expect(r.totalVND).toBe(QUY_VP_DEFAULT_AMOUNT);
  });

  it("đầu khách: số khách × đơn giá VND (không nhân ngày, không tỷ giá)", () => {
    const r = computePhaiThu(
      {
        so_khach: 10,
        so_khach_tl: 0,
        ngay_di: "2026-05-01",
        ngay_ve: "2026-05-03",
        thu_tip: false,
        dau_khach_so_khach_override: 10,
        quy_vp_amount: 0,
      },
      800,
    );
    const dk = r.items.find((i) => i.key === "dau_khach")!;
    expect(dk.donGia).toBe(DAU_KHACH_DEFAULT_RATE);
    expect(dk.thanhTienVND).toBe(10 * DAU_KHACH_DEFAULT_RATE);
    expect(dk.tyGia).toBe(1);
    expect(r.totalVND).toBe(10 * DAU_KHACH_DEFAULT_RATE);
  });

  it("tách HDV vs Công ty theo nguoi_thu", () => {
    const r = computePhaiThu(
      {
        so_khach: 10,
        so_khach_tl: 0,
        ngay_di: "2026-05-01",
        ngay_ve: "2026-05-03",
        thu_tip: false,
        dau_khach_so_khach_override: 10,
        dau_khach_nguoi_thu: "cong_ty", // đầu khách → công ty thu
        quy_vp_amount: 200_000,
        quy_vp_nguoi_thu: "hdv",
      },
      800,
    );
    expect(r.ctyVND).toBe(10 * DAU_KHACH_DEFAULT_RATE); // đầu khách
    expect(r.hdvVND).toBe(200_000); // quỹ VP
    expect(r.totalVND).toBe(r.ctyVND + r.hdvVND);
  });

  it("tip_lump_sum override bỏ qua công thức số khách × ngày × giá", () => {
    const r = computePhaiThu(
      { so_khach: 5, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-02", tip_lump_sum: 1000, quy_vp_amount: 0 },
      800,
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    expect(tip.tongGoc).toBe(1000);
    expect(tip.thanhTienVND).toBe(1000 * 800);
  });

  it("tip_nguoi_thu='cong_ty' → tip tính vào công ty, không vào HDV", () => {
    const r = computePhaiThu(
      { so_khach: 10, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-02", tip_rate: 100, tip_nguoi_thu: "cong_ty", quy_vp_amount: 0 },
      800,
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    expect(tip.nguoiThu).toBe("cong_ty");
    expect(r.ctyVND).toBe(tip.thanhTienVND);
    expect(r.hdvVND).toBe(0);
  });

  it("tip_ty_gia trên đoàn override tham số tyGiaNdt", () => {
    const r = computePhaiThu(
      { so_khach: 2, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-01", tip_rate: 10, tip_ty_gia: 1000, quy_vp_amount: 0 },
      800, // param bị bỏ qua vì có tip_ty_gia
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    expect(tip.tyGia).toBe(1000);
    expect(tip.thanhTienVND).toBe(2 * 1 * 10 * 1000);
  });

  it("tip_currency='VND' → tỷ giá = 1 (không quy đổi)", () => {
    const r = computePhaiThu(
      { so_khach: 3, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-01", tip_rate: 50000, tip_currency: "VND", tip_ty_gia: 1000, quy_vp_amount: 0 },
      800,
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    expect(tip.donViGoc).toBe("VND");
    expect(tip.tyGia).toBe(1);
    expect(tip.thanhTienVND).toBe(3 * 1 * 50000); // không nhân tỷ giá
  });

  it("extras: gồm vào items + totals, tách theo người thu, VND → tỷ giá 1", () => {
    const r = computePhaiThu(
      {
        so_khach: 5, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-01",
        thu_tip: false, quy_vp_amount: 0,
        phai_thu_extras: [
          { moTa: "Phí A", soTien: 100, loaiTien: "NDT", tyGia: 800, nguoiThu: "hdv" },
          { moTa: "Phí B", soTien: 50000, loaiTien: "VND", tyGia: 999, nguoiThu: "cong_ty" }, // tyGia bị ép = 1
        ],
      },
      800,
    );
    const extras = r.items.filter((i) => i.key === "extra");
    expect(extras).toHaveLength(2);
    expect(extras[0].thanhTienVND).toBe(100 * 800);
    expect(extras[1].tyGia).toBe(1);
    expect(extras[1].thanhTienVND).toBe(50000);
    expect(r.hdvVND).toBe(80000);
    expect(r.ctyVND).toBe(50000);
    expect(r.totalVND).toBe(130000);
  });

  it("extra soTien=0 hoặc tyGia=0 → show=false, không cộng tổng", () => {
    const r = computePhaiThu(
      {
        so_khach: 5, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-01",
        thu_tip: false, quy_vp_amount: 0,
        phai_thu_extras: [
          { moTa: "rỗng", soTien: 0, loaiTien: "NDT", tyGia: 800, nguoiThu: "hdv" },
        ],
      },
      800,
    );
    expect(r.items.find((i) => i.key === "extra")!.show).toBe(false);
    expect(r.totalVND).toBe(0);
  });

  it("tỷ giá <= 0 → fallback default 800", () => {
    const r = computePhaiThu(
      { so_khach: 2, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-01", tip_rate: 10, quy_vp_amount: 0 },
      0,
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    // 2 × 1 × 10 = 20 NDT × 800
    expect(tip.tyGia).toBe(TY_GIA_NDT_DEFAULT);
    expect(tip.thanhTienVND).toBe(20 * TY_GIA_NDT_DEFAULT);
  });

  // ── #3: tip default currency theo loai_tour ──────────────────────────────
  it("loai_tour='noi_dia' → tip mặc định VND (tỷ giá 1, không quy đổi)", () => {
    const r = computePhaiThu(
      { loai_tour: "noi_dia", so_khach: 4, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-01", tip_rate: 50000, quy_vp_amount: 0 },
      800,
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    expect(tip.donViGoc).toBe("VND");
    expect(tip.tyGia).toBe(1);
    expect(tip.thanhTienVND).toBe(4 * 1 * 50000); // KHÔNG nhân 800
  });

  it("loai_tour outbound/inbound/null → tip mặc định NDT (giữ hành vi cũ)", () => {
    for (const lt of ["outbound", "inbound", null, undefined] as const) {
      const r = computePhaiThu(
        { loai_tour: lt, so_khach: 2, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-01", tip_rate: 10, quy_vp_amount: 0 },
        800,
      );
      const tip = r.items.find((i) => i.key === "tip")!;
      expect(tip.donViGoc).toBe("NDT");
      expect(tip.thanhTienVND).toBe(2 * 1 * 10 * 800);
    }
  });

  it("noi_dia nhưng tip_currency đã chọn NDT → tôn trọng lựa chọn (quy đổi)", () => {
    const r = computePhaiThu(
      { loai_tour: "noi_dia", so_khach: 2, so_khach_tl: 0, ngay_di: "2026-05-01", ngay_ve: "2026-05-01", tip_rate: 10, tip_currency: "NDT", quy_vp_amount: 0 },
      800,
    );
    const tip = r.items.find((i) => i.key === "tip")!;
    expect(tip.donViGoc).toBe("NDT");
    expect(tip.thanhTienVND).toBe(2 * 1 * 10 * 800);
  });

  // ── #4: đầu khách / quỹ VP có currency + tỷ giá riêng ─────────────────────
  it("đầu khách ngoại tệ: quy đổi theo dau_khach_ty_gia", () => {
    const r = computePhaiThu(
      {
        thu_tip: false, quy_vp_amount: 0,
        dau_khach_rate: 50, dau_khach_so_khach_override: 10,
        dau_khach_currency: "USD", dau_khach_ty_gia: 25000,
      },
      800,
    );
    const dk = r.items.find((i) => i.key === "dau_khach")!;
    expect(dk.donViGoc).toBe("USD");
    expect(dk.tongGoc).toBe(10 * 50);          // 500 USD
    expect(dk.tyGia).toBe(25000);
    expect(dk.thanhTienVND).toBe(10 * 50 * 25000);
  });

  it("quỹ VP ngoại tệ thiếu tỷ giá riêng → fallback tỷ giá tip base", () => {
    const r = computePhaiThu(
      { thu_tip: false, quy_vp_amount: 100, quy_vp_currency: "NDT", tip_ty_gia: 3500 },
      800,
    );
    const vp = r.items.find((i) => i.key === "quy_vp")!;
    expect(vp.donViGoc).toBe("NDT");
    expect(vp.tyGia).toBe(3500); // fallback tyGiaTipBase (tip_ty_gia)
    expect(vp.thanhTienVND).toBe(100 * 3500);
  });

  it("đầu khách/quỹ VP mặc định (không currency) → VND, tỷ giá 1 (giữ hành vi cũ)", () => {
    const r = computePhaiThu(
      { thu_tip: false, dau_khach_rate: 200000, dau_khach_so_khach_override: 3, quy_vp_amount: 200000 },
      800,
    );
    const dk = r.items.find((i) => i.key === "dau_khach")!;
    const vp = r.items.find((i) => i.key === "quy_vp")!;
    expect(dk.donViGoc).toBe("VND");
    expect(dk.tyGia).toBe(1);
    expect(dk.thanhTienVND).toBe(600000);
    expect(vp.donViGoc).toBe("VND");
    expect(vp.tyGia).toBe(1);
    expect(vp.thanhTienVND).toBe(200000);
  });
});

describe("sumHdvExtrasVND", () => {
  it("đoàn null/undefined hoặc không có extras → 0", () => {
    expect(sumHdvExtrasVND(null)).toBe(0);
    expect(sumHdvExtrasVND(undefined)).toBe(0);
    expect(sumHdvExtrasVND({})).toBe(0);
  });

  it("chỉ cộng extras HDV thu, quy ra VND; bỏ extras công ty thu", () => {
    const total = sumHdvExtrasVND({
      phai_thu_extras: [
        { moTa: "Ống ngậm thở cano", soTien: 192, loaiTien: "NDT", tyGia: 800, nguoiThu: "hdv" }, // 153.600
        { moTa: "Phụ phí VND", soTien: 50000, loaiTien: "VND", tyGia: 999, nguoiThu: "hdv" }, // VND ép tyGia=1 → 50.000
        { moTa: "Công ty thu", soTien: 100, loaiTien: "NDT", tyGia: 800, nguoiThu: "cong_ty" }, // KHÔNG cộng
      ],
    });
    expect(total).toBe(153_600 + 50_000);
  });

  it("bỏ extras soTien=0 hoặc tyGia=0 (mirror điều kiện show)", () => {
    const total = sumHdvExtrasVND({
      phai_thu_extras: [
        { moTa: "rỗng", soTien: 0, loaiTien: "NDT", tyGia: 800, nguoiThu: "hdv" },
        { moTa: "thiếu tỷ giá", soTien: 100, loaiTien: "NDT", tyGia: 0, nguoiThu: "hdv" },
        { moTa: "ok", soTien: 10, loaiTien: "NDT", tyGia: 800, nguoiThu: "hdv" },
      ],
    });
    expect(total).toBe(10 * 800);
  });
});

describe("parsePhaiThuExtras", () => {
  it("không phải mảng → []", () => {
    expect(parsePhaiThuExtras(null)).toEqual([]);
    expect(parsePhaiThuExtras(undefined)).toEqual([]);
    expect(parsePhaiThuExtras({})).toEqual([]);
    expect(parsePhaiThuExtras("x")).toEqual([]);
  });

  it("lọc phần tử rác, chuẩn hóa loại tiền / người thu / số", () => {
    const out = parsePhaiThuExtras([
      null,
      42,
      { moTa: "A", soTien: "100", loaiTien: "NDT", tyGia: "800", nguoiThu: "hdv" },
      { moTa: 1, soTien: 5, loaiTien: "BAD", tyGia: 2, nguoiThu: "x" }, // loaiTien lỗi → NDT, nguoiThu lỗi → hdv, moTa non-string → ""
      { soTien: 9, loaiTien: "VND", tyGia: 50, nguoiThu: "cong_ty" }, // VND ép tyGia=1
    ]);
    expect(out).toEqual([
      { moTa: "A", soTien: 100, loaiTien: "NDT", tyGia: 800, nguoiThu: "hdv" },
      { moTa: "", soTien: 5, loaiTien: "NDT", tyGia: 2, nguoiThu: "hdv" },
      { moTa: "", soTien: 9, loaiTien: "VND", tyGia: 1, nguoiThu: "cong_ty" },
    ]);
  });
});
