// Định dạng nội dung việc "Hóa đơn lệch số tiền" (kế toán nhập HĐ ≠ ĐNTT).
// Tách thuần để test + để message ghi RÕ ĐNTT đó cho dịch vụ gì (loại + mô tả).

const DNTT_LOAI_LABEL: Record<string, string> = {
  dich_vu: "Dịch vụ",
  nha_hang: "Nhà hàng",
  khach_san: "Khách sạn",
  xe: "Xe",
  visa: "Visa",
  bao_hiem: "Bảo hiểm",
  hdv: "HDV",
  dinh_ky: "Định kỳ",
  tra_truoc: "Trả trước",
  hoan_ung: "Hoàn ứng",
};

const MAX = 90; // cắt mô tả dài cho gọn dòng việc

/** Nhãn "ĐNTT cho dịch vụ gì": "Dịch vụ: [Gộp] Vinwonder…". Cắt ở MAX ký tự. */
export function dnttDichVuLabel(
  loai?: string | null,
  moTa?: string | null,
  ncc?: string | null,
): string {
  const loaiLabel = DNTT_LOAI_LABEL[loai ?? ""] ?? (loai ?? "");
  const desc = (moTa || ncc || "").trim();
  const full = [loaiLabel, desc].filter(Boolean).join(": ");
  return full.length > MAX ? full.slice(0, MAX - 1).trimEnd() + "…" : full;
}

const fmtVnd = (n: number) => Math.round(n).toLocaleString("vi-VN") + " ₫";

/**
 * Mô tả việc lệch. Bắt đầu bằng marker `[HĐ#<id>]` (để dedupe ilike), kèm dịch vụ.
 * VD: "[HĐ#604] Dịch vụ: [Gộp] Vinwonder… — Hóa đơn nhập 3.400.000 ₫ ≠ số tiền ĐNTT
 *      3.600.000 ₫ (lệch -200.000 ₫) · Đoàn VDC053005BR6. Kiểm tra & xử lý."
 */
export function formatHoaDonLechMoTa(p: {
  id: number;
  hoaDon: number;
  dnttSoTien: number;
  loai?: string | null;
  dnttMoTa?: string | null;
  ncc?: string | null;
  tenDoan?: string | null;
}): string {
  const lech = Math.round(p.hoaDon) - Math.round(p.dnttSoTien);
  const dv = dnttDichVuLabel(p.loai, p.dnttMoTa, p.ncc);
  return (
    `[HĐ#${p.id}] ${dv ? `${dv} — ` : ""}Hóa đơn nhập ${fmtVnd(p.hoaDon)} ≠ số tiền ĐNTT ${fmtVnd(p.dnttSoTien)} ` +
    `(lệch ${lech > 0 ? "+" : ""}${fmtVnd(lech)})${p.tenDoan ? ` · Đoàn ${p.tenDoan}` : ""}. Kiểm tra & xử lý.`
  );
}
