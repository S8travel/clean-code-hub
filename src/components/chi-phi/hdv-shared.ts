// Shared types + constants cho HDV section — tách từ ChiPhiHDVSection.tsx để
// giảm kích thước file khổng lồ. Không chứa JSX / logic.

// Subset thông tin đoàn mà các sub-component HDV cần (số khách + ngày + tên + tip overrides).
export interface HDVDoanInfo {
  ten_doan?: string | null;
  // Loại tour — tip mặc định VND cho nội địa (xem tourProfile / computePhaiThu).
  loai_tour?: string | null;
  so_khach?: number | null;
  so_khach_lon?: number | null;
  so_khach_em1?: number | null;
  so_khach_em2?: number | null;
  so_khach_tl?: number | null;
  ngay_di?: string | null;
  ngay_ve?: string | null;
  thu_tip?: boolean | null;
  tip_rate?: number | null;
  tip_so_khach_override?: number | null;
  tip_so_ngay_override?: number | null;
  tip_lump_sum?: number | null;
  tip_currency?: string | null;
  tip_nguoi_thu?: string | null;
  tip_ty_gia?: number | null;
  // Phải thu — Thu tiền đầu khách + Quỹ VP (merge #84)
  dau_khach_rate?: number | null;
  dau_khach_currency?: string | null;
  dau_khach_ty_gia?: number | null;
  dau_khach_nguoi_thu?: string | null;
  dau_khach_so_khach_override?: number | null;
  quy_vp_amount?: number | null;
  quy_vp_currency?: string | null;
  quy_vp_ty_gia?: number | null;
  quy_vp_nguoi_thu?: string | null;
  // Extras (thu thêm tay) — jsonb [{moTa,soTien,loaiTien,tyGia,nguoiThu}]
  phai_thu_extras?: unknown;
}

export const STATUS_LABEL: Record<string, { textKey: string; cls: string }> = {
  cho_duyet: { textKey: "Chờ duyệt ĐNTT", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { textKey: "Đã duyệt ĐNTT",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { textKey: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

// Shape tối thiểu — chỉ field row đụng tới (tránh import deep types).
export interface DnttLite {
  id: number;
  ref_loai: string | null;
  ref_id: number | null;
  so_tien: number;
  la_coc: boolean | null;
  trang_thai_duyet: string;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  thanh_toan_luc: string | null;
}
export interface CongNoLite {
  dntt_goc_id: number | null;
  trang_thai: string;
  so_tien_goc: number;
  so_tien_con_lai: number;
}

// ── Quà tặng khách (auto từ Điều tour) ──────────────────────────────────────
// Tick quà ở Điều tour (doan.tang_pham) → tự thêm 1 row hdv_ho_tro
// "{Quà} tặng khách" (HDV mang theo, nguồn mặc định HDV). Bỏ tick → xóa row.
// Đơn giá mặc định / khách khi tick quà (OP sửa lại được). Quà không có trong
// map → 0 → OP nhập tay. Túi xách / Mũ lưỡi trai / Quạt: chưa có giá → 0.
export const GIFT_MO_TA_SUFFIX = "tặng khách";
export const GIFT_DON_GIA: Record<string, number> = {
  Sim: 75_000,
  Nón: 20_000,
  Ảnh: 10_000,
  Dầu: 8_000,
  Nước: 2_500,
};
export const giftMoTa = (gift: string): string => `${gift} ${GIFT_MO_TA_SUFFIX}`;
export const isGiftRow = (moTa: string | null | undefined): boolean =>
  !!moTa && moTa.trim().endsWith(GIFT_MO_TA_SUFFIX);

// ── Tip lái xe (luôn có sẵn mỗi đoàn) ────────────────────────────────────────
// Auto-ensure 1 row hdv_ho_tro "Tip lái xe" cho mọi đoàn. Hover → bảng giá
// tham khảo theo số chỗ xe (16C/35C/45C) × miền (MT/PQ/MN).
export const TIP_LAI_XE_MO_TA = "Tip lái xe";
export const isTipLaiXeRow = (moTa: string | null | undefined): boolean =>
  (moTa ?? "").trim() === TIP_LAI_XE_MO_TA;
export const TIP_LAI_XE_REF: { seats: string; mt: number; pq: number; mn: number }[] = [
  { seats: "16C", mt: 150_000, pq: 200_000, mn: 200_000 },
  { seats: "35C", mt: 200_000, pq: 250_000, mn: 250_000 },
  { seats: "45C", mt: 250_000, pq: 300_000, mn: 300_000 },
];
// Chú thích thêm (quy đổi loại xe + tuyến đặc biệt) — hiển thị dưới bảng giá.
export const TIP_LAI_XE_NOTES: string[] = [
  "Xe 7C = xe 16C · Xe 29C = xe 35C",
  "LMS 29S Long Hiền = 300K",
  "LMS 9S miền Nam = miền Trung = 200K",
];

// ── Khoản "Khác" mặc định mọi đoàn đang chạy ─────────────────────────────────
// 7 khoản công ty/HDV hay phát sinh. Trước đây OP gõ tay tự do ("CTP HDV MB",
// "ctp hdv", "tiền ngủ hdv"...) → cùng 1 loại chi phí ra chục cách viết → KHÔNG
// gộp báo cáo theo tháng được. Seed sẵn bằng TÊN CHUẨN (đơn giá 0, Nguồn HDV —
// OP nhập sau) để sau này gộp/tra cứu theo đúng mo_ta. ĐỪNG đổi chuỗi đã ship:
// đổi tên = mất liên kết với dữ liệu đã nhập.
export const DEFAULT_KHAC_MO_TAS: string[] = [
  "Nước Aqua",
  "Nước Pocari",
  "Tiền ngủ",
  "CTP HDV",
  "Tiền nước mùa hè",
  "Ăn nội bộ lái xe",
  "Bia, nước ngọt nhà hàng",
];

// Thứ tự hiển thị dòng "hệ thống": Tip lái xe trước, rồi 7 khoản mặc định.
// Phần còn lại (quà tặng + khoản OP tự thêm) giữ thứ tự created_at.
export const SYSTEM_KHAC_ORDER: string[] = [TIP_LAI_XE_MO_TA, ...DEFAULT_KHAC_MO_TAS];

// Ngày hôm nay theo LỊCH ĐỊA PHƯƠNG (yyyy-MM-dd). KHÔNG dùng toISOString(): nó trả
// ngày theo UTC nên từ 00:00–07:00 giờ VN sẽ lùi lại một ngày — đoàn về hôm qua vẫn
// bị coi là "chưa về" và bị chèn thêm dòng mặc định.
export function todayLocalISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Đoàn "đang chạy / chưa kết thúc" (ngày về ≥ hôm nay) → mới auto-thêm 7 khoản mặc
// định. Thiếu ngày về → coi như còn hiệu lực.
export function laDoanConHieuLuc(
  ngayVe: string | null | undefined,
  homNay: string = todayLocalISO(),
): boolean {
  if (!ngayVe) return true;
  return ngayVe >= homNay;
}

// Các mo_ta còn THIẾU cần auto-thêm cho 1 đoàn (so khớp sau khi trim, phân biệt
// hoa/thường — chủ ý: "ctp hdv" tự gõ KHÔNG khớp "CTP HDV" chuẩn nên vẫn seed
// dòng chuẩn cạnh nó để OP gộp). Tip lái xe luôn đảm bảo cho mọi đoàn; 7 khoản
// mặc định CHỈ thêm cho đoàn đang chạy/sắp đi (isActive=true) — tránh chèn dòng
// trống vào đoàn cũ đã kết thúc.
export function missingDefaultKhacMoTas(
  existingMoTas: (string | null | undefined)[],
  isActive: boolean,
): string[] {
  const have = new Set(existingMoTas.map((m) => (m ?? "").trim()));
  const targets = isActive ? SYSTEM_KHAC_ORDER : [TIP_LAI_XE_MO_TA];
  return targets.filter((m) => !have.has(m));
}

// Sắp xếp dòng "Khác": dòng hệ thống theo SYSTEM_KHAC_ORDER lên đầu (đúng thứ
// tự), còn lại giữ nguyên thứ tự đầu vào (Array.sort ổn định từ ES2019).
export function orderKhacItems<T extends { mo_ta: string | null | undefined }>(items: T[]): T[] {
  const rankOf = (m: string | null | undefined) => {
    const idx = SYSTEM_KHAC_ORDER.indexOf((m ?? "").trim());
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  return [...items].sort((a, b) => rankOf(a.mo_ta) - rankOf(b.mo_ta));
}

// Nguồn (người trả) mặc định cho 1 row "Khác": HDV ứng trước, công ty hoàn sau.
//   tien_hdv > 0 → HDV · tien_cong_ty > 0 → Công ty · cả 2 = 0 → HDV (mặc định).
// (Quà tặng khách + tip lái xe cũng mặc định HDV; OP đổi sang Công ty khi cần.)
export function resolveHoTroNguoiTt(
  item: { tien_cong_ty: number; tien_hdv: number },
): "cong_ty" | "hdv" {
  if (item.tien_hdv > 0) return "hdv";
  if (item.tien_cong_ty > 0) return "cong_ty";
  return "hdv";
}

export interface KhacModalItem {
  chiPhiId: number;
  thanhTien: number;
  moTa: string;
  nccId: number | null;
}
export type KhacModalTarget =
  | { type: "single"; item: KhacModalItem }
  | { type: "bulk"; items: KhacModalItem[]; thanhTien: number; defaultNccId: number | null };
export interface KhacCancelTarget { dnttId: number; isPaid: boolean }
