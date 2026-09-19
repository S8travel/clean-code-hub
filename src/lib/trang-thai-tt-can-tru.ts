// Nhãn trạng thái thanh toán của 1 dòng chi phí, có kể phần đã cấn trừ công nợ.
//
// Vì sao cần: `doan_chi_phi.trang_thai_thanh_toan` chỉ tính là đã trả sau khi
// ĐNTT được DUYỆT (RPC recalc_chi_phi_payment_status). Khoản cấn trừ ghi ngay
// lúc tạo phiếu nên có quãng "đã cấn trừ đủ nhưng phiếu chưa duyệt": bản xuất
// Excel in trơ "Chưa thanh toán", người đọc không biết tiền đã xử lý và có thể
// đề nghị trả lại lần nữa. Màn hình chi phí đã hiện "CT … → TT …" ở cả KS/NH/DV;
// đây là phần bù cho file xuất ra.
//
// Nguyên tắc giữ nguyên: chưa duyệt thì vẫn là CHƯA thanh toán — chỉ ghi thêm
// chú thích, không tự nâng trạng thái.

/** Số tiền dạng 1.234.567 (khớp cách hiển thị tiền toàn app). */
function fmt(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

export interface NhanTrangThaiInput {
  /** Nhãn gốc theo `trang_thai_thanh_toan` (vd "Chưa thanh toán"). */
  nhanGoc: string;
  /** `doan_chi_phi.trang_thai_thanh_toan`. */
  trangThai?: string | null;
  /** Tổng cấn trừ công nợ đã ghi cho dòng này (Σ payments method='can_tru'). */
  canTru: number;
}

/**
 * Nhãn hiển thị: giữ nguyên nhãn gốc, thêm "· đã cấn trừ X (chờ duyệt)" khi dòng
 * chưa được tính là đã trả nhưng đã có tiền cấn trừ.
 */
export function nhanTrangThaiTTCanTru(input: NhanTrangThaiInput): string {
  const { nhanGoc, trangThai, canTru } = input;
  if (!(canTru > 0)) return nhanGoc;
  if (trangThai === "paid") return nhanGoc;
  return `${nhanGoc} · đã cấn trừ ${fmt(canTru)} (chờ duyệt)`;
}

/** chi_phi_id → tổng cấn trừ, gom từ payments đã phân bổ theo dòng. */
export function gomCanTruTheoChiPhi(
  payments: readonly { chi_phi_id: number; method: string; payment_so_tien: number }[],
): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of payments) {
    if (p.method !== "can_tru") continue;
    out[p.chi_phi_id] = (out[p.chi_phi_id] ?? 0) + p.payment_so_tien;
  }
  return out;
}
