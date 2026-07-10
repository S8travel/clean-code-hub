// Đếm tiến độ "Final" của booking khách sạn — dùng chung cho Theo dõi, MyJob (badge,
// KPI, danh sách việc). Trước đây mỗi nơi tự lọc, và không nơi nào loại booking đang
// trong luồng HỦY → đoàn hiện "0/1 Final" cam mãi dù khách sạn đã hủy xong.
//
// Nút "Hủy booking" (tab Booking KS) và mode booking_only chỉ đặt `ks_final_status` sang
// 'cho_ks_xac_nhan_huy' và GIỮ `trang_thai='active'` (để card còn ở tab cho OP gửi/gửi
// lại mail hủy). Vì vậy lọc `.neq("trang_thai","da_huy")` ở tầng query KHÔNG bắt được
// chúng — phải loại theo `ks_final_status` ở tầng app.

const HUY_STATES = new Set(["cho_ks_xac_nhan_huy", "ks_xac_nhan_huy"]);

export interface KsFinalRow {
  ks_final_status?: string | null;
}

/** Booking đang/đã trong luồng hủy — không còn là việc "chưa final" nữa. */
export function isKsBookingHuy(r: KsFinalRow): boolean {
  return HUY_STATES.has(r.ks_final_status ?? "");
}

/** Các booking còn phải theo dõi tiến độ Final (bỏ booking đã vào luồng hủy). */
export function ksBookingCanFinal<T extends KsFinalRow>(rows: T[]): T[] {
  return rows.filter((r) => !isKsBookingHuy(r));
}

/** {done, total} cho badge "x/y Final". total ĐÃ trừ booking đang hủy. */
export function ksFinalProgress(rows: KsFinalRow[]): { done: number; total: number } {
  const live = ksBookingCanFinal(rows);
  return {
    done: live.filter((r) => r.ks_final_status === "ks_xac_nhan_final").length,
    total: live.length,
  };
}

/** Mọi booking cần final đều đã final (đoàn rỗng → true). */
export function ksAllFinal(rows: KsFinalRow[]): boolean {
  return ksBookingCanFinal(rows).every((r) => r.ks_final_status === "ks_xac_nhan_final");
}
