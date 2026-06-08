// Logic tính thành tiền chi phí nhà hàng (FOC + chiết khấu).
// Tách thuần ra khỏi ChiPhiNHSection để test độc lập — KHÔNG import React/DB/UI.
//
// "Mức A" — quy ước làm tròn: giữ CHÍNH XÁC ở bước trung gian, chỉ làm tròn về
// đồng nguyên ĐÚNG MỘT LẦN ở kết quả cuối. Nhờ vậy 2 cách viết chiết khấu
// (`truocCK × (1−ck/100)` và `truocCK − truocCK×ck/100`) cho KẾT QUẢ NHƯ NHAU —
// loại bỏ sai lệch ±1₫ giữa lúc lưu chi phí và lúc tạo ĐNTT / in.

import { calcSoKhachThucTe } from "./foc-calc";

/**
 * Áp chiết khấu lên số tiền trước CK theo Mức A: `round(truocCK × (1 − ck/100))`.
 * Làm tròn ĐÚNG 1 lần ở cuối. `chietKhauPct` ≤ 0 / null / undefined → chỉ làm
 * tròn `truocCK` (không giảm gì).
 */
export function applyChietKhau(
  truocCK: number,
  chietKhauPct: number | null | undefined,
): number {
  const ck = chietKhauPct && chietKhauPct > 0 ? chietKhauPct : 0;
  return Math.round(truocCK * (1 - ck / 100));
}

export interface DnttPaidLite {
  id: number;
  trang_thai_duyet: string;
  paid_amount?: number;
}

/**
 * Tổng tiền đã thanh toán TRƯỚC qua các ĐNTT KHÁC trong `dntts` (cọc HOẶC trả 1
 * phần): Σ `paid_amount` của mọi ĐNTT có `id !== currentId`, loại ĐNTT đã hủy /
 * từ chối. KHÔNG lọc `la_coc` — trả 1 phần thường ghi qua ĐNTT non-cọc.
 * `dntts` phải được lọc sẵn theo phạm vi (cùng bữa / cùng chi phí / cùng KS) trước khi gọi.
 * Dùng cho cột "Số tiền cọc" / "Đã thanh toán" của bản in ĐNTT NH/DV.
 */
export function calcDnttPriorPaid(dntts: DnttPaidLite[], currentId: number | null): number {
  return dntts
    .filter((d) => d.id !== currentId
      && d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi")
    .reduce((s, d) => s + (d.paid_amount ?? 0), 0);
}

/**
 * Thành tiền 1 bữa ăn nhà hàng (phần main, CHƯA gồm extras):
 * số khách thực tế sau FOC × đơn giá, rồi áp chiết khấu theo Mức A.
 */
export function calcNHThanhTien(
  soKhach: number,
  focKhach: number | null,
  focMien: number | null,
  donGia: number,
  chietKhauPct: number | null | undefined,
): number {
  const truocCK = calcSoKhachThucTe(soKhach, focKhach, focMien) * donGia;
  return applyChietKhau(truocCK, chietKhauPct);
}
