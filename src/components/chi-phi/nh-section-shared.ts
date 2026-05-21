// Helpers + types dùng chung cho tab Chi phí Nhà hàng.
// Tách verbatim từ ChiPhiNHSection để hook / row / modal / shell cùng dùng.

export const fmt = (n: number) => n.toLocaleString("vi-VN");

export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet:     { text: "Chờ duyệt",  cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:      { text: "Đã duyệt",   cls: "bg-teal-100 text-teal-700" },
  da_thanh_toan: { text: "Đã TT",      cls: "bg-emerald-100 text-emerald-700" },
  hoan_tien:     { text: "Hoàn tiền",  cls: "bg-blue-100 text-blue-700" },
  cong_no:       { text: "Công nợ",    cls: "bg-purple-100 text-purple-700" },
  tu_choi:       { text: "Từ chối",    cls: "bg-red-100 text-red-700" },
};

// Extra rows được nhận diện bằng prefix này trong cột mo_ta.
export const extraPrefix = (bua: "trua" | "toi") => `[${bua}] `;

// Parse "NH Name (trưa/tối)" → { name, bua }
export function parseNHMoTa(moTa: string | null): { name: string; bua: string; buaIcon: string } {
  if (!moTa) return { name: "—", bua: "—", buaIcon: "" };
  const m = moTa.match(/^(.+)\s+\((trưa|tối)\)$/);
  if (m) return { name: m[1], bua: m[2], buaIcon: m[2] === "trưa" ? "🌤" : "🌙" };
  return { name: moTa, bua: "—", buaIcon: "" };
}

export interface LocalNHRow {
  id?: number;
  nha_hang_id: number;
  doan_ngay_id: number;
  ngay_date: string;
  ngay_so: number;
  bua_an: "trua" | "toi";
  so_khach: number;
  don_gia: number;
  chiet_khau_phan_tram: number;
  nguoi_tt?: "cong_ty" | "hdv";
  foc_khach_snapshot?: number | null;
  foc_mien_snapshot?: number | null;
  chiet_khau_phan_tram_snapshot?: number | null;
  is_overridden?: boolean;
  trang_thai_thanh_toan?: string;
}

export interface LocalNHExtra {
  id?: number;
  mo_ta: string;
  so_luong: number;
  don_gia: number;
  nguoi_tt: "cong_ty" | "hdv";
}
