// Tính deadline lock phòng. Toàn bộ date math dùng UTC để tránh timezone-shift
// ở VN (UTC+7) làm lệch 1 ngày.

/** Cộng `days` ngày vào "yyyy-MM-dd" (days âm = trừ). UTC-safe. */
export function addDaysISO(yyyymmdd: string, days: number): string {
  if (!yyyymmdd) return "";
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Trừ `days` ngày khỏi "yyyy-MM-dd". Trả "" khi days = 0 (giữ hành vi cũ). */
export function subDaysISO(yyyymmdd: string, days: number): string {
  if (!yyyymmdd || !days) return "";
  return addDaysISO(yyyymmdd, -days);
}

/**
 * Nếu ngày rơi vào T7/CN → đẩy về thứ Sáu liền trước (gần nhất).
 * Deadline lock phòng phải nằm trước cuối tuần để kịp xử lý trong tuần làm việc.
 * T7 (DOW 6) → −1 ngày; CN (DOW 0) → −2 ngày. Ngày trong tuần giữ nguyên.
 */
export function shiftWeekendToFriday(yyyymmdd: string): string {
  if (!yyyymmdd) return yyyymmdd;
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  if (!y || !m || !d) return yyyymmdd;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=CN ... 6=T7
  if (dow === 6) return addDaysISO(yyyymmdd, -1);
  if (dow === 0) return addDaysISO(yyyymmdd, -2);
  return yyyymmdd;
}

/**
 * Deadline = check-in − `daysToDeadline` ngày, rồi đẩy khỏi cuối tuần về thứ Sáu.
 * Trả "" khi thiếu input.
 */
export function computeDeadline(checkIn: string, daysToDeadline: number): string {
  const base = subDaysISO(checkIn, daysToDeadline);
  if (!base) return "";
  return shiftWeekendToFriday(base);
}
