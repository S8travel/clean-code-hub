// Helpers thuần cho BẢN IN ĐNTT (nhà hàng / dịch vụ). KHÔNG import React/DB/UI
// → test độc lập.
//
// Bối cảnh: bản in dựng từ 2 nguồn khác nhau —
//   • "Tổng tiền" + các dòng chi tiết ← state đang mở trên màn hình (localRows/extras)
//   • "Số tiền còn thanh toán"        ← ĐNTT đang sống (đọc tươi lúc bấm In)
// App tắt refetchOnWindowFocus nên tab mở lâu giữ số CŨ: người khác sửa đơn giá
// xong, tab này vẫn in giá cũ trong khi cột còn-TT đã theo ĐNTT mới → tờ giấy tự
// mâu thuẫn (Tổng − Cấn trừ ≠ Còn TT) mà không cảnh báo gì.
//
// 2 lớp chặn:
//   1. `diffPrintLine` — so dòng trên màn hình với dòng MỚI NHẤT trong DB, để in
//      theo DB (chứng từ kế toán phải khớp DB) + báo cho người in biết đã đổi gì.
//   2. `calcPrintDnttLech` — tổng dòng in vs số tiền ĐNTT đang in; lệch = ĐNTT
//      được tạo trước khi sửa giá (hoặc quên tạo lại) → cảnh báo trước khi xuất.

/** Bộ 3 giá trị quyết định thành tiền 1 dòng in. */
export interface PrintLineValue {
  so_luong: number;
  don_gia: number;
  /** CK% riêng của dòng (null/undefined = 0). */
  chiet_khau_phan_tram?: number | null;
}

/** 1 dòng in có số trên màn hình khác số trong DB. */
export interface PrintLineDiff {
  /** Nhãn hiển thị cho người in — tên NH/dịch vụ hoặc mô tả dòng phát sinh. */
  ten: string;
  /** Số đang hiện trên màn hình (cũ). */
  truoc: PrintLineValue;
  /** Số mới nhất trong DB (dùng để in). */
  sau: PrintLineValue;
  /** doan_chi_phi.id — để caller kéo đúng dòng đó trên màn hình về số DB. */
  chiPhiId?: number;
  /** Khóa nhóm trên màn hình (NH: `<doan_ngay_id>_<bua_an>`). */
  key?: string;
  /** sua = số đổi · them = dòng chỉ có trong DB · xoa = dòng đã bị xóa trong DB. */
  loai?: "sua" | "them" | "xoa";
}

/** Câu mô tả 1 chênh lệch cho toast — gộp 3 loại về một dạng đọc được. */
export function moTaPrintDiff(d: PrintLineDiff): string {
  const n = (v: number) => v.toLocaleString("vi-VN");
  if (d.loai === "them") return `${d.ten}: mới có trong hệ thống (${n(d.sau.so_luong)}×${n(d.sau.don_gia)})`;
  if (d.loai === "xoa") return `${d.ten}: đã bị xóa khỏi hệ thống`;
  return `${d.ten}: ${n(d.truoc.so_luong)}×${n(d.truoc.don_gia)} → ${n(d.sau.so_luong)}×${n(d.sau.don_gia)}`;
}

/** Lệch tiền ≤ ngưỡng này coi như bằng nhau (sai số làm tròn CK từng dòng). */
export const NGUONG_LECH_VND = 1;

export function isSamePrintLine(a: PrintLineValue, b: PrintLineValue): boolean {
  return (
    a.so_luong === b.so_luong &&
    a.don_gia === b.don_gia &&
    (a.chiet_khau_phan_tram ?? 0) === (b.chiet_khau_phan_tram ?? 0)
  );
}

/**
 * So 1 dòng in: `null` = khớp (hoặc không có bản DB để so → cứ in số đang có).
 * Caller dùng số DB (`sau`) để in và gom các diff lại báo người dùng.
 */
export function diffPrintLine(
  ten: string,
  trenManHinh: PrintLineValue,
  trongDb: PrintLineValue | null | undefined,
): PrintLineDiff | null {
  if (!trongDb) return null;
  if (isSamePrintLine(trenManHinh, trongDb)) return null;
  return { ten, truoc: trenManHinh, sau: trongDb };
}

/**
 * ĐNTT mà so_tien CỐ Ý khác tổng dòng → không so lệch được:
 *  - cọc (la_coc): chỉ trả trước 1 phần
 *  - "[Bổ sung]": chỉ trả phần chênh sau khi đã thanh toán suất chính
 */
export function isDnttLechBoQua(
  dntt: { la_coc?: boolean | null; mo_ta?: string | null } | null | undefined,
): boolean {
  if (!dntt) return false;
  return !!dntt.la_coc || !!dntt.mo_ta?.startsWith("[Bổ sung]");
}

export interface DnttLechInput {
  /** Σ thành tiền các dòng in (ĐÃ trừ CK từng dòng) — chính là cột "Tổng tiền". */
  itemsTotal: number;
  /** so_tien của ĐNTT đang in. null = in khi chưa có ĐNTT sống → không so. */
  dnttSoTien: number | null;
  /** Đã trả trước qua ĐNTT KHÁC của cùng bữa (cột "Số tiền cọc"). */
  soTienCoc?: number;
  /** Phần ĐÃ nằm trong `itemsTotal` nhưng CỐ Ý không có trong so_tien ĐNTT:
   *  voucher TẶNG (dòng chính in gross) + dòng phát sinh HDV trả tiền mặt. */
  ngoaiDntt?: number;
  /** ĐNTT cọc / bổ sung → bỏ qua, xem `isDnttLechBoQua`. */
  boQua?: boolean;
}

export interface DnttLechResult {
  /** > 0: bản in nhiều tiền hơn ĐNTT (in số cũ / ĐNTT tạo trước khi sửa tăng).
   *  < 0: bản in ít tiền hơn ĐNTT. */
  lech: number;
  canhBao: boolean;
}

/**
 * Với ĐNTT thường (không cọc, không bổ sung), số tiền đề nghị phải bằng:
 *   Σ dòng in − phần ngoài ĐNTT (voucher tặng / HDV trả) − phần đã trả trước
 * Lệch ≠ 0 nghĩa là bản in và ĐNTT KHÔNG cùng một bộ số → tờ giấy sẽ tự mâu thuẫn.
 */
export function calcPrintDnttLech(p: DnttLechInput): DnttLechResult {
  if (p.dnttSoTien == null) return { lech: 0, canhBao: false };
  const lech = Math.round(
    p.itemsTotal - (p.ngoaiDntt ?? 0) - (p.soTienCoc ?? 0) - p.dnttSoTien,
  );
  return { lech, canhBao: !p.boQua && Math.abs(lech) > NGUONG_LECH_VND };
}
