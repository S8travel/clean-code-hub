// Hai vị từ quyết định cho luồng "đổi / hủy khách sạn". Tách khỏi hook để test được
// mà không cần Supabase — cả hai đều canh giữ tiền, không được để trôi.

/** Booking KS coi là "đã gửi mail & chưa vào luồng hủy". */
export function isKsBookingActive(bk: {
  ks_dat_truoc_status?: string | null;
  ks_final_status?: string | null;
  trang_thai?: string | null;
}): boolean {
  if (bk.trang_thai === "da_huy") return false;
  // Final là phase quyết định: final đã/đang hủy → coi cả booking đã hủy, dù đặt-trước
  // còn 'ks_xac_nhan'.
  if (bk.ks_final_status === "cho_ks_xac_nhan_huy" || bk.ks_final_status === "ks_xac_nhan_huy") return false;
  const dtActive = ["cho_ks_xac_nhan", "ks_xac_nhan"].includes(bk.ks_dat_truoc_status ?? "");
  const finalActive = ["cho_ks_xac_nhan", "ks_xac_nhan_final"].includes(bk.ks_final_status ?? "");
  return dtActive || finalActive;
}

export interface KsDnttLite {
  id: number;
  doan_id: number | null;
  loai: string | null;
  ref_loai: string | null;
  ref_id: number | null;
}

/**
 * ĐNTT có phải "của riêng khách sạn này, trong đoàn này" không.
 *
 * Chỉ loại ĐNTT này mới xử được bằng luồng phí hủy: `planDoiKsPhiHuy` chia phí hủy theo
 * `paid_amount` của TỪNG ĐNTT, và bước tách sẽ đổi `ref_loai` + (nếu chưa trả) tự hủy cả
 * ĐNTT. Áp lên ĐNTT thanh toán ĐỊNH KỲ (doan_id = NULL, gom nhiều đoàn) thì `paid_amount`
 * là của CẢ LÔ, và hủy nó sẽ giết luôn phần của đoàn khác.
 */
export function isOwnKsDntt(d: KsDnttLite, doanId: number, ksId: number): boolean {
  return d.doan_id === doanId && d.ref_loai === "khach_san" && d.ref_id === ksId;
}

/** ĐNTT dính tiền KS này nhưng KHÔNG thuộc riêng đoàn/KS này → phải chặn, không đoán mò. */
export function findForeignKsDntt<T extends KsDnttLite>(
  live: T[], doanId: number, ksId: number,
): T[] {
  return live.filter((d) => !isOwnKsDntt(d, doanId, ksId));
}

/** Nhãn liệt kê trong thông điệp chặn: "#123 (định kỳ), #456". */
export function formatForeignKsDntt(foreign: KsDnttLite[]): string {
  return foreign.map((d) => `#${d.id}${d.loai === "dinh_ky" ? " (định kỳ)" : ""}`).join(", ");
}
