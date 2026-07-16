import { describe, it, expect } from "vitest";
import { buildQuyetToanSeed } from "./quyet-toan-hdv-seed";
import { calcQuyetToanHDV } from "./quyet-toan-hdv-calc";
import { computePhaiThu, type PhaiThuDoanInput } from "./phai-thu-calc";

/** Số tiền của 1 khoản trên bảng Phải thu (0 nếu không thu / không phải HDV thu). */
function phaiThuHdv(doan: PhaiThuDoanInput, key: "tip" | "dau_khach" | "quy_vp", tyGia = 800) {
  const it = computePhaiThu(doan, tyGia).items.find((i) => i.key === key);
  return it && it.show && it.nguoiThu === "hdv" ? it.thanhTienVND : 0;
}

/** Chạy seed → calcQuyetToanHDV, trả các khoản thu VND. */
function quyetToan(doan: PhaiThuDoanInput, tyGia = 800) {
  const seed = buildQuyetToanSeed(doan, tyGia);
  return calcQuyetToanHDV({
    tamUng: 0, thuTrachNhiem: 0, thuBanOp: 0, tongHdvChi: 0,
    tip: seed.tip,
    dauKhach: seed.dauKhach,
    quyVp: seed.quyVp,
    thuKhac: seed.thuKhac,
  });
}

// Đoàn thật gây ra báo cáo lỗi: VDA061805JX6 (id 168), số liệu lấy từ prod.
// LƯU Ý: computePhaiThu tính tổng khách = (lon+em1+em2+tl) || so_khach — bỏ trống
// các cột chi tiết sẽ ra tổng SAI (0+0+0+1 = 1 khách), fixture phải điền đủ.
const doanThat: PhaiThuDoanInput = {
  loai_tour: "inbound",
  so_khach: 20, so_khach_lon: 18, so_khach_em1: 1, so_khach_em2: 0, so_khach_tl: 1,
  ngay_di: "2026-06-18", ngay_ve: "2026-06-22",
  thu_tip: true, tip_ty_gia: 795,       // OP đã sửa 800 → 795 ở bảng Phải thu
  dau_khach_so_khach_override: 16,
  quy_vp_amount: 250_000,
};

describe("buildQuyetToanSeed — khớp bảng Phải thu (bất biến)", () => {
  it("tỷ giá đoàn (795) được dùng, KHÔNG phải mặc định 800", () => {
    const seed = buildQuyetToanSeed(doanThat, 800);
    expect(seed.tip.tyGia).toBe(795);
    // 19 khách × 150 NDT × 5 ngày × 795 = 11.328.750 (không phải 11.400.000 với 800)
    expect(quyetToan(doanThat).thuTipVnd).toBe(11_328_750);
    expect(quyetToan(doanThat).thuTipVnd).not.toBe(11_400_000);
  });

  it("tip / đầu khách / quỹ VP đều bằng đúng số bảng Phải thu", () => {
    const qt = quyetToan(doanThat);
    expect(qt.thuTipVnd).toBe(phaiThuHdv(doanThat, "tip"));
    expect(qt.thuDauKhachVnd).toBe(phaiThuHdv(doanThat, "dau_khach"));
    expect(qt.thuQuyVpVnd).toBe(phaiThuHdv(doanThat, "quy_vp"));
  });

  it("tôn trọng tip_so_ngay_override (12 đoàn prod dùng)", () => {
    const d = { ...doanThat, tip_so_ngay_override: 3 };
    expect(buildQuyetToanSeed(d).soNgay).toBe(3);
    expect(quyetToan(d).thuTipVnd).toBe(phaiThuHdv(d, "tip"));
  });

  it("tip khoán (tip_lump_sum) không bị tính lại bằng công thức", () => {
    const d = { ...doanThat, tip_lump_sum: 10_000 };
    const seed = buildQuyetToanSeed(d);
    expect(seed.tip.tongNT).toBe(10_000);
    // 10.000 NDT × 795 = 7.950.000 — KHÔNG phải 19×150×5×795
    expect(quyetToan(d).thuTipVnd).toBe(7_950_000);
    expect(quyetToan(d).thuTipVnd).toBe(phaiThuHdv(d, "tip"));
  });

  it("tip bằng VND → tỷ giá 1, không nhân 800", () => {
    const d = { ...doanThat, tip_currency: "VND", tip_rate: 50_000, tip_ty_gia: null };
    const seed = buildQuyetToanSeed(d, 800);
    expect(seed.tip.tyGia).toBe(1);
    expect(quyetToan(d).thuTipVnd).toBe(phaiThuHdv(d, "tip"));
  });

  it("thu_tip = false → không thu tip", () => {
    const d = { ...doanThat, thu_tip: false };
    expect(buildQuyetToanSeed(d).tip.soKhach).toBe(0);
    expect(quyetToan(d).thuTipVnd).toBe(0);
  });

  it("tip do CÔNG TY thu → không vào quyết toán HDV", () => {
    const d = { ...doanThat, tip_nguoi_thu: "cong_ty" };
    expect(buildQuyetToanSeed(d).tip.soKhach).toBe(0);
    expect(quyetToan(d).thuTipVnd).toBe(0);
    expect(phaiThuHdv(d, "tip")).toBe(0);
  });

  it("tip khoán nhưng công ty thu → vẫn 0 (tongNT không lấn quyền)", () => {
    const d = { ...doanThat, tip_lump_sum: 10_000, tip_nguoi_thu: "cong_ty" };
    expect(quyetToan(d).thuTipVnd).toBe(0);
  });

  it("đầu khách / quỹ VP do công ty thu → không vào quyết toán", () => {
    const d = { ...doanThat, dau_khach_nguoi_thu: "cong_ty", quy_vp_nguoi_thu: "cong_ty" };
    const qt = quyetToan(d);
    expect(qt.thuDauKhachVnd).toBe(0);
    expect(qt.thuQuyVpVnd).toBe(0);
  });

  it("extras HDV thu gộp vào Thu khác; extras công ty thu thì không", () => {
    const d: PhaiThuDoanInput = {
      ...doanThat,
      phai_thu_extras: [
        { moTa: "Vé phát sinh", soTien: 1_000_000, loaiTien: "VND", tyGia: 1, nguoiThu: "hdv" },
        { moTa: "Cty thu", soTien: 500_000, loaiTien: "VND", tyGia: 1, nguoiThu: "cong_ty" },
      ],
    };
    expect(buildQuyetToanSeed(d).thuKhac).toBe(1_000_000);
  });

  it("đoàn null → seed rỗng, không nổ", () => {
    const seed = buildQuyetToanSeed(null);
    expect(seed.tip.soKhach).toBe(0);
    expect(seed.thuKhac).toBe(0);
  });

  it("chưa chốt tip_ty_gia → dùng tham số fallback (hằng mặc định, KHÔNG localStorage)", () => {
    const d = { ...doanThat, tip_ty_gia: null };
    expect(buildQuyetToanSeed(d, 810).tip.tyGia).toBe(810);
    expect(quyetToan(d, 810).thuTipVnd).toBe(phaiThuHdv(d, "tip", 810));
  });
});
