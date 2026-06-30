// Helpers + types dùng chung cho tab Chi phí Nhà hàng.
// Tách verbatim từ ChiPhiNHSection để hook / row / modal / shell cùng dùng.

export const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export const STATUS_LABEL: Record<string, { textKey: string; cls: string }> = {
  cho_duyet:     { textKey: "Chờ duyệt",  cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:      { textKey: "Đã duyệt",   cls: "bg-teal-100 text-teal-700" },
  da_thanh_toan: { textKey: "Đã TT",      cls: "bg-emerald-100 text-emerald-700" },
  hoan_tien:     { textKey: "Hoàn tiền",  cls: "bg-blue-100 text-blue-700" },
  cong_no:       { textKey: "Công nợ",    cls: "bg-purple-100 text-purple-700" },
  tu_choi:       { textKey: "Từ chối",    cls: "bg-red-100 text-red-700" },
};

// Extra rows được nhận diện bằng prefix này trong cột mo_ta.
export const extraPrefix = (bua: "trua" | "toi") => `[${bua}] `;

// 1 chi_phi nhà hàng là DÒNG PHÁT SINH (extra) khi mo_ta mang prefix [trua]/[toi].
// Dùng để phân biệt với suất chính (mo_ta = "NH (trưa)"). Khớp đúng output extraPrefix.
export const isNHExtra = (moTa: string | null | undefined): boolean =>
  !!moTa && (moTa.startsWith(extraPrefix("trua")) || moTa.startsWith(extraPrefix("toi")));

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
  /** CK% riêng của dòng phát sinh — áp per dòng (suất trẻ em = menu chính cần CK;
   *  HDV phát sinh để 0). Lưu vào doan_chi_phi.chiet_khau_phan_tram_snapshot. */
  chiet_khau_phan_tram: number;
  /** Trạng thái hóa đơn (dòng extra HDV trả) — badge bấm tay. NULL=chua_co. */
  trang_thai_hoa_don?: string | null;
}
