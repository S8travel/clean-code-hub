// Pure helpers cho tính năng "Dùng voucher" trên Chi phí (NH + DV — Phase 2).
// KHÔNG import React/DB/UI → test độc lập.
//
// Voucher GIÁ-BIẾN-THIÊN: 1 voucher đổi 1 suất chính (bữa ăn / dịch vụ), giá trị
// ghi nhận = giá trị công ty của dòng lúc dùng. Khi áp: chi phí về tien_cong_ty=0
// (công ty không trả tiền vì đã đổi voucher) nhưng vẫn giữ gross hiển thị.

export interface RedemptionLike {
  id: number;
  voucher_id: number;
  chi_phi_id: number | null;
  gia_tri: number;
  dntt_id?: number | null;
  voucher?: { ten?: string | null; loai?: string | null } | null;
}

export interface CoveredInfo {
  redemptionId: number;
  voucherId: number;
  giaTri: number;
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
