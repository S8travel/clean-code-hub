/**
 * Logic thuần quyết định "đoàn còn vướng gì nên chưa hủy/xóa được".
 *
 * Tách khỏi `Index.tsx` để (a) test được không cần render, (b) màn checklist và
 * toast xóa dùng CHUNG một nguồn sự thật — trước đây mỗi chỗ tự ghép chuỗi.
 *
 * Không import supabase: caller truyền vào các dòng đã fetch.
 */

/** Tab của DoanDetail mà một vướng mắc dẫn tới. Whitelist cho deep-link `?tab=`. */
export type DoanTab = "booking-ks" | "menu" | "booking-dv" | "chi-phi";

export const DOAN_TAB_HOP_LE: readonly DoanTab[] = ["booking-ks", "menu", "booking-dv", "chi-phi"];

/** Chỉ nhận tab nằm trong whitelist — chặn `?tab=<rác>` làm Tabs rỗng ruột. */
export function parseDoanTab(raw: string | null | undefined): DoanTab | null {
  return raw != null && (DOAN_TAB_HOP_LE as readonly string[]).includes(raw) ? (raw as DoanTab) : null;
}

export type BlockerKind = "ks" | "nh" | "tau" | "dv" | "dntt" | "dntt_dinh_ky";

/** Trang Thanh toán định kỳ — ĐNTT gộp không nằm trong tab nào của đoàn. */
export const ROUTE_DINH_KY = "/thanh-toan-dinh-ky";

export interface CancelBlocker {
  kind: BlockerKind;
  count: number;
  /** Tab của DoanDetail cần mở; null khi đích nằm ngoài trang đoàn. */
  tab: DoanTab | null;
  /** Đường dẫn tuyệt đối khi đích không phải tab của đoàn. */
  route?: string;
}

export const BLOCKER_TAB: Record<BlockerKind, DoanTab | null> = {
  ks: "booking-ks",
  nh: "menu",
  tau: "menu",
  dv: "booking-dv",
  dntt: "chi-phi",
  // ĐNTT định kỳ có doan_id = NULL → không thuộc tab nào của đoàn.
  dntt_dinh_ky: null,
};

export interface KsStatusRow {
  ks_dat_truoc_status: string | null;
  ks_final_status: string | null;
}

export interface NhStatusRow {
  booking_status: string | null;
  dat_truoc_status: string | null;
  final_status: string | null;
  nha_hang: { loai: string | null } | { loai: string | null }[] | null;
}

const KS_CANCEL_STATES = ["cho_ks_xac_nhan_huy", "ks_xac_nhan_huy"];
const TAU_CANCEL_STATES = ["cho_xac_nhan_huy", "xac_nhan_huy"];

// KS: chỉ chặn nếu booking ĐÃ GỬI (status != chua_gui) và chưa hủy.
//   - `chua_gui` = chưa gửi mail → không có cam kết bên ngoài → cho hủy.
//   - Final là phase quyết định: Final đã/đang hủy → cả booking coi như đã hủy,
//     bất kể ks_dat_truoc_status (đặt trước có thể còn ks_xac_nhan trước khi
//     user chuyển sang Final rồi hủy). Đồng bộ use-dieu-tour.checkKhachSanDeletable.
export function isKsCancelled(r: KsStatusRow): boolean {
  if (r.ks_final_status) return KS_CANCEL_STATES.includes(r.ks_final_status);
  return r.ks_dat_truoc_status != null && KS_CANCEL_STATES.includes(r.ks_dat_truoc_status);
}

export function isKsSent(r: KsStatusRow): boolean {
  return Boolean(
    (r.ks_dat_truoc_status && r.ks_dat_truoc_status !== "chua_gui") ||
      (r.ks_final_status && r.ks_final_status !== "chua_gui"),
  );
}

function nhLoai(r: NhStatusRow): string | null {
  return (Array.isArray(r.nha_hang) ? r.nha_hang[0]?.loai : r.nha_hang?.loai) ?? null;
}

/** Du thuyền dùng chung bảng doan_booking_nh nhưng đặt/hủy 2 pha như KS. */
export function isTau(r: NhStatusRow): boolean {
  const loai = nhLoai(r);
  return loai === "tau_ngay" || loai === "tau_dem";
}

export function isTauCancelled(r: NhStatusRow): boolean {
  if (r.final_status) return TAU_CANCEL_STATES.includes(r.final_status);
  return r.dat_truoc_status != null && TAU_CANCEL_STATES.includes(r.dat_truoc_status);
}

export function isTauSent(r: NhStatusRow): boolean {
  return (
    (r.dat_truoc_status != null && r.dat_truoc_status !== "chua_gui") ||
    (r.final_status != null && r.final_status !== "chua_gui")
  );
}

export interface CancelCheckInput {
  ks: KsStatusRow[];
  nh: NhStatusRow[];
  /** doan_booking_dv đã lọc sẵn booking_status ∈ (cho_xac_nhan, da_xac_nhan). */
  dvActiveCount: number;
  /** ĐNTT của CHÍNH đoàn (doan_id = doanId), trang_thai_duyet ∉ (tu_choi, da_huy). */
  dnttActiveCount: number;
  /**
   * ĐNTT còn sống KHÔNG thuộc đoàn này nhưng đã phân bổ vào chi phí của nó —
   * thực tế là ĐNTT định kỳ (`doan_id = NULL`, gộp nhiều đoàn theo NCC).
   *
   * Truy vấn theo `de_nghi_thanh_toan.doan_id = doanId` MÙ hoàn toàn với chúng.
   * Đây là đường tiền có thật và không nhỏ: nhiều đoàn đang chạy có chi phí đã cam
   * kết qua ĐNTT định kỳ — hủy đoàn mà không ai được báo là tiền đã hứa với NCC.
   */
  dnttDinhKyCount: number;
}

/**
 * Trả về DANH SÁCH vướng mắc (rỗng = hủy/xóa được). Thứ tự cố định theo trình tự
 * nghiệp vụ OP phải dọn: booking bên ngoài trước, tiền sau cùng.
 */
export function buildCancelBlockers(input: CancelCheckInput): CancelBlocker[] {
  const out: CancelBlocker[] = [];

  const activeKS = input.ks.filter((r) => !isKsCancelled(r) && isKsSent(r)).length;
  if (activeKS > 0) out.push({ kind: "ks", count: activeKS, tab: BLOCKER_TAB.ks });

  // Nhà hàng thường dùng booking_status; du thuyền hủy qua final_status nên
  // booking_status có thể vẫn 'da_gui' → KHÔNG được dùng booking_status cho tàu.
  const activeNH = input.nh.filter(
    (r) => !isTau(r) && (r.booking_status === "da_gui" || r.booking_status === "nh_xac_nhan"),
  ).length;
  if (activeNH > 0) out.push({ kind: "nh", count: activeNH, tab: BLOCKER_TAB.nh });

  const activeTau = input.nh.filter((r) => isTau(r) && !isTauCancelled(r) && isTauSent(r)).length;
  if (activeTau > 0) out.push({ kind: "tau", count: activeTau, tab: BLOCKER_TAB.tau });

  if (input.dvActiveCount > 0) out.push({ kind: "dv", count: input.dvActiveCount, tab: BLOCKER_TAB.dv });
  if (input.dnttActiveCount > 0) out.push({ kind: "dntt", count: input.dnttActiveCount, tab: BLOCKER_TAB.dntt });
  if (input.dnttDinhKyCount > 0) {
    out.push({ kind: "dntt_dinh_ky", count: input.dnttDinhKyCount, tab: null, route: ROUTE_DINH_KY });
  }

  return out;
}
