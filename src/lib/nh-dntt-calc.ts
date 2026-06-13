import { applyChietKhau } from "./chi-phi-calc";

// Số tiền ĐNTT của 1 bữa ăn nhà hàng = suất chính (sau FOC + chiết khấu) +
// các dòng phát sinh CÔNG TY (mỗi dòng áp CK RIÊNG — Mức A, làm tròn 1 lần/dòng).
// Extras HDV trả (nguoi_tt='hdv') bị loại (HDV trả tiền mặt, không qua ĐNTT).
//
// DÙNG CHUNG cho NHDnttModal (preview) + use-nh-section.handleDnttSubmit (ĐNTT
// thật) → 2 nơi luôn ra cùng con số. Trước đây preview cộng GROSS phát sinh, bỏ
// CK từng dòng → lệch (vd 11.980.000 thay vì 11.970.000).

export interface NHDnttExtraLite {
  so_luong: number;
  don_gia: number;
  /** CK% riêng của dòng phát sinh (0/null = không CK). */
  chiet_khau_phan_tram?: number | null;
  /** 'hdv' → loại khỏi ĐNTT công ty. */
  nguoi_tt?: string | null;
}

export interface NHDnttAmountInput {
  /** Tổng suất chính sau FOC, TRƯỚC chiết khấu (soKhachThucTe × đơn giá). */
  mainGrossAfterFoc: number;
  /** CK% suất chính (row override → master). */
  mainCkPct: number | null;
  /** Voucher TẶNG phủ suất chính → loại khỏi ĐNTT (chỉ còn phát sinh). */
  mainCovered?: boolean;
  extras: NHDnttExtraLite[];
}

export interface NHDnttAmountResult {
  /** Suất chính sau CK (0 nếu covered). */
  mainNet: number;
  /** Phát sinh công ty — gross (cho dòng hiển thị "Tổng bữa ăn"). */
  extrasGrossCompany: number;
  /** Phát sinh công ty — sau CK từng dòng. */
  extrasNetCompany: number;
  /** Gross công ty = suất chính (nếu không covered) + phát sinh gross. */
  grossCompany: number;
  /** Tổng chiết khấu (chính + phát sinh) = grossCompany − netCompany. */
  chietKhau: number;
  /** "Thực thanh toán" công ty = mainNet + extrasNetCompany. */
  netCompany: number;
}

export function calcNHDnttAmount(input: NHDnttAmountInput): NHDnttAmountResult {
  const mainGrossContribution = input.mainCovered ? 0 : input.mainGrossAfterFoc;
  const mainNet = input.mainCovered ? 0 : applyChietKhau(input.mainGrossAfterFoc, input.mainCkPct);
  const company = input.extras.filter((e) => e.nguoi_tt !== "hdv");
  const extrasGrossCompany = company.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
  const extrasNetCompany = company.reduce(
    (s, e) => s + applyChietKhau(e.so_luong * e.don_gia, e.chiet_khau_phan_tram ?? null),
    0,
  );
  const grossCompany = mainGrossContribution + extrasGrossCompany;
  const netCompany = mainNet + extrasNetCompany;
  return {
    mainNet,
    extrasGrossCompany,
    extrasNetCompany,
    grossCompany,
    chietKhau: grossCompany - netCompany,
    netCompany,
  };
}
