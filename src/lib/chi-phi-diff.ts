// Dựng danh sách thay đổi "Nhãn: cũ → mới" cho các field tiền/số lượng của một
// chi phí, dùng cho audit log (activity_log) khi OP sửa chi phí. Logic thuần,
// tách khỏi UI để test được.

export interface ChiPhiDiffField {
  key: string;
  label: string;
}

// Các field có ảnh hưởng tới số tiền mà OP có thể sửa trực tiếp ở Chi phí section.
// thanh_tien là generated column → KHÔNG track (đã suy ra từ don_gia × so_luong).
export const CHI_PHI_DIFF_FIELDS: ChiPhiDiffField[] = [
  { key: "so_luong", label: "Số lượng" },
  { key: "don_gia", label: "Đơn giá" },
  { key: "tien_cong_ty", label: "Tiền công ty" },
  { key: "tien_hdv", label: "Tiền HDV" },
  { key: "foc_count", label: "FOC" },
  { key: "thanh_tien_thuc_te", label: "TT thực tế" },
];

function fmtNum(v: unknown): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("vi-VN");
}

// So sánh 2 giá trị số có tính cả null. null/undefined coi như "không có".
function sameNum(a: unknown, b: unknown): boolean {
  const na = a == null ? null : Number(a);
  const nb = b == null ? null : Number(b);
  if (na === null && nb === null) return true;
  if (na === null || nb === null) return false;
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return na === nb;
  return Math.abs(na - nb) < 1e-9;
}

/**
 * Trả về danh sách chuỗi "Nhãn: cũ → mới" cho các field tiền đã thay đổi.
 * Chỉ xét field CÓ trong newPayload (field không gửi lên = không đụng) và
 * giá trị cũ khác mới. Dùng để gắn vào mo_ta của activity_log.
 */
export function buildChiPhiChangeList(
  oldRow: Record<string, unknown> | null | undefined,
  newPayload: Record<string, unknown>,
): string[] {
  if (!oldRow) return [];
  const out: string[] = [];
  for (const { key, label } of CHI_PHI_DIFF_FIELDS) {
    if (!(key in newPayload)) continue;
    const oldV = oldRow[key];
    const newV = newPayload[key];
    if (sameNum(oldV, newV)) continue;
    out.push(`${label}: ${fmtNum(oldV)} → ${fmtNum(newV)}`);
  }
  return out;
}
