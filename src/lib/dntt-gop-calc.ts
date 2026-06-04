// Gộp ĐNTT dịch vụ theo nhà cung cấp (trong 1 đoàn).
// Nhiều dịch vụ cùng 1 NCC → 1 đề nghị thanh toán (1 de_nghi_thanh_toan + N
// dntt_allocations). Logic ở đây thuần (không UI / không DB) để test được.
//
// Quy tắc:
//  - Chỉ gộp khoản CÔNG TY trả (tien_hdv = 0). HDV trả cash, không qua ĐNTT.
//  - Phần tiền công ty 1 dòng = thanh_tien_thuc_te (nếu OP đã điều chỉnh) ?? tien_cong_ty.
//  - "Gộp phần còn lại": alloc mỗi dòng = phần CHƯA ĐNTT = company − so_tien_da_dntt (>0),
//    nên dòng đã cọc/đã ĐNTT một phần vẫn gộp được phần còn lại.
//  - Bỏ qua dòng thanh_toan_dinh_ky (đã có flow gộp định kỳ riêng) và dòng không có NCC.

export interface GopDvRow {
  id: number;
  mo_ta: string | null;
  nha_cung_cap_id: number | null;
  ngay_so: number | null;
  tien_cong_ty: number;
  tien_hdv: number;
  thanh_tien_thuc_te: number | null;
  so_tien_da_dntt: number;
  thanh_toan_dinh_ky: boolean;
}

export interface GopAllocItem {
  chi_phi_id: number;
  label: string;
  ngay_so: number | null;
  remaining: number;
}

export interface GopNccGroup {
  nccId: number;
  items: GopAllocItem[];
  total: number;
}

/** Phần tiền công ty của 1 dòng = thanh_tien_thuc_te (nếu có) ?? tien_cong_ty. */
export function companyAmount(row: Pick<GopDvRow, "thanh_tien_thuc_te" | "tien_cong_ty">): number {
  return row.thanh_tien_thuc_te ?? row.tien_cong_ty ?? 0;
}

/** Phần CHƯA ĐNTT của 1 dòng (không âm) = company − so_tien_da_dntt. */
export function remainingForGop(row: GopDvRow): number {
  return Math.max(0, companyAmount(row) - (row.so_tien_da_dntt ?? 0));
}

/** Dòng đủ điều kiện gộp: công ty trả, có NCC, không định kỳ, còn remaining > 0. */
export function isGopEligible(row: GopDvRow): boolean {
  return (
    row.nha_cung_cap_id != null &&
    !row.thanh_toan_dinh_ky &&
    (row.tien_hdv ?? 0) === 0 &&
    companyAmount(row) > 0 &&
    remainingForGop(row) > 0
  );
}

/** Bỏ prefix extras [dvps_<id>] để hiển thị tên dịch vụ gọn. */
export function gopLabel(moTa: string | null): string {
  return (moTa ?? "").replace(/^\[dvps_\d+\]\s*/, "").trim() || "Dịch vụ";
}

/**
 * Gom các dòng DV đủ điều kiện theo nha_cung_cap_id.
 * Chỉ trả nhóm có >= minRows dòng (mặc định 2 — gộp chỉ có nghĩa khi ≥2 dịch vụ).
 * Item trong nhóm sắp theo ngay_so tăng dần.
 */
export function groupGopByNcc(rows: GopDvRow[], minRows = 2): GopNccGroup[] {
  const map = new Map<number, GopAllocItem[]>();
  for (const r of rows) {
    if (!isGopEligible(r)) continue;
    const nccId = r.nha_cung_cap_id as number;
    const item: GopAllocItem = {
      chi_phi_id: r.id,
      label: gopLabel(r.mo_ta),
      ngay_so: r.ngay_so,
      remaining: remainingForGop(r),
    };
    if (!map.has(nccId)) map.set(nccId, []);
    map.get(nccId)!.push(item);
  }
  const groups: GopNccGroup[] = [];
  for (const [nccId, items] of map) {
    if (items.length < minRows) continue;
    items.sort((a, b) => (a.ngay_so ?? 0) - (b.ngay_so ?? 0));
    groups.push({ nccId, items, total: items.reduce((s, i) => s + i.remaining, 0) });
  }
  return groups;
}

/** Tổng remaining của các item được chọn (theo chi_phi_id). */
export function sumSelected(items: GopAllocItem[], selectedIds: ReadonlySet<number>): number {
  return items
    .filter((i) => selectedIds.has(i.chi_phi_id))
    .reduce((s, i) => s + i.remaining, 0);
}

// ── Cấn trừ công nợ khi tạo ĐNTT gộp ──────────────────────────────────────────
// Cùng NCC có thể đang giữ tiền (công nợ còn dư) → cho cấn trừ vào ĐNTT gộp.

/** 1 lựa chọn cấn trừ (cấu trúc khớp CanTruSelection ở UI, giữ lib thuần). */
export interface CanTruPick {
  congNoId: number;
  soTienConLai: number;
  soTienCanTru: number;
  tenDoan: string;
}

/** 1 dòng payload payment cấn trừ cho createCanTruPayments. */
export interface CanTruPaymentItem {
  congNoId: number;
  soTien: number;
  sourceTenDoan: string;
}

/**
 * Chuẩn hoá danh sách cấn trừ trước khi tạo payment:
 *  - bỏ dòng ≤ 0; clamp mỗi dòng ≤ số dư công nợ (soTienConLai);
 *  - clamp TỔNG ≤ maxAmount (= số tiền ĐNTT) — cắt greedy theo thứ tự, KHÔNG cấn quá tiền ĐNTT.
 * Trả payload sẵn cho createCanTruPayments (sourceTenDoan = đoàn nguồn công nợ).
 */
export function buildCanTruPaymentItems(
  selections: CanTruPick[],
  maxAmount: number,
): CanTruPaymentItem[] {
  const out: CanTruPaymentItem[] = [];
  let acc = 0;
  const cap = Math.max(0, maxAmount);
  for (const s of selections) {
    if (acc >= cap) break;
    const amt = Math.min(s.soTienCanTru, s.soTienConLai, cap - acc);
    if (amt <= 0) continue;
    out.push({ congNoId: s.congNoId, soTien: amt, sourceTenDoan: s.tenDoan });
    acc += amt;
  }
  return out;
}
