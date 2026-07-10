// Chuẩn hoá payload trước khi gọi RPC create_dntt_with_allocations.
// Tách thuần khỏi hook để test được không cần Supabase.

export interface AllocationInput {
  chi_phi_id: number;
  so_tien: number;
  ghi_chu?: string | null;
}

export interface DnttRpcArgs {
  p_dntt: Record<string, unknown>;
  p_allocations: { chi_phi_id: number; so_tien: number; ghi_chu: string | null }[];
}

/**
 * Bóc `allocations` khỏi payload ĐNTT, làm sạch danh sách phân bổ:
 *  - bỏ dòng so_tien <= 0 (vi phạm CHECK so_tien > 0 của dntt_allocations)
 *  - GỘP các dòng trùng chi_phi_id (vi phạm UNIQUE (dntt_id, chi_phi_id) → cả
 *    ĐNTT sẽ rollback trong RPC; gộp trước là đúng nghiệp vụ hơn là văng lỗi)
 *  - làm tròn về số nguyên đồng (so_tien là numeric, tránh lệch xu khi pro-rata)
 */
export function splitDnttPayload(
  payload: Record<string, unknown> & { allocations?: AllocationInput[] },
): DnttRpcArgs {
  const { allocations, ...dntt } = payload;

  const byChiPhi = new Map<number, { so_tien: number; ghi_chu: string | null }>();
  for (const a of allocations ?? []) {
    const soTien = Math.round(Number(a.so_tien) || 0);
    if (!a.chi_phi_id || soTien <= 0) continue;
    const cur = byChiPhi.get(a.chi_phi_id);
    if (cur) {
      cur.so_tien += soTien;
      // Giữ ghi chú đầu tiên khác rỗng — hai dòng gộp hiếm khi có 2 ghi chú khác nhau.
      cur.ghi_chu = cur.ghi_chu ?? a.ghi_chu ?? null;
    } else {
      byChiPhi.set(a.chi_phi_id, { so_tien: soTien, ghi_chu: a.ghi_chu ?? null });
    }
  }

  return {
    p_dntt: dntt,
    p_allocations: [...byChiPhi.entries()].map(([chi_phi_id, v]) => ({
      chi_phi_id,
      so_tien: v.so_tien,
      ghi_chu: v.ghi_chu,
    })),
  };
}

/** chi_phi_id cần recalc sau khi tạo ĐNTT. */
export function chiPhiIdsOf(args: DnttRpcArgs): number[] {
  return args.p_allocations.map((a) => a.chi_phi_id);
}
