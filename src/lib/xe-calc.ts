// Tính tiền chi phí xe có VAT.
//
// Pattern (giống Visa với don_gia_raw): OP nhập đơn giá CHƯA VAT (don_gia_raw) + % VAT.
// don_gia lưu DB = giá ĐÃ gồm VAT (làm tròn / đơn vị) → thanh_tien (generated =
// don_gia*so_luong) tự gồm VAT → dashboard/Sheet (SUM thanh_tien) khớp với tổng
// trong tab (SUM tien_cong_ty). don_gia_raw giữ giá gốc cho ô nhập UI.

/** % VAT mặc định cho dòng xe mới (dòng cũ giữ 0 = không đổi tiền). */
export const XE_VAT_DEFAULT = 8;

/** Đơn giá đã gồm VAT cho 1 đơn vị (làm tròn về số nguyên đồng). */
export function applyVat(donGiaRaw: number, vatPct: number): number {
  const raw = Math.max(0, Number(donGiaRaw) || 0);
  const vat = Math.max(0, Number(vatPct) || 0);
  return Math.round(raw * (1 + vat / 100));
}

/** Thành tiền = đơn giá (đã VAT) × số lượng. */
export function calcXeThanhTien(soLuong: number, donGiaRaw: number, vatPct: number): number {
  const sl = Math.max(0, Number(soLuong) || 0);
  return applyVat(donGiaRaw, vatPct) * sl;
}

/** Loại xe master (xe / xe2) — phần field cần để resolve NCC + TK ngân hàng. */
export interface XeMasterLike {
  /** id của nha_xe_loai_xe (= doan.xe_id / xe_id_2). */
  id?: number | null;
  nha_xe?: { nha_cung_cap_id?: number | null; tai_khoan_thanh_toan?: string | null } | null;
}

/**
 * NCC hiệu lực của 1 dòng chi phí xe khi IN ĐNTT / gộp theo nhà cung cấp.
 *
 * Dòng chi phí tạo TRƯỚC khi nhà xe được gắn NCC sẽ snapshot `nha_cung_cap_id = null`
 * (gắn NCC vào nhà xe master KHÔNG sync ngược dòng cũ) → rơi vào nhóm "không NCC",
 * tờ in mất tên NCC + STK. Fallback về NCC của nhà xe master (khớp theo `xe_id`)
 * để vẫn gộp đúng + lấy STK. Ưu tiên `nha_cung_cap_id` của dòng nếu đã có (snapshot
 * có chủ đích vẫn thắng).
 */
export function resolveXeNccId(
  row: { nha_cung_cap_id?: number | null; xe_id?: number | null },
  masters: ReadonlyArray<XeMasterLike | null | undefined>,
): number | null {
  if (row.nha_cung_cap_id != null) return row.nha_cung_cap_id;
  if (row.xe_id == null) return null;
  const m = masters.find((x) => x != null && x.id != null && x.id === row.xe_id);
  return m?.nha_xe?.nha_cung_cap_id ?? null;
}

/**
 * TK ngân hàng (`tai_khoan_thanh_toan`) của nhà xe cho 1 dòng chi phí xe khi IN ĐNTT.
 *
 * Nhà xe có thể ĐÃ điền TK NHƯNG KHÔNG gắn NCC (nhà xe lẻ chỉ có tài khoản) → tờ in
 * vốn map STK THEO NCC (`xeTkttByNcc`) sẽ mất STK. Resolve TRỰC TIẾP từ nhà xe master
 * (khớp theo `xe_id`), độc lập NCC. Trả `null` nếu không khớp master / TK rỗng.
 */
export function resolveXeTaiKhoan(
  row: { xe_id?: number | null },
  masters: ReadonlyArray<XeMasterLike | null | undefined>,
): string | null {
  if (row.xe_id == null) return null;
  const m = masters.find((x) => x != null && x.id != null && x.id === row.xe_id);
  const tk = m?.nha_xe?.tai_khoan_thanh_toan?.trim();
  return tk || null;
}
