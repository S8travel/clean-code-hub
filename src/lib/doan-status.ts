// Trạng thái đoàn — derive từ doan.trang_thai + ngay_ve + DNTT QT HDV.
// 'hoan_thanh' và 'da_quyet_toan' là trạng thái COMPUTED, không lưu DB.

export type DoanStatus = "dang_chay" | "hoan_thanh" | "da_quyet_toan" | "huy";

export const DOAN_STATUS_LABEL: Record<DoanStatus, string> = {
  dang_chay: "Đang chạy",
  hoan_thanh: "Hoàn thành",
  da_quyet_toan: "Đã quyết toán",
  huy: "Đã hủy",
};

export const DOAN_STATUS_ORDER: DoanStatus[] = [
  "dang_chay",
  "hoan_thanh",
  "da_quyet_toan",
  "huy",
];

/**
 * Tính trạng thái đoàn theo thứ tự ưu tiên:
 *   huy > da_quyet_toan > hoan_thanh > dang_chay
 *
 * - huy: doan.trang_thai='huy' (lưu DB).
 * - da_quyet_toan: có DNTT QT HDV đã 'paid' (qua qtPaidSet).
 * - hoan_thanh: ngay_ve < hôm nay.
 * - dang_chay: còn lại.
 */
export function computeDoanStatus(
  doan: { id?: number | null; trang_thai?: string | null; ngay_ve?: string | null },
  qtPaidSet?: Set<number> | null,
  today: Date = new Date(),
): DoanStatus {
  if (doan.trang_thai === "huy") return "huy";
  if (doan.id != null && qtPaidSet?.has(doan.id)) return "da_quyet_toan";
  if (doan.ngay_ve) {
    const t0 = new Date(today);
    t0.setHours(0, 0, 0, 0);
    const ve = new Date(doan.ngay_ve + "T00:00:00");
    if (ve.getTime() < t0.getTime()) return "hoan_thanh";
  }
  return "dang_chay";
}
