// Màu "ngày cần thanh toán" — dùng chung DNTTPage + HoaDonUNCRow.
// Tiêu chí KHỚP use-ke-toan-brief (radar kế toán): quá hạn (< hôm nay) = đỏ,
// đến hạn trong ≤3 ngày = cam. Đã trả rồi → mờ như thường (hạn hết ý nghĩa).

import { format, addDays } from "date-fns";

export function ngayCanTTClass(
  ngay: string | null | undefined,
  opts: { paid?: boolean; today?: string } = {},
): string {
  if (!ngay || opts.paid) return "text-muted-foreground";
  // Ngày local (KHÔNG dùng toISOString — lệch múi giờ VN buổi tối).
  const today = opts.today ?? format(new Date(), "yyyy-MM-dd");
  const d3 = format(addDays(new Date(today + "T00:00:00"), 3), "yyyy-MM-dd");
  if (ngay < today) return "text-red-600 font-semibold";
  if (ngay <= d3) return "text-amber-600 font-medium";
  return "text-muted-foreground";
}
