// Logic tính FOC (free of charge) cho chi phí khách sạn + nhà hàng.
// Tách thuần ra khỏi ChiPhiKSSection / ChiPhiNHSection để test độc lập —
// KHÔNG import React / DB / UI. Mọi công thức GIỮ NGUYÊN hành vi code cũ.

// ─── Khách sạn (FOC Option A — foc_count nhập tay per-row) ────────────────────

/**
 * Input tối thiểu cho các hàm FOC khách sạn. `LocalKSRow` (ChiPhiKSSection)
 * thỏa interface này về mặt cấu trúc nên truyền thẳng được.
 */
export interface KSFocRow {
  loai_row?: string;
  foc_count?: number;
  so_phong: number;
  so_dem: number;
  gia_phong: number;
  foc_khach_snapshot?: number | null;
  foc_mien_snapshot?: number | null;
}

/** Row 'phong' (hoặc legacy không có loai_row) tính vào FOC; service rows thì không. */
export function isKSRoomRow(r: { loai_row?: string }): boolean {
  return !r.loai_row || r.loai_row === "phong";
}

// FOC per row (Option A — foc_count nhập tay cho mọi row, KHÔNG auto-pool theo ngày).
// Lý do: pool tự động phân bổ FOC theo bình quân giá → khi mix loại phòng (vd 30 twn
// + 1 sgl nâng hạng), FOC dính một phần vào SGL → vượt giá trị thực (chỉ free 1 twn).
// UI nay hiện "16免1 suggest" để OP biết tổng FOC, nhưng OP tự gán foc_count cho row
// phòng giá thấp nhất. Signature giữ args (sameKsDayRows, focKhach, focMien) để callers
// cũ không phải đổi — args hiện chỉ dùng cho legacy compat, không còn tính toán pool.
export function calcRowFocBreakdown(
  row: KSFocRow,
  _sameKsDayRows: KSFocRow[],
  _focKhach: number | null,
  _focMien: number | null,
): { rowFocDeduction: number; rowFocCount: number } {
  const focCount = Math.max(0, Number(row.foc_count) || 0);
  if (focCount <= 0) return { rowFocDeduction: 0, rowFocCount: 0 };
  const pricePerRoom = Number(row.gia_phong) || 0;
  return {
    rowFocDeduction: Math.round(focCount * pricePerRoom),
    rowFocCount: focCount,
  };
}

// Tổng KS = sum((so_luong - foc_count) × gia_phong) cho mọi row (phòng + dịch vụ).
// focKhach/focMien không còn dùng để tính tiền (giữ args cho compat); chỉ dùng UI gợi ý.
export function calcTotalKS(
  rows: KSFocRow[],
  _focKhach: number | null,
  _focMien: number | null,
): number {
  return rows.reduce((sum, r) => {
    const focCount = Math.max(0, Number(r.foc_count) || 0);
    const billed = Math.max(0, (Number(r.so_phong) || 0) - focCount);
    const soDem = isKSRoomRow(r) ? (Number(r.so_dem) || 1) : 1;
    return sum + billed * (Number(r.gia_phong) || 0) * soDem;
  }, 0);
}

// Gợi ý tổng FOC theo công thức 16免1 cho 1 ngày — info-only, KHÔNG auto-fill.
// OP tự gán foc_count vào row phòng giá thấp nhất.
export function calcFocSuggestion(
  dayRoomRows: { so_phong: number }[],
  focKhach: number | null,
  focMien: number | null,
): { totalRooms: number; suggestedFoc: number } {
  const totalRooms = dayRoomRows.reduce((s, r) => s + (Number(r.so_phong) || 0), 0);
  if (!focKhach || !focMien || focKhach <= 0 || focMien <= 0) {
    return { totalRooms, suggestedFoc: 0 };
  }
  if (totalRooms < focKhach) return { totalRooms, suggestedFoc: 0 };
  return { totalRooms, suggestedFoc: Math.floor(totalRooms / focKhach) * focMien };
}

/** Resolve FOC config khách sạn: ưu tiên snapshot trên rows, fall back master. */
export function resolveKSFoc(
  rows: Pick<KSFocRow, "foc_khach_snapshot" | "foc_mien_snapshot">[],
  ksMaster: { foc_khach: number | null; foc_mien: number | null } | undefined | null,
): { foc_khach: number | null; foc_mien: number | null } {
  const withSnap = rows.find((r) => r.foc_khach_snapshot != null || r.foc_mien_snapshot != null);
  if (withSnap) {
    return {
      foc_khach: withSnap.foc_khach_snapshot ?? null,
      foc_mien:  withSnap.foc_mien_snapshot  ?? null,
    };
  }
  return {
    foc_khach: ksMaster?.foc_khach ?? null,
    foc_mien:  ksMaster?.foc_mien  ?? null,
  };
}

// ─── Nhà hàng (FOC theo công thức floor số khách) ─────────────────────────────

/** Số khách thực tế tính tiền sau khi trừ FOC: soKhach − floor(soKhach/focKhach)×focMien. */
export function calcSoKhachThucTe(
  soKhach: number,
  focKhach: number | null,
  focMien: number | null,
): number {
  if (!focKhach || !focMien || focKhach <= 0) return soKhach;
  return soKhach - Math.floor(soKhach / focKhach) * focMien;
}

// Resolve FOC nhà hàng: snapshot trên row > master nha_hang. Snapshot lock per-tour
// → master changes không thay đổi calculation đoàn cũ.
export function resolveNHFoc(
  row: { foc_khach_snapshot?: number | null; foc_mien_snapshot?: number | null } | null | undefined,
  nh: { foc_khach: number | null; foc_mien: number | null } | null | undefined,
): { foc_khach: number | null; foc_mien: number | null } {
  if (row && (row.foc_khach_snapshot != null || row.foc_mien_snapshot != null)) {
    return {
      foc_khach: row.foc_khach_snapshot ?? null,
      foc_mien:  row.foc_mien_snapshot  ?? null,
    };
  }
  return {
    foc_khach: nh?.foc_khach ?? null,
    foc_mien:  nh?.foc_mien  ?? null,
  };
}

// ─── Dịch vụ / cảnh điểm (FOC theo công thức floor số khách, mirror nhà hàng) ──

// Resolve FOC dịch vụ: snapshot trên row (lock per-tour) > master canh_diem.
// Cùng cấu trúc resolveNHFoc nhưng master là canh_diem.foc_*. Tách riêng để
// đặt tên đúng ngữ nghĩa (DV ≠ NH) và để 2 nhánh có thể rẽ sau này nếu cần.
export function resolveDVFoc(
  row: { foc_khach_snapshot?: number | null; foc_mien_snapshot?: number | null } | null | undefined,
  cd: { foc_khach: number | null; foc_mien: number | null } | null | undefined,
): { foc_khach: number | null; foc_mien: number | null } {
  if (row && (row.foc_khach_snapshot != null || row.foc_mien_snapshot != null)) {
    return {
      foc_khach: row.foc_khach_snapshot ?? null,
      foc_mien:  row.foc_mien_snapshot  ?? null,
    };
  }
  return {
    foc_khach: cd?.foc_khach ?? null,
    foc_mien:  cd?.foc_mien  ?? null,
  };
}

// Resolve chiết khấu nhà hàng: snapshot > master. Lock per-tour.
// Lưu ý: snapshot = 0 là giá trị HỢP LỆ (OP clear ô) → KHÔNG fallback master.
export function resolveNHChietKhau(
  row: { chiet_khau_phan_tram_snapshot?: number | null } | null | undefined,
  nh: { chiet_khau_phan_tram: number | null } | null | undefined,
): number {
  if (row && row.chiet_khau_phan_tram_snapshot != null) {
    return row.chiet_khau_phan_tram_snapshot;
  }
  return nh?.chiet_khau_phan_tram ?? 0;
}
