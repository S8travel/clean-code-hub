// Pure helpers cho tính năng "Dùng voucher" trên Chi phí (NH + DV — Phase 2).
// KHÔNG import React/DB/UI → test độc lập.
//
// Voucher GIÁ-BIẾN-THIÊN: 1 voucher đổi 1 suất chính (bữa ăn / dịch vụ), giá trị
// ghi nhận = giá trị công ty của dòng lúc dùng. Khi áp: chi phí về tien_cong_ty=0
// (công ty không trả tiền vì đã đổi voucher) nhưng vẫn giữ gross hiển thị.

import { applyChietKhau } from "./chi-phi-calc";

export interface RedemptionLike {
  id: number;
  voucher_id: number;
  chi_phi_id: number | null;
  gia_tri: number;
  /** Số vé voucher phủ (số khách miễn / trả-trước). Có thể < số khách → phủ MỘT PHẦN. */
  so_luong?: number;
  dntt_id?: number | null;
  voucher?: { ten?: string | null; loai?: string | null } | null;
}

export interface CoveredInfo {
  redemptionId: number;
  voucherId: number;
  giaTri: number;
  /** Số vé voucher phủ (so_luong redemption). Phủ một phần khi < số khách của dòng. */
  soVe: number;
  voucherTen: string;
  /** 'mua' = giữ giá trị (trả bằng voucher, có ĐNTT) | 'tang' = miễn phí (chính = 0). */
  voucherLoai: "mua" | "tang";
  /** ĐNTT voucher cũ (legacy) — không còn tự tạo; giữ field để gỡ liên kết cũ. */
  dnttId: number | null;
}

/**
 * Map chi_phi_id → thông tin voucher đã phủ. 1 chi phí chỉ phủ tối đa 1 voucher;
 * nếu DB có nhiều bản ghi cùng chi_phi_id (bất thường), bản ghi sau ghi đè —
 * UI chặn phủ 2 lần nên thực tế chỉ có 1. Bỏ qua bản ghi chi_phi_id = null
 * (chi phí gốc đã bị xóa → FK SET NULL, không còn gắn dòng nào).
 */
export function buildRedemptionMap(
  redemptions: RedemptionLike[],
): Record<number, CoveredInfo> {
  const m: Record<number, CoveredInfo> = {};
  for (const r of redemptions) {
    if (r.chi_phi_id == null) continue;
    m[r.chi_phi_id] = {
      redemptionId: r.id,
      voucherId: r.voucher_id,
      giaTri: r.gia_tri,
      soVe: r.so_luong ?? 0,
      voucherTen: r.voucher?.ten ?? "",
      voucherLoai: r.voucher?.loai === "tang" ? "tang" : "mua",
      dnttId: r.dntt_id ?? null,
    };
  }
  return m;
}

/**
 * Điều kiện được phép đổi voucher cho 1 suất chính (Phase 2):
 *  - người trả = công ty (HDV trả tiền mặt trên đường, không qua flow công ty)
 *  - suất CHƯA có ĐNTT đang hiệu lực (tránh đụng phần đã/đang thanh toán)
 *  - dòng chi phí đã tồn tại trong DB (có id để gắn voucher_su_dung)
 */
export function canApplyVoucher(params: {
  nguoiTt: "cong_ty" | "hdv";
  activeDnttCount: number;
  hasChiPhiId: boolean;
}): boolean {
  return (
    params.nguoiTt === "cong_ty" &&
    params.activeDnttCount === 0 &&
    params.hasChiPhiId
  );
}

/**
 * Chia giá trị 1 suất chính khi voucher phủ `soVe` vé (có thể < số khách → phủ MỘT PHẦN).
 *
 * - `fullValue`   = giá trị công ty cả dòng (đã FOC + CK).
 * - `remainderNet`= giá trị phần KHÔNG được voucher phủ = (số khách − vé) × đơn giá, đã CK.
 *                   Tính TRỰC TIẾP (không lấy fullValue − coverValue) để khi vé = số khách
 *                   ra ĐÚNG 0, và để khớp BIT-FOR-BIT với số ĐNTT (caller truyền số ghế
 *                   còn lại vào calcNHDnttAmount → mainNet = applyChietKhau(ghế còn × đơn giá)).
 * - `coverValue`  = phần voucher phủ = fullValue − remainderNet (bù trừ → coverValue +
 *                   remainderNet === fullValue, không lệch do làm tròn 2 lần).
 * - `tienCongTy`  = số công ty phải trả lưu vào doan_chi_phi:
 *                     TẶNG → remainderNet (vé tặng miễn phí, chỉ trả phần còn lại)
 *                     MUA  → fullValue (giữ nguyên — voucher chỉ là cách thanh toán, có ĐNTT đủ)
 *
 * Vé bị kẹp [0, số khách]. veApplied = vé thực dùng (sau kẹp).
 */
export function splitVoucherCoverage(params: {
  soKhachThucTe: number;
  donGia: number;
  ckPct: number | null;
  soVe: number;
  loai: "mua" | "tang";
}): {
  fullValue: number;
  coverValue: number;
  remainderNet: number;
  tienCongTy: number;
  veApplied: number;
} {
  const ve = Math.max(0, Math.min(Math.round(params.soVe), params.soKhachThucTe));
  const fullValue = applyChietKhau(params.soKhachThucTe * params.donGia, params.ckPct);
  const remainderNet = applyChietKhau((params.soKhachThucTe - ve) * params.donGia, params.ckPct);
  const coverValue = Math.max(0, fullValue - remainderNet);
  const tienCongTy = params.loai === "tang" ? remainderNet : fullValue;
  return { fullValue, coverValue, remainderNet, tienCongTy, veApplied: ve };
}

/**
 * Số tiền voucher trừ khỏi "Số tiền còn thanh toán" khi IN ĐNTT nhà hàng/dịch vụ.
 *
 * - Voucher 'tang': suất chính bị LOẠI khỏi bản in (không in dòng chính) → KHÔNG
 *   trừ thêm ở đây (trả 0).
 * - Voucher 'mua': suất chính trả bằng voucher → trừ phần đó khỏi cash phải trả.
 *   NGUỒN CHUẨN = `redeemGiaTri` (giá trị ghi nhận lúc đổi voucher, lưu ở
 *   voucher_su_dung). KHÔNG chỉ dựa payment method='voucher' vì cache
 *   `payments-by-chi-phi` hay STALE lúc bấm In (app tắt refetchOnWindowFocus),
 *   hoặc payment 'voucher' chưa kịp ghi → bản in QUÊN trừ voucher, in đủ tiền.
 *   Lấy `max()` với payment để robust cả 2 chiều (vẫn đúng nếu payment > giaTri).
 */
export function resolveVoucherPrintAmount(params: {
  voucherLoai?: "mua" | "tang" | null;
  /** giá trị suất chính ghi nhận lúc đổi voucher 'mua' (voucher_su_dung.gia_tri). */
  redeemGiaTri?: number | null;
  /** tổng payment method='voucher' của ĐNTT đang in (có thể 0 nếu cache stale). */
  paymentVoucherAmount: number;
}): number {
  const redeem = params.voucherLoai === "mua" ? Math.max(0, params.redeemGiaTri ?? 0) : 0;
  return Math.max(params.paymentVoucherAmount, redeem);
}

/**
 * Tổng giá trị các dòng phủ voucher loại 'mua' trong 1 nhóm bữa (lọc theo chi_phi_id).
 * Dùng khi tạo ĐNTT BỔ SUNG cho phát sinh: (1) ghi payment method='voucher' = `total`
 * để phần vé "mua" được đánh dấu trả-bằng-voucher (không đòi cash); (2) `perChiPhi` để
 * tách allocation phần voucher về ĐÚNG dòng phủ → recalc quy `so_tien_da_dntt`/`so_tien_da_tt`
 * về dòng đó (chặn áp voucher lần 2 + gỡ voucher dò được ĐNTT qua allocation).
 * Voucher 'tang' KHÔNG tính (suất 0đ, đã loại khỏi ĐNTT).
 */
export function sumGroupVoucherMua(
  chiPhiIds: number[],
  redemptionMap: Record<number, CoveredInfo>,
): { total: number; perChiPhi: { chiPhiId: number; giaTri: number }[] } {
  const perChiPhi: { chiPhiId: number; giaTri: number }[] = [];
  let total = 0;
  for (const id of chiPhiIds) {
    const r = redemptionMap[id];
    if (r?.voucherLoai === "mua" && r.giaTri > 0) {
      perChiPhi.push({ chiPhiId: id, giaTri: r.giaTri });
      total += r.giaTri;
    }
  }
  return { total, perChiPhi };
}

/**
 * Tính delta khi SỬA số vé voucher của 1 dòng (tăng/giảm) TẠI CHỖ — KHÔNG gỡ rồi
 * áp lại. Gọi splitVoucherCoverage 2 lần (vé cũ / vé mới) cùng `loai` để mọi con số
 * bù trừ bit-perfect với lúc áp ban đầu. Thuần (không DB/React) → test độc lập.
 *
 * - `veClamped` = vé mới sau khi kẹp vào [0, min(soKhachThucTe, veCu + tonKhoConLai)].
 *   Cộng `veCu` vào trần tồn kho vì vé cũ đang CHIẾM kho của chính dòng này — khi sửa
 *   nó được "trả lại" trước rồi mới trừ vé mới.
 * - `route`:
 *     'noop'   = vé không đổi (sau kẹp) → caller bỏ qua.
 *     'remove' = vé mới ≤ 0 → caller gọi gỡ voucher (CHECK so_luong>0 chặn redemption=0).
 *     'edit'   = cập nhật tại chỗ.
 * - MUA: tien_cong_ty GIỮ NGUYÊN fullValue (voucher chỉ là cách trả) → deltaTienCongTy=0;
 *   chỉ đổi coverValue (voucher_su_dung.gia_tri) + payment 'voucher'.
 * - TẶNG: tien_cong_ty = remainderNet đổi theo vé → deltaTienCongTy = −deltaCover;
 *   không có payment 'voucher' (paymentVoucher* = 0).
 */
export function calcVoucherEditDelta(params: {
  veCu: number;
  veMoi: number;
  soKhachThucTe: number;
  donGia: number;
  ckPct: number | null;
  loai: "mua" | "tang";
  tonKhoConLai: number;
}): {
  route: "noop" | "remove" | "edit";
  veClamped: number;
  clamped: boolean;
  coverCu: number;
  coverMoi: number;
  deltaCover: number;
  tienCongTyCu: number;
  tienCongTyMoi: number;
  deltaTienCongTy: number;
  deltaVe: number;
  paymentVoucherCu: number;
  paymentVoucherMoi: number;
} {
  const veCu = Math.max(0, Math.round(params.veCu));
  const ton = Math.max(0, params.tonKhoConLai);
  // Trần vé = min(số khách, tồn còn + vé cũ). Vé cũ cộng vào vì đang chiếm kho của chính nó.
  const maxVe = Math.max(0, Math.min(params.soKhachThucTe, veCu + ton));
  const veReq = Math.round(params.veMoi);
  const veClamped = Math.max(0, Math.min(veReq, maxVe));
  const clamped = veClamped !== veReq;

  const common = {
    soKhachThucTe: params.soKhachThucTe,
    donGia: params.donGia,
    ckPct: params.ckPct,
    loai: params.loai,
  };
  const splitCu = splitVoucherCoverage({ ...common, soVe: veCu });
  const splitMoi = splitVoucherCoverage({ ...common, soVe: veClamped });

  const coverCu = splitCu.coverValue;
  const coverMoi = splitMoi.coverValue;
  const tienCongTyCu = splitCu.tienCongTy;
  const tienCongTyMoi = splitMoi.tienCongTy;
  const paymentVoucherCu = params.loai === "mua" ? coverCu : 0;
  const paymentVoucherMoi = params.loai === "mua" ? coverMoi : 0;

  const route: "noop" | "remove" | "edit" =
    veClamped === veCu ? "noop" : veClamped <= 0 ? "remove" : "edit";

  return {
    route,
    veClamped,
    clamped,
    coverCu,
    coverMoi,
    deltaCover: coverMoi - coverCu,
    tienCongTyCu,
    tienCongTyMoi,
    deltaTienCongTy: tienCongTyMoi - tienCongTyCu,
    deltaVe: veClamped - veCu,
    paymentVoucherCu,
    paymentVoucherMoi,
  };
}

/**
 * Tính lại phủ voucher khi SỬA SỐ KHÁCH của 1 suất chính ĐÃ phủ voucher.
 *
 * Số khách đổi → vé voucher KẸP ≤ số khách mới (không phủ nhiều hơn số khách hiện
 * có). Giảm khách dưới số vé → vé tụt theo; tăng khách → vé GIỮ NGUYÊN (khách thêm
 * KHÔNG tự phủ voucher — muốn phủ thêm thì sửa vé ở popover). Trả giá trị TUYỆT ĐỐI
 * mới (không phải delta). Thuần (không DB/React).
 *
 * - `veNew`      = min(veCu, soKhachThucTe) — vé sau kẹp.
 * - `coverValue` = giá trị phủ mới (ghi voucher_su_dung.gia_tri).
 * - `tienCongTy` = công ty trả mới: MUA → full (số khách × đơn giá, sau CK);
 *   TẶNG → remainderNet (phần ghế không phủ).
 */
export function calcCoveredSoKhachEdit(params: {
  veCu: number;
  soKhachThucTe: number;
  donGia: number;
  ckPct: number | null;
  loai: "mua" | "tang";
}): { veNew: number; coverValue: number; tienCongTy: number } {
  const soKhach = Math.max(0, params.soKhachThucTe);
  const veNew = Math.max(0, Math.min(Math.round(params.veCu), soKhach));
  const split = splitVoucherCoverage({
    soKhachThucTe: soKhach,
    donGia: params.donGia,
    ckPct: params.ckPct,
    soVe: veNew,
    loai: params.loai,
  });
  return { veNew, coverValue: split.coverValue, tienCongTy: split.tienCongTy };
}

/**
 * Quyết định đồng bộ payment 'voucher' khi GIẢM/đổi giá trị phủ voucher 'mua'.
 *
 * Vấn đề: nếu ĐNTT ĐÃ trả đủ mà ta hạ payment voucher (coverMoi < coverCu) thì
 * SUM(payments) tụt < so_tien → ĐNTT về 'partial' → đẻ "Chờ UNC" ẢO (thực ra
 * giảm vé = vé TRẢ VỀ KHO, không phải công ty nợ thêm cash).
 *
 * Luật:
 * - GIẢM phủ + ĐNTT đã trả đủ (paidBefore ≥ so_tien) → GIỮ NGUYÊN payment voucher
 *   (`keepPaid`): ĐNTT đứng yên 'paid', không phantom. Phần giảm `overpaidFromKho`
 *   = vé trả về kho; phần CASH thừa (nếu có) để footer aggregate ghi công nợ
 *   (đã loại boat qua voucherKhoRefund trong calcAggregateDelta).
 * - Còn lại (chưa trả đủ HOẶC tăng phủ) → clamp payment ≤ phần ĐNTT chưa trả
 *   (logic cũ): phần chênh là cash thật.
 *
 * `overpaidFromKho` = coverCu − coverMoi khi keepPaid (chênh payment giữ-lại so với
 * giá trị phủ thực) → cũng chính là voucherKhoRefund mà UI cần loại khỏi lệch.
 */
export function calcMuaVoucherPaymentSync(params: {
  coverMoi: number;
  coverCu: number;
  dnttSoTien: number;
  otherPaidSum: number;
  ourVoucherPaidCu: number;
}): { newVoucherPay: number; keepPaid: boolean; overpaidFromKho: number; payClamped: boolean } {
  const reducing = params.coverMoi < params.coverCu;
  const paidBefore = params.otherPaidSum + params.ourVoucherPaidCu;
  if (reducing && paidBefore >= params.dnttSoTien) {
    return {
      newVoucherPay: params.ourVoucherPaidCu,
      keepPaid: true,
      overpaidFromKho: params.coverCu - params.coverMoi,
      payClamped: false,
    };
  }
  const capacity = Math.max(0, params.dnttSoTien - params.otherPaidSum);
  const newVoucherPay = Math.max(0, Math.min(params.coverMoi, capacity));
  return {
    newVoucherPay,
    keepPaid: false,
    overpaidFromKho: 0,
    payClamped: newVoucherPay < params.coverMoi,
  };
}

/**
 * Allocation cho ĐNTT bổ sung (footer aggregate) khi nhóm có dòng phủ voucher 'mua'.
 * Allocate giá trị MỖI dòng phát sinh chưa-chốt về ĐÚNG chi_phi của nó (cả voucher
 * lẫn cash) → recalc quy `so_tien_da_dntt`/`so_tien_da_tt` về từng dòng (đúng trạng
 * thái per-dòng + delete-guard bảo vệ). Phần dư (vd điều chỉnh dòng chính) → dòng chính.
 * Bất biến: Σ so_tien === absDelta. `lines` rỗng → [{main, absDelta}] (hành vi footer cũ).
 * Clamp khi Σ giá-trị dòng > absDelta (giá đổi sau redeem) → cắt, không vượt tổng.
 */
export function buildAggAllocations(
  absDelta: number,
  mainChiPhiId: number,
  lines: { chiPhiId: number; soTien: number }[],
): { chi_phi_id: number; so_tien: number }[] {
  const allocs: { chi_phi_id: number; so_tien: number }[] = [];
  let remaining = absDelta;
  for (const e of lines) {
    if (remaining <= 0) break;
    const amt = Math.min(e.soTien, remaining);
    if (amt <= 0) continue;
    allocs.push({ chi_phi_id: e.chiPhiId, so_tien: amt });
    remaining -= amt;
  }
  if (remaining > 0) allocs.push({ chi_phi_id: mainChiPhiId, so_tien: remaining });
  return allocs;
}
