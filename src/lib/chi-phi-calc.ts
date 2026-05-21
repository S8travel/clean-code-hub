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
