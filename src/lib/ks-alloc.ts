import { proRataInts } from "@/lib/pro-rata";

export interface KSAllocRow {
  /** doan_chi_phi.id */
  id: number;
  /** Tiền công ty của dòng (NET sau FOC) */
  thanh_tien: number;
  /** doan_chi_phi.so_tien_da_dntt — phần đã cam kết bởi các ĐNTT chưa hủy */
  committed?: number;
}

export interface KSAllocation {
  chi_phi_id: number;
  so_tien: number;
}

/**
 * Chia số tiền của 1 ĐNTT khách sạn về các dòng chi phí của thẻ.
 *
 * Trọng số = phần CÒN LẠI của mỗi dòng (`thanh_tien − so_tien_da_dntt`), KHÔNG phải
 * `thanh_tien`. Chia theo `thanh_tien` khiến ĐNTT "khoản còn lại" rải cả sang những
 * dòng đã cam kết/trả đủ → dòng cũ bị over-commit (`so_tien_da_dntt` > tiền của chính
 * nó) còn dòng phát sinh mới vẫn hiện "chưa thanh toán".
 *
 * Fallback về `thanh_tien` khi tổng phần còn lại <= 0 (thẻ đã cam kết đủ nhưng vẫn
 * tạo thêm ĐNTT — giữ hành vi cũ thay vì trả mảng rỗng làm phiếu rỗng).
 */
export function buildKSAllocations(fullAmount: number, rows: KSAllocRow[]): KSAllocation[] {
  const positive = rows.filter((r) => Math.round(r.thanh_tien || 0) > 0);
  if (positive.length === 0) return [];

  const remains = positive.map((r) =>
    Math.max(0, Math.round(r.thanh_tien || 0) - Math.round(r.committed || 0)),
  );
  const sumRemain = remains.reduce((s, x) => s + x, 0);

  const targets = sumRemain > 0
    ? positive.filter((_, i) => remains[i] > 0)
    : positive;
  const weights = sumRemain > 0
    ? remains.filter((x) => x > 0)
    : positive.map((r) => Math.round(r.thanh_tien || 0));

  const amounts = proRataInts(fullAmount, weights);
  return targets
    .map((r, i) => ({ chi_phi_id: r.id, so_tien: amounts[i] }))
    .filter((a) => a.so_tien > 0);
}
