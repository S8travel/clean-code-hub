// Phần THUẦN của backstop "không gỡ cảnh điểm đã thanh toán / có ĐNTT khỏi chương trình".
//
// VÌ SAO CÓ FILE NÀY: `useSaveDieuTour` chạy `update doan` (dòng ~644) rồi mới upsert
// doan_ngay, và mãi tới lúc dọn doan_ngay_item (~818) mới gọi `deleteChiPhiByItemIdSafe`
// — hàm này `throw` khi gặp chi phí còn ĐNTT. Nghĩa là autosave có thể ghi DB NỬA VỜI:
// số khách đã lưu, phần còn lại thì không, rồi onError refetch kéo về trạng thái nửa ghi.
// Với autosave (không có nút Save) thì OP mất cả loạt thao tác mà không hiểu vì sao.
//
// Backstop chạy TRƯỚC byte ghi đầu tiên, giống khối đã có cho nhà hàng
// (lib/nh-orphan-cleanup.ts). Phần I/O nằm ở use-dieu-tour; phần quyết định ở đây.

export interface DoanNgayItemLite {
  id: number;
  doan_ngay_id: number;
  canh_diem_id: number | null;
}

/** Ngày trong state local: ngay_so + tập cảnh điểm OP đang chọn. */
export interface NgayCanhDiemSelection {
  ngay_so: number;
  canhDiemIds: number[];
}

/**
 * doan_ngay_item nào sẽ bị XÓA khi lưu — mirror đúng điều kiện của useSaveDieuTour:
 *   - Chỉ xét ngày CÒN trong state local (vòng lặp save chỉ chạy trên `days`).
 *     Ngày bị cắt khỏi tour không đi qua nhánh xóa item này.
 *   - Item bị xóa khi `canh_diem_id` không nằm trong tập OP đang chọn của ngày đó.
 *     `canh_diem_id` null/0 luôn bị coi là "không được chọn" (khớp nhánh dọn thứ hai
 *     trong save, vốn quét sạch item còn lại khi selected rỗng).
 */
export function findDoomedCanhDiemItems(
  items: DoanNgayItemLite[],
  ngayIdToNgaySo: Map<number, number>,
  selections: NgayCanhDiemSelection[],
): number[] {
  const selectedByNgaySo = new Map<number, Set<number>>(
    selections.map((s) => [s.ngay_so, new Set(s.canhDiemIds.filter((id) => id > 0))]),
  );
  const doomed: number[] = [];
  for (const it of items) {
    const ngaySo = ngayIdToNgaySo.get(it.doan_ngay_id);
    if (ngaySo == null) continue;            // ngày không còn trong state local
    const selected = selectedByNgaySo.get(ngaySo);
    if (!selected) continue;                 // ngày này không được lưu lượt này
    const cdId = it.canh_diem_id ?? 0;
    if (cdId <= 0 || !selected.has(cdId)) doomed.push(it.id);
  }
  return doomed;
}

export interface ChiPhiRemoveLite {
  id: number;
  mo_ta: string | null;
  so_tien_da_tt: number | null;
}

export interface BlockedChiPhi {
  moTa: string;
  /** ĐNTT còn hiệu lực đang giữ dòng này. Rỗng = bị chặn vì `so_tien_da_tt > 0`. */
  dnttIds: number[];
}

/**
 * Dòng chi phí nào KHÔNG được phép xóa: còn ĐNTT hiệu lực, hoặc đã có tiền ra
 * (`so_tien_da_tt > 0`, kể cả khi ĐNTT đã hủy — xóa là mất dấu đã trả).
 */
export function findBlockedChiPhi(
  rows: ChiPhiRemoveLite[],
  activeDnttByChiPhi: Map<number, number[]>,
): BlockedChiPhi[] {
  const blocked: BlockedChiPhi[] = [];
  for (const r of rows) {
    const moTa = r.mo_ta || `chi phí #${r.id}`;
    const dnttIds = activeDnttByChiPhi.get(r.id) ?? [];
    if (dnttIds.length > 0) {
      blocked.push({ moTa, dnttIds });
    } else if (Number(r.so_tien_da_tt ?? 0) > 0) {
      blocked.push({ moTa, dnttIds: [] });
    }
  }
  return blocked;
}

/** Thông điệp chặn — gộp MỌI dòng vướng trong một lần, không bắt OP sửa từng cái. */
export function buildCanhDiemBlockedMessage(blocked: BlockedChiPhi[]): string {
  const chiTiet = blocked
    .map((b) =>
      b.dnttIds.length > 0
        ? `"${b.moTa}" (ĐNTT ${b.dnttIds.map((i) => `#${i}`).join(", ")})`
        : `"${b.moTa}" (đã thanh toán)`,
    )
    .join("; ");
  return (
    `Không thể gỡ khỏi chương trình cảnh điểm đã thanh toán/có ĐNTT: ${chiTiet}. ` +
    `Hủy ĐNTT liên quan trước, hoặc giữ cảnh điểm trong lịch trình. ` +
    `Lịch trình chưa bị thay đổi.`
  );
}
