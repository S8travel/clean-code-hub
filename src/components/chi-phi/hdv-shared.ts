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
