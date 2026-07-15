// Helpers + types dùng chung cho tab Chi phí Khách sạn.
// Tách verbatim từ ChiPhiKSSection để hook / row / modal / shell cùng dùng.

import { format, getDay } from "date-fns";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";

export const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export function fmtDateDisplay(d: string) {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

export const STATUS_LABEL: Record<string, { textKey: string; cls: string }> = {
  cho_duyet:     { textKey: "Chờ duyệt ĐNTT",  cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:      { textKey: "Đã duyệt ĐNTT",   cls: "bg-teal-100 text-teal-700" },
  da_thanh_toan: { textKey: "Đã thanh toán",   cls: "bg-emerald-100 text-emerald-700" },
  hoan_tien:     { textKey: "Hoàn tiền",       cls: "bg-blue-100 text-blue-700" },
  cong_no:       { textKey: "Công nợ",         cls: "bg-purple-100 text-purple-700" },
  tu_choi:       { textKey: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

export const dayLabel = (dateStr: string) => {
  const d = new Date(dateStr);
  const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return dayNames[getDay(d)];
};

// ĐNTT KS đã thanh toán (cọc / 1 phần) cho cột "Đã thanh toán" của bản in ĐNTT.
export interface KSPaidDnttInfo {
  id: number;
  trang_thai_duyet: string;
  ref_loai: string | null;
  ref_id: number | null;
  paid_amount: number;
}

// Tổng tiền KS đã thanh toán qua các ĐNTT KHÁC của cùng khách sạn (cọc HOẶC trả 1
// phần). Dùng cho cột "Đã thanh toán" / "Đã cọc" trên bản in ĐNTT KS.
//   - Tính theo `paid_amount` THỰC TẾ (view dntt_with_payment_status), KHÔNG theo so_tien.
//   - Loại ĐNTT đang in (currentDnttId) + ĐNTT đã hủy / từ chối.
//   - KHÔNG lọc theo `la_coc`: trả 1 phần thường ghi qua ĐNTT non-cọc (la_coc=false),
//     nếu lọc la_coc sẽ bỏ sót phần đã trả → cột hiện "—" dù đã thanh toán.
export function calcKSPaidTotal(
  dnttList: KSPaidDnttInfo[],
  currentDnttId: number,
  ksId: number,
): number {
  return dnttList
    .filter((d) => {
      if (d.id === currentDnttId) return false;
      if (d.trang_thai_duyet === "da_huy" || d.trang_thai_duyet === "tu_choi") return false;
      return d.ref_loai === "khach_san" && d.ref_id === ksId;
    })
    .reduce((sum, d) => sum + (d.paid_amount || 0), 0);
}

export type KSLoaiRow = "phong" | "dich_vu_an" | "dich_vu_ve" | "dich_vu_khac";

export interface LocalKSRow {
  id?: number;
  khach_san_id: number;
  doan_ngay_id: number;
  ngay_date: string;
  // Cho row 'phong': loai_phong = tên loại phòng (TWN/DBL/SGL).
  // Cho row dịch vụ: loai_phong = tên dịch vụ (text tự do).
  loai_phong: string;
  so_phong: number;
  ci: string;
  co: string;
  so_dem: number;
  gia_phong: number;
  thanh_tien: number;
  is_day_use?: boolean;
  ref_doan_ngay_item_id?: number | null;
  foc_khach_snapshot?: number | null;
  foc_mien_snapshot?: number | null;
  loai_row?: KSLoaiRow;  // default 'phong' nếu không set
  foc_count?: number;    // dùng cho service rows (OP tự điền)
  is_hdv?: boolean;      // dòng dịch vụ HDV trả (tien_hdv>0) — ngoài tổng KS/ĐNTT
  trang_thai_hoa_don?: string | null; // dòng dịch vụ HDV trả: badge hóa đơn (kế toán bấm tay)
}

// Ngày của đoàn — chỉ field mà buildKSRowFromCp đọc.
export interface KSNgayInfo {
  ngay_date: string | null;
  khach_san_id: number | null;
}

// Item day-use KS — chỉ field mà buildKSRowFromCp đọc.
export interface KSDayUseInfo {
  khach_san_id: number;
  ngay_date: string;
  doan_ngay_id: number;
}

// Dựng 1 LocalKSRow từ 1 doan_chi_phi (snapshot CỦA TOUR). Logic GIỮ
// NGUYÊN hệt init cũ — KHÔNG đọc danh mục. null nếu thiếu ngày/KS hợp lệ.
export function buildKSRowFromCp(
  cp: ChiPhiRow,
  ngayMap: Record<number, KSNgayInfo>,
  dayUseItemMap: Record<number, KSDayUseInfo>,
): LocalKSRow | null {
  if (cp.ref_doan_ngay_item_id && dayUseItemMap[cp.ref_doan_ngay_item_id]) {
    const info = dayUseItemMap[cp.ref_doan_ngay_item_id];
    if (!info.ngay_date) return null;
    return {
      id: cp.id,
      khach_san_id: info.khach_san_id,
      doan_ngay_id: info.doan_ngay_id,
      ngay_date: info.ngay_date,
      loai_phong: cp.mo_ta || "Day Use",
      so_phong: cp.so_luong ?? 0,
      ci: info.ngay_date,
      co: info.ngay_date,
      so_dem: 1,
      gia_phong: cp.don_gia ?? 0,
      thanh_tien: (cp.so_luong ?? 0) * (cp.don_gia ?? 0),
      is_day_use: true,
      ref_doan_ngay_item_id: cp.ref_doan_ngay_item_id,
      foc_khach_snapshot: cp.foc_khach_snapshot ?? null,
      foc_mien_snapshot:  cp.foc_mien_snapshot  ?? null,
      loai_row: (cp.loai_row as KSLoaiRow) ?? "phong",
      foc_count: Number(cp.foc_count ?? 0),
      is_hdv: (cp.tien_hdv ?? 0) > 0,
      trang_thai_hoa_don: cp.trang_thai_hoa_don ?? null,
    } as LocalKSRow;
  }
  const ngay = ngayMap[cp.ref_doan_ngay_id!];
  if (!ngay || !ngay.khach_san_id) return null;
  const ci = ngay?.ngay_date || "";
  if (!ci) return null;
  const coDate = new Date(ci);
  coDate.setDate(coDate.getDate() + 1);
  const co = format(coDate, "yyyy-MM-dd");
  return {
    id: cp.id,
    // NEO: ưu tiên KS đã snapshot trên chính dòng; fallback lịch trình cho dòng cũ
    // chưa neo (tương thích ngược). Nhờ vậy đổi KS của ngày KHÔNG kéo dòng đã trả tiền
    // sang KS mới — nó ở lại đúng KS đã snapshot.
    khach_san_id: cp.khach_san_id ?? ngay.khach_san_id,
    doan_ngay_id: cp.ref_doan_ngay_id || 0,
    ngay_date: ci,
    loai_phong: cp.mo_ta || "",
    so_phong: cp.so_luong ?? 1,
    ci,
    co,
    so_dem: 1,
    gia_phong: cp.don_gia ?? 0,
    thanh_tien: (cp.so_luong ?? 1) * (cp.don_gia ?? 0),
    foc_khach_snapshot: cp.foc_khach_snapshot ?? null,
    foc_mien_snapshot:  cp.foc_mien_snapshot  ?? null,
    loai_row: (cp.loai_row as KSLoaiRow) ?? "phong",
    foc_count: Number(cp.foc_count ?? 0),
    is_hdv: (cp.tien_hdv ?? 0) > 0,
    trang_thai_hoa_don: cp.trang_thai_hoa_don ?? null,
  } as LocalKSRow;
}

/**
 * KS ids cần render card + giữ trong khachSanMap, gộp từ 4 nguồn.
 *
 * `chiPhi` (KS đã neo trên chính dòng chi phí) BẮT BUỘC có mặt: nếu một dòng neo KS_A mà
 * đêm của nó đã đổi lịch trình sang KS khác (và KS_A chưa có ĐNTT), thiếu nguồn này thì
 * KS_A không có card + rớt khỏi khachSanMap → cleanup xóa dòng khỏi localRows → dòng TÀNG
 * HÌNH nhưng vẫn cộng vào tổng đoàn. Tách thuần để test (đây là regression việc neo KS suýt
 * gây ra, do adversarial review bắt).
 *
 * `orphaned` = KS có dòng/ĐNTT nhưng KHÔNG còn trong lịch trình và không phải day-use →
 * vẫn phải render card để dòng đã neo (hoặc ĐNTT) hiển thị + sửa được, không mất dấu tiền.
 */
export function resolveKsIds(input: {
  ngay: number[]; dntt: number[]; dayUse: number[]; chiPhi: number[];
}): { allKsIds: number[]; orphanedKsIds: number[] } {
  const ngay = new Set(input.ngay);
  const dayUse = new Set(input.dayUse);
  const allKsIds = [...new Set([...input.ngay, ...input.dntt, ...input.dayUse, ...input.chiPhi])];
  const orphanedKsIds = [...new Set([...input.dntt, ...input.chiPhi])]
    .filter((id) => !ngay.has(id) && !dayUse.has(id));
  return { allKsIds, orphanedKsIds };
}
