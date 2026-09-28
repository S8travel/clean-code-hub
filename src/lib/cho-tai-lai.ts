// Cổng "chờ lượt tải lúc mở" cho section dựng state cục bộ từ React Query (vd tab Chi phí
// Nhà hàng). Hàm thuần — hook bọc ở hooks/use-cho-tai-lai.ts.
//
// Tab Chi phí bị tháo khi OP sang tab Điều tour. Quay lại trong vòng gcTime, React Query
// trả NGAY bản cache — bản trước lần lưu Điều tour — rồi mới tải lại ngầm. Dựng state từ
// bản đó là ghim nhà hàng cũ vào ô bữa (#410) → phải chờ lượt tải lúc mở.
//
// Sự cố 28/09: cổng #410 (isStale && !isFetchedAfterMount) xét MỖI lượt render. Cache còn
// hạn lúc mở tự thành "cũ" sau staleTime (30s) mà KHÔNG kèm lượt tải nào → bảng NH bị thay
// bằng "Đang tải" và kẹt; lần invalidate đầu tiên sau khi mở cũng làm bảng nháy, tháo ô OP
// đang gõ dở. Nay: chỉ chờ TRƯỚC khi thả, thả một lần là thôi (trong cùng một khóa).

/** fetchStatus của React Query ("paused" = mất mạng, lượt tải treo chờ có mạng). */
export type TrangThaiTai = "fetching" | "paused" | "idle";

/** Phần kết quả useQuery mà cổng cần đọc. */
export interface QueryChoLite {
  isStale: boolean;
  fetchStatus: TrangThaiTai;
}

/**
 * Query này còn giữ cổng không (chỉ xét khi cổng CHƯA thả)? = đang cũ VÀ đang có lượt tải.
 * - Cũ lúc mở (chưa có data / bị invalidate / quá staleTime): React Query tải lại ngay khi
 *   mở, lượt render đầu đã là "fetching" → chờ. isStale chỉ về false khi lượt tải xong.
 * - Bị invalidate giữa lúc đang chờ (vd lượt lưu Điều tour xong đúng lúc đó) → cũng chờ,
 *   kẻo init ghép bản NH mới với bản chi phí cũ (hoặc ngược lại).
 * - Không còn lượt tải nào ("idle": xong, lỗi, bị hủy, hoặc cache chỉ tự hết hạn) → không
 *   giữ: hết hạn theo giờ không kèm lượt tải thì dữ liệu vẫn là bản lúc mở; lỗi / hủy thì
 *   thả để không kẹt "Đang tải" vô hạn.
 */
export function queryConGiuCong(q: QueryChoLite): boolean {
  return q.isStale && q.fetchStatus !== "idle";
}

export interface MocChoTaiLai {
  /** Lượt mở = đoàn + nhóm. Đổi khóa = lượt mở mới → chờ lại từ đầu. */
  khoa: string;
  /** Đã thả → cả lượt mở không chờ lại (tải lại ngầm về sau không tháo bảng). */
  daTha: boolean;
}

/**
 * Bước cổng — gọi MỖI lượt render. Còn chờ khi `!ketQua.daTha`.
 * Trả NGUYÊN `prev` khi không có gì đổi → caller so `!==` rồi mới setState.
 */
export function buocChoTaiLai(
  prev: MocChoTaiLai | null,
  khoa: string,
  queries: readonly QueryChoLite[],
): MocChoTaiLai {
  const moc: MocChoTaiLai = prev && prev.khoa === khoa ? prev : { khoa, daTha: false };
  if (moc.daTha) return moc;
  return queries.some(queryConGiuCong) ? moc : { khoa, daTha: true };
}
