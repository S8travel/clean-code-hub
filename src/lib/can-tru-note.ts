// Ghi chú nguồn cấn trừ công nợ — single-source định dạng để lúc TẠO payment
// (createCanTruPayments) và lúc PARSE (build note in ĐNTT) luôn khớp nhau.

/** Prefix ghi_chu của payment cấn trừ. */
export const CAN_TRU_DOAN_PREFIX = "Cấn trừ từ đoàn:";

/** ghi_chu cho 1 payment cấn trừ từ 1 đoàn nguồn. */
export function canTruGhiChu(sourceTenDoan: string): string {
  return `${CAN_TRU_DOAN_PREFIX} ${sourceTenDoan}`;
}

/**
 * Gộp note nguồn cấn trừ từ danh sách payment → "Cấn trừ từ đoàn: A, B".
 * Bỏ trùng tên đoàn, bỏ payment không phải cấn trừ. undefined nếu không có.
 */
export function buildCanTruNote(pays: { ghi_chu: string | null }[]): string | undefined {
  const names = [
    ...new Set(
      pays
        .map((p) => p.ghi_chu ?? "")
        .filter((g) => g.startsWith(CAN_TRU_DOAN_PREFIX))
        .map((g) => g.slice(CAN_TRU_DOAN_PREFIX.length).trim())
        .filter(Boolean),
    ),
  ];
  return names.length > 0 ? `${CAN_TRU_DOAN_PREFIX} ${names.join(", ")}` : undefined;
}
