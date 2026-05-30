// Đồng bộ số khách nhóm "Toàn đoàn" (thu_tu=1) khi sửa số khách ở cấp ĐOÀN.
//
// Quy tắc:
//  - Đoàn 1 nhóm: nhóm "Toàn đoàn" PHẢI = số khách đoàn → SET (không cộng delta).
//    Dùng SET (không delta) để mọi drift cũ tự khớp lại khi sửa, không bị giữ nguyên.
//  - Đoàn nhiều nhóm: KHÔNG set bằng đoàn (mỗi nhóm độc lập). Dồn DELTA thay đổi của
//    đoàn vào nhóm 1 để giữ TỔNG các nhóm = tổng đoàn; nhóm khác giữ nguyên.

export interface SoKhachBreakdown {
  so_khach_lon: number;
  so_khach_em1: number;
  so_khach_em2: number;
  so_khach_tl: number;
}

export function resolveNhom1SoKhach(args: {
  nhomCount: number;
  /** Giá trị hiện tại của nhóm thu_tu=1. */
  nhom1: SoKhachBreakdown;
  /** Số khách đoàn TRƯỚC khi sửa. */
  doanOld: SoKhachBreakdown;
  /** Số khách đoàn SAU khi sửa. */
  doanNew: SoKhachBreakdown;
}): SoKhachBreakdown {
  const { nhomCount, nhom1, doanOld, doanNew } = args;
  if (nhomCount <= 1) {
    // 1 nhóm → nhóm "Toàn đoàn" = đoàn.
    return { ...doanNew };
  }
  // Nhiều nhóm → dồn delta vào nhóm 1 (giữ tổng = đoàn), không âm.
  return {
    so_khach_lon: Math.max(0, nhom1.so_khach_lon + (doanNew.so_khach_lon - doanOld.so_khach_lon)),
    so_khach_em1: Math.max(0, nhom1.so_khach_em1 + (doanNew.so_khach_em1 - doanOld.so_khach_em1)),
    so_khach_em2: Math.max(0, nhom1.so_khach_em2 + (doanNew.so_khach_em2 - doanOld.so_khach_em2)),
    so_khach_tl: Math.max(0, nhom1.so_khach_tl + (doanNew.so_khach_tl - doanOld.so_khach_tl)),
  };
}
