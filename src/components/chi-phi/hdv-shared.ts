// Shared types + constants cho HDV section — tách từ ChiPhiHDVSection.tsx để
// giảm kích thước file khổng lồ. Không chứa JSX / logic.

// Subset thông tin đoàn mà các sub-component HDV cần (số khách + ngày + tên + tip overrides).
export interface HDVDoanInfo {
  ten_doan?: string | null;
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
