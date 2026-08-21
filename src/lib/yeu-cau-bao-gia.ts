// Logic thuần của tab "Yêu cầu báo giá" — tách khỏi hook/UI để test được mà
// không cần Supabase hay render.

export type YeuCauTrangThai = "moi" | "da_bao_gia" | "bo_qua";

export const YEU_CAU_TRANG_THAI_LABEL: Record<YeuCauTrangThai, string> = {
  moi: "Chưa xử lý",
  da_bao_gia: "Đã báo giá",
  bo_qua: "Bỏ qua",
};

export const YEU_CAU_TRANG_THAI_COLOR: Record<YeuCauTrangThai, string> = {
  moi: "bg-amber-100 text-amber-800",
  da_bao_gia: "bg-emerald-100 text-emerald-700",
  bo_qua: "bg-slate-100 text-slate-500",
};

/**
 * Số ngày tour suy từ ngày đi/về — cả hai đầu tính là một ngày (2→6/11 là 5 ngày,
 * đúng cách người làm tour đếm "5 ngày 4 đêm"). Thiếu ngày hoặc ngày ngược thì
 * trả null để modal tạo báo giá dùng mặc định thay vì điền sẵn số sai.
 */
export function soNgayTuNgay(
  ngayDi: string | null | undefined,
  ngayVe: string | null | undefined,
): number | null {
  if (!ngayDi || !ngayVe) return null;
  const d1 = new Date(`${ngayDi}T00:00:00`);
  const d2 = new Date(`${ngayVe}T00:00:00`);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
  const so = Math.round((d2.getTime() - d1.getTime()) / 86_400_000) + 1;
  return so > 0 ? so : null;
}

export interface NguonTenChuongTrinh {
  tieu_de?: string | null;
  ten_agent?: string | null;
  noi_dung?: string | null;
}

/**
 * Tên chương trình điền sẵn khi bấm "Báo giá" từ một yêu cầu.
 *
 * Ưu tiên đúng thứ đối tác đặt tên. Không có tiêu đề thì lấy dòng đầu của nội
 * dung (cắt ngắn) — vẫn hơn một ô trống. Không có gì cả thì để trống chứ KHÔNG bịa.
 *
 * `tu_ghep = true` nghĩa là tên do hệ thống nhặt từ lời nhắn chứ không phải tên
 * chương trình thật: màn hình phải nhắc sửa trước khi xuất file gửi khách, kẻo
 * khách nhận được file tên "Cần báo giá gấp giúp em".
 *
 * KHÔNG ghép tên đối tác vào: bảng tạo báo giá đã có ô "Agent (đối tác)" riêng.
 */
export function tenChuongTrinhTuYeuCau(y: NguonTenChuongTrinh): { ten: string; tu_ghep: boolean } {
  const tieuDe = (y.tieu_de ?? "").trim();
  if (tieuDe) return { ten: tieuDe, tu_ghep: false };

  const dongDau = (y.noi_dung ?? "").split("\n").map((s) => s.trim()).find(Boolean) ?? "";
  if (!dongDau) return { ten: "", tu_ghep: false };
  const ngan = dongDau.length > 80 ? `${dongDau.slice(0, 80).trimEnd()}…` : dongDau;
  return { ten: ngan, tu_ghep: true };
}

/** "1,2 MB" — cỡ file cho người đọc, không phải cho máy. */
export function coChuGon(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export interface DemTheoTrangThai {
  tat_ca: number;
  moi: number;
  da_bao_gia: number;
  bo_qua: number;
}

/** Đếm cho các nút lọc. Đếm theo trạng thái HIỂN THỊ (đã đối chiếu báo giá thật). */
export function demTheoTrangThai(
  rows: Array<{ trang_thai_hien_thi: YeuCauTrangThai }>,
): DemTheoTrangThai {
  const dem: DemTheoTrangThai = { tat_ca: rows.length, moi: 0, da_bao_gia: 0, bo_qua: 0 };
  for (const r of rows) dem[r.trang_thai_hien_thi] += 1;
  return dem;
}
