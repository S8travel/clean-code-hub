// Xác định tập bữa ăn (key = `${doan_ngay_id}_${bua_an}`) được coi là "thanh
// toán định kỳ" khi mở tab Chi phí NH của một đoàn. Dùng để (a) hiển thị badge/
// nút Định kỳ, (b) quyết định `doan_chi_phi.thanh_toan_dinh_ky` khi TẠO dòng mới.
//
// Bản sao ngữ nghĩa của lib/ks-dinh-ky.ts, khác mỗi đơn vị gom nhóm: KS gom theo
// khách sạn trong đoàn, NH gom theo TỪNG BỮA (một nhà hàng có thể ăn nhiều bữa).
//
// Nguồn:
//  (a) Bữa ĐÃ có dòng chi phí trong đoàn → giữ nguyên state DB (đây là toggle
//      per-đoàn OP đã bật/tắt tay).
//  (b) Bữa CHƯA có dòng chi phí + nhà hàng gắn cờ mặc định → seed định kỳ để
//      dòng tạo ra tự đánh dấu.
//
// Vì sao KHÔNG seed cho bữa đã có dòng: sẽ "hồi sinh" định kỳ mà OP đã tắt tay ở
// đoàn cũ mỗi lần mở lại tab — và đổi cờ danh mục không được phép thay đổi đoàn
// đã chốt chi phí (rule trong CLAUDE.md).

export interface DinhKyNhMeal {
  /** `${doan_ngay_id}_${bua_an}` */
  key: string;
  /** Bữa này đã có dòng chi phí chính trong đoàn chưa. */
  daCoChiPhi: boolean;
  /** `doan_chi_phi.thanh_toan_dinh_ky` của dòng chính (chỉ dùng khi daCoChiPhi). */
  chiPhiDinhKy?: boolean | null;
  /** `nha_hang.thanh_toan_dinh_ky_mac_dinh` (chỉ dùng khi CHƯA có dòng). */
  nhMacDinh?: boolean | null;
}

export function computeInitialDinhKyNhKeys(meals: DinhKyNhMeal[]): Set<string> {
  const result = new Set<string>();
  for (const m of meals) {
    const dinhKy = m.daCoChiPhi ? !!m.chiPhiDinhKy : !!m.nhMacDinh;
    if (dinhKy) result.add(m.key);
  }
  return result;
}
