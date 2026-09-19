// Gom dòng chi phí thành "phiếu" trên bản in ĐNTT (NH / DV) và tính 3 cột tiền
// của phiếu: Số tiền cọc · Cấn trừ · Số tiền còn thanh toán.
//
// Bối cảnh (lỗi thật 19/09/2026 — nhiều vé cùng 1 NCC trong 1 ĐNTT gộp):
// bản in chỉ gom dòng theo ĐNTT CHƯA trả xong. ĐNTT gộp vừa tạo đã được cấn trừ
// ĐỦ bằng công nợ → bị coi là "xong" → nhóm vỡ thành từng phiếu lẻ, và quy tắc cũ
// "cấn trừ chỉ in 1 lần / nhà cung cấp" cho phiếu đầu ăn hết phần cấn trừ hiển
// thị → các phiếu sau in thành "còn phải thanh toán" dù tiền đã cấn trừ hết.
//
// Nguyên tắc ở đây: ĐNTT đã trả xong VẪN giữ vai trò gom nhóm (để tờ giấy còn
// là một khoản duy nhất), nhưng phần đã trả phải được trừ ra khỏi "còn thanh
// toán" — không bao giờ in ra số phải trả cho khoản đã tất toán.

export interface DnttPrintLite {
  id: number;
  la_coc?: boolean | null;
  payment_status?: string | null;
}

/**
 * Chọn ĐNTT đại diện cho một nhóm dòng trên bản in, theo thứ tự ưu tiên:
 *  1. ĐNTT cọc chưa trả xong (in cọc trước, phần còn lại sau).
 *  2. ĐNTT bất kỳ chưa trả xong.
 *  3. ĐNTT đã trả xong, mới nhất (id lớn nhất) — giữ nhóm, phiếu ra "còn 0".
 * `cands` phải được lọc sẵn: chỉ ĐNTT còn hiệu lực (không hủy / từ chối).
 */
export function chonDnttInPhieu<T extends DnttPrintLite>(cands: readonly T[]): T | null {
  const chuaTraXong = cands.filter((d) => d.payment_status !== "paid");
  if (chuaTraXong.length > 0) {
    return chuaTraXong.find((d) => d.la_coc) ?? chuaTraXong[0];
  }
  return cands.reduce<T | null>((best, d) => (!best || d.id > best.id ? d : best), null);
}

export interface TienPhieuInput {
  /** Mệnh giá ĐNTT đang in. */
  soTienDntt: number;
  /** Cấn trừ công nợ ghi trên CHÍNH ĐNTT này. */
  canTru: number;
  /** Đã trả trên CHÍNH ĐNTT này bằng tiền (cash/voucher) — không tính cấn trừ. */
  daTraTrenPhieu: number;
  /** Đã trả trước qua các ĐNTT KHÁC cùng nhóm dòng (cọc / trả một phần). */
  daTraPhieuKhac: number;
}

export interface TienPhieu {
  /** Cột "Số tiền cọc" = đã trả trước, gồm cả phần đã trả trên chính phiếu này. */
  soTienCoc: number;
  /** Cột "Số tiền còn thanh toán" — không bao giờ âm. */
  soTienConTT: number;
}

/**
 * 3 cột tiền của phiếu khi nhóm dòng gắn với một ĐNTT.
 * Bất biến: soTienConTT = max(0, mệnh giá − cấn trừ − đã trả trên phiếu)
 * → ĐNTT đã tất toán (bằng cấn trừ hoặc tiền) luôn in "còn 0".
 */
export function tinhTienPhieuDntt(input: TienPhieuInput): TienPhieu {
  const { soTienDntt, canTru, daTraTrenPhieu, daTraPhieuKhac } = input;
  return {
    soTienCoc: Math.max(0, daTraPhieuKhac) + Math.max(0, daTraTrenPhieu),
    soTienConTT: Math.max(0, soTienDntt - Math.max(0, canTru) - Math.max(0, daTraTrenPhieu)),
  };
}
