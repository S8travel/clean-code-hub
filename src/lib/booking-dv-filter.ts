/** Lọc cảnh điểm nào được sinh dòng booking ở tab Booking DV.
 *
 *  Trước đây điều kiện chỉ là `co_phi && loai === 'dich_vu'` → 2 nhóm dịch vụ
 *  không bao giờ đặt qua mail vẫn bị đẩy vào tab và nằm mãi ở "chưa gửi":
 *
 *    1. Tàu / du thuyền / KS day-use (`khach_san_id != null`): booking và chi phí
 *       đã do tab Booking KS quản (use-booking-ks tự tạo booking từ doan_ngay_item).
 *       Để ở Booking DV nữa là đếm 2 lần cùng một việc.
 *    2. Dịch vụ đặt ngoài hệ thống (`khong_can_booking = true`): Zalo, điện thoại,
 *       quan hệ sẵn — không có mail để gửi.
 *
 *  Dòng "chưa gửi" tồn đọng bị MyJob/Theo dõi tính là việc chưa xong nên đoàn nào
 *  cũng bị nhắc → OP mất niềm tin vào cảnh báo. Cả 2 nhóm CHỈ tắt phần booking,
 *  chi phí vẫn tính bình thường.
 */
export interface BookingDVCanhDiem {
  loai: string | null;
  co_phi: boolean | null;
  khach_san_id: number | null;
  khong_can_booking?: boolean | null;
}

/** Lý do một cảnh điểm không hiện ở tab Booking DV (null = có hiện). */
export type LyDoKhongBookingDV = "khong_co_phi" | "day_use" | "dat_ngoai_he_thong";

export function lyDoKhongBookingDV(cd: BookingDVCanhDiem): LyDoKhongBookingDV | null {
  if (!cd.co_phi || cd.loai !== "dich_vu") return "khong_co_phi";
  if (cd.khach_san_id != null) return "day_use";
  if (cd.khong_can_booking) return "dat_ngoai_he_thong";
  return null;
}

/** true = cảnh điểm này sinh dòng booking trong tab Booking DV (có mail để gửi). */
export function canGuiBookingDV(cd: BookingDVCanhDiem): boolean {
  return lyDoKhongBookingDV(cd) === null;
}

export const NHAN_LY_DO_KHONG_BOOKING: Record<LyDoKhongBookingDV, string> = {
  khong_co_phi: "Không phải dịch vụ có phí",
  day_use: "Đã liên kết KS/tàu — booking bên tab Booking KS",
  dat_ngoai_he_thong: "Đặt ngoài hệ thống (Zalo/điện thoại)",
};
