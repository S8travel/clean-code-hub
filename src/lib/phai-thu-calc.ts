// Phải thu (HDV thu hộ / công ty thu) — gộp các nguồn thu của 1 đoàn:
//   1. Tip          — số khách × số ngày × đơn giá → VND qua tỷ giá.
//   2. Đầu khách    — số khách × đơn giá (VND, không nhân ngày, không tỷ giá).
//   3. Quỹ VP       — lump-sum (VND).
//   4. Extras       — các dòng thu thêm tay (persist trong doan.phai_thu_extras).
// Mỗi nguồn có "người thu" (hdv | cong_ty) → tách tổng HDV vs Công ty.
//
// Tách riêng khỏi UI (ChiPhiPhasThuSection) + export Excel để test được và để
// các nơi (UI / export / quyết toán HDV) luôn ra cùng kết quả. PHẢI khớp logic
// ChiPhiPhasThuSection + computeHdvPhaiThuVND (ChiPhiHDVSection).

import { defaultTipRate, defaultTipSoKhach, tipDaysInclusive, calcTipNDT, shouldCollectTip } from "./tip-calc";
import { tourProfile } from "./tour-profile";

/** Đơn giá / số tiền mặc định khi đoàn chưa nhập (mirror ChiPhiPhasThuSection). */
export const DAU_KHACH_DEFAULT_RATE = 200_000;
export const QUY_VP_DEFAULT_AMOUNT = 200_000;
/** Tỷ giá NDT → VND mặc định khi đoàn chưa chốt `doan.tip_ty_gia` (snapshot per tour). */
export const TY_GIA_NDT_DEFAULT = 800;

export type NguoiThu = "hdv" | "cong_ty";

export type LoaiTien = "NDT" | "NT$" | "US$" | "USD" | "VND";

/** 1 dòng thu thêm tay — lưu trong doan.phai_thu_extras (jsonb). */
export interface PhaiThuExtra {
  moTa: string;
  soTien: number;
  loaiTien: LoaiTien;
  tyGia: number;
  nguoiThu: NguoiThu;
}

/** Subset field đoàn mà tính Phải thu cần. Tất cả optional cho linh hoạt. */
export interface PhaiThuDoanInput {
  so_khach?: number | null;
  so_khach_lon?: number | null;
  so_khach_em1?: number | null;
  so_khach_em2?: number | null;
  so_khach_tl?: number | null;
  ngay_di?: string | null;
  ngay_ve?: string | null;
  // Loại tour — quyết định loại tiền mặc định của Tip (nội địa → VND).
  loai_tour?: string | null;
  // Tip
  thu_tip?: boolean | null;
  tip_rate?: number | null;
  tip_so_khach_override?: number | null;
  tip_so_ngay_override?: number | null;
  tip_lump_sum?: number | null;
  tip_currency?: string | null;
  tip_nguoi_thu?: string | null;
  tip_ty_gia?: number | null;
  // Đầu khách (currency + tỷ giá riêng — mặc định VND/1)
  dau_khach_rate?: number | null;
  dau_khach_currency?: string | null;
  dau_khach_ty_gia?: number | null;
  dau_khach_nguoi_thu?: string | null;
  dau_khach_so_khach_override?: number | null;
  // Quỹ VP (currency + tỷ giá riêng — mặc định VND/1)
  quy_vp_amount?: number | null;
  quy_vp_currency?: string | null;
  quy_vp_ty_gia?: number | null;
  quy_vp_nguoi_thu?: string | null;
  // Extras (thu thêm tay)
  phai_thu_extras?: unknown;
}

export type PhaiThuKey = "tip" | "dau_khach" | "quy_vp" | "extra";

export interface PhaiThuItem {
  key: PhaiThuKey;
  label: string;
  /** Số khách áp dụng; null = không áp dụng (hiển thị "—"). */
  soKhach: number | null;
  /** Số ngày áp dụng; null = không áp dụng. */
  soNgay: number | null;
  /** Đơn giá gốc (theo loại tiền: tip = currency chọn; đầu khách/quỹ VP = VND). */
  donGia: number;
  /** Đơn vị đơn giá gốc (NDT/NT$/US$/USD/VND). */
  donViGoc: LoaiTien;
  /** Tổng theo đơn vị gốc (tip: NDT; đầu khách/quỹ VP: VND). */
  tongGoc: number;
  /** Tỷ giá quy ra VND (1 cho khoản VND). */
  tyGia: number;
  /** Thành tiền VND (đã quy đổi). */
  thanhTienVND: number;
  nguoiThu: NguoiThu;
  /** Có thu khoản này không (false → không cộng vào tổng, không in dòng). */
  show: boolean;
}

export interface PhaiThuResult {
  items: PhaiThuItem[];
  /** Tổng tất cả khoản (chỉ khoản show=true). */
  totalVND: number;
  /** Tổng phần HDV thu. */
  hdvVND: number;
  /** Tổng phần công ty thu. */
  ctyVND: number;
}

function normNguoiThu(v: string | null | undefined): NguoiThu {
  return v === "cong_ty" ? "cong_ty" : "hdv"; // mặc định HDV
}

const LOAI_TIEN_SET: ReadonlySet<string> = new Set(["NDT", "NT$", "US$", "USD", "VND"]);
function normLoaiTien(v: string | null | undefined, fallback: LoaiTien): LoaiTien {
  return v && LOAI_TIEN_SET.has(v) ? (v as LoaiTien) : fallback;
}

/** Parse doan.phai_thu_extras (jsonb không tin cậy kiểu) → mảng PhaiThuExtra sạch. */
export function parsePhaiThuExtras(raw: unknown): PhaiThuExtra[] {
  if (!Array.isArray(raw)) return [];
  const out: PhaiThuExtra[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const loaiTien = normLoaiTien(typeof o.loaiTien === "string" ? o.loaiTien : null, "NDT");
    const soTien = Number(o.soTien) || 0;
    const tyGia = loaiTien === "VND" ? 1 : (Number(o.tyGia) || 0);
    out.push({
      moTa: typeof o.moTa === "string" ? o.moTa : "",
      soTien,
      loaiTien,
      tyGia,
      nguoiThu: normNguoiThu(typeof o.nguoiThu === "string" ? o.nguoiThu : null),
    });
  }
  return out;
}

/**
 * Tổng các khoản "thu thêm tay" (extras) mà HDV thu hộ, quy ra VND.
 *
 * Dùng cho dòng "Thu khác" trên Giấy đề nghị quyết toán HDV: mọi khoản phải thu
 * NGOÀI tip / đầu khách / quỹ VP (đã có dòng riêng trong form) mà HDV thu phải
 * gộp hết vào "Thu khác" → Tổng thu khớp bảng "Phải thu", con số quyết toán
 * (công ty còn phải trả / HDV trả lại) không bị lệch.
 *
 * Chỉ tính extras nguoiThu='hdv' và show (soTien>0 && tyGia>0) — mirror điều
 * kiện trong computePhaiThu. Extras do công ty thu KHÔNG vào quyết toán HDV.
 */
export function sumHdvExtrasVND(doan: PhaiThuDoanInput | null | undefined): number {
  return parsePhaiThuExtras(doan?.phai_thu_extras)
    .filter((ex) => ex.nguoiThu === "hdv" && ex.soTien > 0 && ex.tyGia > 0)
    .reduce((sum, ex) => sum + ex.soTien * ex.tyGia, 0);
}

/**
 * Tính toàn bộ Phải thu cho 1 đoàn (3 nguồn persist trong DB).
 * @param tyGiaNdt tỷ giá NDT→VND fallback khi đoàn chưa chốt `tip_ty_gia`; default 800.
 */
export function computePhaiThu(
  doan: PhaiThuDoanInput | null | undefined,
  tyGiaNdt: number = TY_GIA_NDT_DEFAULT,
): PhaiThuResult {
  const empty: PhaiThuResult = { items: [], totalVND: 0, hdvVND: 0, ctyVND: 0 };
  if (!doan) return empty;

  // Tỷ giá tip: ưu tiên snapshot trên đoàn (tip_ty_gia), fallback tham số
  // (mỗi đoàn độc lập — caller truyền hằng mặc định), cuối cùng default 800.
  const tyGiaTipBase =
    doan.tip_ty_gia && doan.tip_ty_gia > 0 ? doan.tip_ty_gia
    : tyGiaNdt > 0 ? tyGiaNdt
    : TY_GIA_NDT_DEFAULT;

  // ── 1. Tip ────────────────────────────────────────────────────────────────
  const soKhachTotal =
    (doan.so_khach_lon ?? 0) + (doan.so_khach_em1 ?? 0) +
    (doan.so_khach_em2 ?? 0) + (doan.so_khach_tl ?? 0) ||
    (doan.so_khach ?? 0);
  const soKhachTl = doan.so_khach_tl ?? 0;
  const autoTipSoKhach = defaultTipSoKhach(soKhachTotal, soKhachTl); // T/L không đóng tip
  const autoTipSoNgay = tipDaysInclusive(doan.ngay_di, doan.ngay_ve);
  const autoTipRate = defaultTipRate(soKhachTl);
  const tipSoKhach = doan.tip_so_khach_override ?? autoTipSoKhach;
  const tipSoNgay = doan.tip_so_ngay_override ?? autoTipSoNgay;
  const tipRate = doan.tip_rate ?? autoTipRate;
  // Loại tiền mặc định của tip theo loại tour (nội địa → VND); đoàn đã chọn thì giữ.
  const defaultTipCurrency = tourProfile(doan.loai_tour).defaultTipCurrency;
  const tipCurrency = normLoaiTien(doan.tip_currency, defaultTipCurrency);
  const tipTyGia = tipCurrency === "VND" ? 1 : tyGiaTipBase;
  const tipNguoiThu = normNguoiThu(doan.tip_nguoi_thu);
  const showTip = shouldCollectTip(doan.thu_tip, tipSoKhach, tipSoNgay);
  const tipNdt = doan.tip_lump_sum ?? calcTipNDT({ soKhach: tipSoKhach, soNgay: tipSoNgay, rate: tipRate });
  const tipVnd = showTip ? tipNdt * tipTyGia : 0;

  // ── 2. Thu tiền đầu khách (currency riêng, không nhân ngày) ────────────────
  const dkRate = doan.dau_khach_rate ?? DAU_KHACH_DEFAULT_RATE;
  const dkSoKhach = doan.dau_khach_so_khach_override ?? 0;
  const dkTongGoc = dkSoKhach * dkRate;
  const dkCurrency = normLoaiTien(doan.dau_khach_currency, "VND");
  const dkTyGia = dkCurrency === "VND"
    ? 1
    : (doan.dau_khach_ty_gia && doan.dau_khach_ty_gia > 0 ? doan.dau_khach_ty_gia : tyGiaTipBase);
  const dkVnd = dkTongGoc * dkTyGia;

  // ── 3. Thu tiền quỹ VP (currency riêng, lump-sum) ──────────────────────────
  const vpAmount = doan.quy_vp_amount ?? QUY_VP_DEFAULT_AMOUNT;
  const vpCurrency = normLoaiTien(doan.quy_vp_currency, "VND");
  const vpTyGia = vpCurrency === "VND"
    ? 1
    : (doan.quy_vp_ty_gia && doan.quy_vp_ty_gia > 0 ? doan.quy_vp_ty_gia : tyGiaTipBase);
  const vpVnd = vpAmount * vpTyGia;

  const items: PhaiThuItem[] = [
    {
      key: "tip",
      label: "Tip",
      soKhach: tipSoKhach,
      soNgay: tipSoNgay,
      donGia: tipRate,
      donViGoc: tipCurrency,
      tongGoc: showTip ? tipNdt : 0,
      tyGia: tipTyGia,
      thanhTienVND: tipVnd,
      nguoiThu: tipNguoiThu,
      show: showTip,
    },
    {
      key: "dau_khach",
      label: "Thu tiền đầu khách",
      soKhach: dkSoKhach,
      soNgay: null,
      donGia: dkRate,
      donViGoc: dkCurrency,
      tongGoc: dkTongGoc,
      tyGia: dkTyGia,
      thanhTienVND: dkVnd,
      nguoiThu: normNguoiThu(doan.dau_khach_nguoi_thu),
      show: dkVnd > 0,
    },
    {
      key: "quy_vp",
      label: "Thu tiền quỹ VP",
      soKhach: null,
      soNgay: null,
      donGia: vpAmount,
      donViGoc: vpCurrency,
      tongGoc: vpAmount,
      tyGia: vpTyGia,
      thanhTienVND: vpVnd,
      nguoiThu: normNguoiThu(doan.quy_vp_nguoi_thu),
      show: vpVnd > 0,
    },
  ];

  // ── 4. Extras (thu thêm tay) ──────────────────────────────────────────────
  for (const ex of parsePhaiThuExtras(doan.phai_thu_extras)) {
    const thanhTienVND = ex.soTien * ex.tyGia;
    items.push({
      key: "extra",
      label: ex.moTa || "Khoản thu khác",
      soKhach: null,
      soNgay: null,
      donGia: ex.soTien,
      donViGoc: ex.loaiTien,
      tongGoc: ex.soTien,
      tyGia: ex.tyGia,
      thanhTienVND,
      nguoiThu: ex.nguoiThu,
      show: ex.soTien > 0 && ex.tyGia > 0,
    });
  }

  let totalVND = 0, hdvVND = 0, ctyVND = 0;
  for (const it of items) {
    if (!it.show) continue;
    totalVND += it.thanhTienVND;
    if (it.nguoiThu === "hdv") hdvVND += it.thanhTienVND;
    else ctyVND += it.thanhTienVND;
  }

  return { items, totalVND, hdvVND, ctyVND };
}
