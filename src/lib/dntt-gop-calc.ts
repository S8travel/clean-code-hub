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
//  - Extras (mo_ta prefix [dvps_<mainId>]) GỘP VÀO item của main: tiền extra cộng vào
//    remaining, allocation vẫn trỏ 1 dòng main — khớp pattern ĐNTT per-row (DVRow truyền
//    totalTienCt = main + extras, alloc dồn vào main).

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
  /** Số dòng phụ thu (extras) đã gộp tiền vào item này. */
  extraCount: number;
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

/** id dòng main nếu là extra ([dvps_<mainId>] ...), null nếu là dòng main. */
export function extraParentId(moTa: string | null): number | null {
  const m = (moTa ?? "").match(/^\[dvps_(\d+)\]\s*/);
  return m ? Number(m[1]) : null;
}

/**
 * Gom các dòng DV đủ điều kiện theo nha_cung_cap_id.
 * `rows` nhận CẢ main lẫn extras — extra được cộng tiền vào item của main
 * (NCC + ngày lấy theo main; extra mồ côi / HDV trả / định kỳ thì bỏ qua).
 * Chỉ trả nhóm có >= minRows item (mặc định 2 — gộp chỉ có nghĩa khi ≥2 dịch vụ).
 * Item trong nhóm sắp theo ngay_so tăng dần.
 */
export function groupGopByNcc(rows: GopDvRow[], minRows = 2): GopNccGroup[] {
  const extrasByMain = new Map<number, GopDvRow[]>();
  const mains: GopDvRow[] = [];
  for (const r of rows) {
    const pid = extraParentId(r.mo_ta);
    if (pid != null) {
      if (!extrasByMain.has(pid)) extrasByMain.set(pid, []);
      extrasByMain.get(pid)!.push(r);
    } else {
      mains.push(r);
    }
  }

  const map = new Map<number, GopAllocItem[]>();
  for (const r of mains) {
    // Điều kiện theo dòng main: có NCC, công ty trả, không định kỳ.
    if (r.nha_cung_cap_id == null || r.thanh_toan_dinh_ky || (r.tien_hdv ?? 0) !== 0) continue;
    const allExtras = extrasByMain.get(r.id) ?? [];
    // Vế TIỀN PHẢI TRẢ: chỉ extras công ty đang trả, còn giá trị.
    const moneyExtras = allExtras.filter(
      (e) => (e.tien_hdv ?? 0) === 0 && !e.thanh_toan_dinh_ky && companyAmount(e) > 0,
    );
    // Remaining tính trên CẢ NHÓM (main + extras) vì per-row ĐNTT dồn alloc vào main
    // → so_tien_da_dntt của main có thể đã bao gồm tiền extras.
    const company = companyAmount(r) + moneyExtras.reduce((s, e) => s + companyAmount(e), 0);
    // Vế ĐÃ CAM KẾT: trừ theo TẤT CẢ extras không-định-kỳ — kể cả extra đã sửa về 0 /
    // chuyển HDV SAU khi nằm trong ĐNTT (commitment lịch sử vẫn còn, bỏ sót → remaining
    // PHỒNG → đề nghị thừa tiền). Extra định kỳ loại cả 2 vế (thuộc flow định kỳ riêng).
    const daDntt =
      (r.so_tien_da_dntt ?? 0) +
      allExtras
        .filter((e) => !e.thanh_toan_dinh_ky)
        .reduce((s, e) => s + (e.so_tien_da_dntt ?? 0), 0);
    const remaining = Math.max(0, company - daDntt);
    if (company <= 0 || remaining <= 0) continue;

    const nccId = r.nha_cung_cap_id;
    const item: GopAllocItem = {
      chi_phi_id: r.id,
      label: gopLabel(r.mo_ta),
      ngay_so: r.ngay_so,
      remaining,
      extraCount: moneyExtras.length,
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
