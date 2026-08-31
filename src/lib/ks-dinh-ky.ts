// Xác định tập khách sạn (ksId) được coi là "thanh toán định kỳ" khi mở tab
// Chi phí KS của một đoàn. Dùng để (a) hiển thị badge/nút Định kỳ, (b) quyết
// định giá trị doan_chi_phi.thanh_toan_dinh_ky khi TẠO dòng chi phí KS mới.
//
// Nguồn:
//  (a) KS đã có dòng chi phí trong đoàn với thanh_toan_dinh_ky=true → giữ state
//      DB (đây là toggle per-đoàn OP đã bật/tắt tay).
//  (b) KS có cờ mặc định (khach_san.thanh_toan_dinh_ky_mac_dinh=true) NHƯNG CHƯA
//      có dòng chi phí nào trong đoàn → đoàn mới: seed định kỳ để dòng tạo ra
//      tự đánh dấu. KS đã có dòng thì KHÔNG seed từ master (tôn trọng toggle tay,
//      không "hồi sinh" định kỳ mà OP đã tắt trong đoàn cũ).

export interface DinhKyChiPhiRow {
  thanh_toan_dinh_ky: boolean | null;
  ref_doan_ngay_id: number | null;
}

export interface DinhKyKsDefault {
  id: number;
  thanh_toan_dinh_ky_mac_dinh?: boolean | null;
}

/**
 * NCC ghi kèm khi BẬT cờ định kỳ cho một dòng chi phí.
 *
 * Trang Thanh toán định kỳ gom cụm theo `doan_chi_phi.nha_cung_cap_id`; dòng thiếu
 * NCC rơi vào cụm "Chưa có NCC" và cụm đó bấm gộp bị chặn ("Tháng này không có NCC
 * hợp lệ") → tiền hiện ra nhưng không đề nghị được. Nên cờ định kỳ và NCC phải đi
 * cùng nhau, đừng trông vào đường lưu khác gắn NCC hộ.
 *
 * NCC của CHÍNH DÒNG trước, master chỉ fallback: ghi đè bằng master sẽ làm dòng cũ
 * nhảy sang NCC mới trong cửa sổ danh mục vừa đổi NCC → một KS bị chẻ thành hai thẻ
 * trên trang định kỳ. Chỉ ghi khi BẬT — lúc tắt, luồng ĐNTT KS thường đọc NCC từ
 * master (khachSanMap) nên không cần đụng tới cột này.
 */
export function nccPatchKhiBatDinhKy(
  batDinhKy: boolean,
  rowNccId: number | null | undefined,
  masterNccId: number | null | undefined,
): { nha_cung_cap_id?: number } {
  if (!batDinhKy) return {};
  const nccId = rowNccId ?? masterNccId ?? null;
  return nccId != null ? { nha_cung_cap_id: nccId } : {};
}

export function computeInitialDinhKyKsIds(
  ksChiPhi: DinhKyChiPhiRow[],
  /** ref_doan_ngay_id (= doan_ngay.id) → khach_san_id của ngày đó */
  ngayKsMap: Record<number, number | null | undefined>,
  ksDefaults: DinhKyKsDefault[],
): Set<number> {
  const result = new Set<number>();
  const ksIdsWithRows = new Set<number>();

  for (const cp of ksChiPhi) {
    if (cp.ref_doan_ngay_id == null) continue;
    const ksId = ngayKsMap[cp.ref_doan_ngay_id];
    if (!ksId) continue;
    ksIdsWithRows.add(ksId);
    if (cp.thanh_toan_dinh_ky) result.add(ksId);
  }

  for (const ks of ksDefaults) {
    if (ks.thanh_toan_dinh_ky_mac_dinh && !ksIdsWithRows.has(ks.id)) {
      result.add(ks.id);
    }
  }

  return result;
}
