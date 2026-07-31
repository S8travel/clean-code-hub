import { proRataInts } from "@/lib/pro-rata";

export interface RemainingAllocRow {
  /** doan_chi_phi.id */
  id: number;
  /** Tiền công ty của dòng (NET sau FOC) */
  thanh_tien: number;
  /** doan_chi_phi.so_tien_da_dntt — phần đã cam kết bởi các ĐNTT chưa hủy */
  committed?: number;
}

export interface RemainingAllocation {
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
export interface FixedAllocLine {
  chi_phi_id: number;
  so_tien: number;
}

/**
 * Như `buildRemainingAllocations`, nhưng nhóm có DÒNG CỐ ĐỊNH phải nhận đúng số tiền
 * của nó trước (vé voucher 'mua': allocation phải về đúng dòng được voucher phủ để
 * payment 'voucher' quy đúng chỗ). Phần CÒN LẠI chia theo phần còn thiếu của từng
 * dòng, KHÔNG dồn hết vào dòng chính.
 *
 * Vì sao không dồn dòng chính: `so_tien_da_dntt` của dòng phát sinh sẽ ở lại 0, mà
 * trang Thanh toán định kỳ xét "còn phải đề nghị" THEO TỪNG DÒNG
 * (`netPhaiTra − so_tien_da_dntt`) → dòng phát sinh vẫn hiện chưa đề nghị dù tiền của
 * nó đã nằm trong ĐNTT bổ sung → kế toán gộp lại = ĐỀ NGHỊ / TRẢ HAI LẦN.
 *
 * `fallbackChiPhiId` nhận phần dư khi không dòng nào chia được (cả nhóm HDV trả / 0đ)
 * — thà dồn 1 dòng còn hơn tạo phiếu rỗng. Trùng chi_phi_id với dòng cố định thì
 * `splitDnttPayload` gộp lại trước khi gọi RPC (UNIQUE dntt_id+chi_phi_id an toàn).
 */
export function buildAggAllocationsSpread(
  fullAmount: number,
  rows: RemainingAllocRow[],
  fixedLines: FixedAllocLine[],
  fallbackChiPhiId: number,
): RemainingAllocation[] {
  const out: RemainingAllocation[] = [];
  let conLai = Math.max(0, Math.round(fullAmount));

  for (const line of fixedLines) {
    if (conLai <= 0) break;
    const amt = Math.min(Math.round(line.so_tien || 0), conLai);
    if (amt <= 0) continue;
    out.push({ chi_phi_id: line.chi_phi_id, so_tien: amt });
    conLai -= amt;
  }

  if (conLai > 0) {
    const daCoDinh = new Set(out.map((a) => a.chi_phi_id));
    const spread = buildRemainingAllocations(
      conLai,
      rows.filter((r) => !daCoDinh.has(r.id)),
    );
    if (spread.length > 0) out.push(...spread);
    else out.push({ chi_phi_id: fallbackChiPhiId, so_tien: conLai });
  }

  return out;
}

export function buildRemainingAllocations(fullAmount: number, rows: RemainingAllocRow[]): RemainingAllocation[] {
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
