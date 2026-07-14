// Quy tắc: khi hủy ĐNTT theo kiểu "cấn trừ công nợ", công nợ tạo ra PHẢI có
// nha_cung_cap_id — nếu không thì `useCongNoByNCC` lọc theo NCC sẽ không bao giờ
// thấy nó → tiền treo lửng, không cấn trừ được.
//
// BUG ĐÃ SỬA: UI và guard đọc HAI nguồn khác nhau →  bế tắc hoàn toàn.
//
//   - Guard `resolveNccForCancel` (use-dntt.ts): khi `dntt.ref_loai='doan_chi_phi'`
//     nó CHỈ đọc `doan_chi_phi.nha_cung_cap_id`. KHÔNG hề fallback sang master.
//   - UI (NHRow) lại coi là "đủ NCC" nếu **nhà hàng master** có NCC.
//
//   Hệ quả: dòng chi phí cũ chưa snapshot NCC (master thì có) → UI kết luận "không
//   cần hỏi" nên KHÔNG hiện ô chọn NCC, trong khi guard vẫn chặn và bảo "hãy chọn
//   NCC trong ô hủy". Ô đó không bao giờ hiện → OP không hủy-cấn-trừ được.
//
// Vì vậy UI phải quyết định DỰA ĐÚNG NGUỒN MÀ GUARD ĐỌC (dòng chi phí). Master chỉ
// còn dùng để GỢI Ý điền sẵn, cho OP bấm xác nhận thay vì phải tự tìm.

export interface CancelNccInput {
  /** `nha_cung_cap_id` trên DÒNG CHI PHÍ — nguồn DUY NHẤT guard hủy đọc. */
  chiPhiNccId: number | null | undefined;
  /** `nha_cung_cap_id` trên MASTER (nhà hàng/cảnh điểm…). Guard KHÔNG đọc — chỉ gợi ý. */
  masterNccId?: number | null;
}

/**
 * Có phải hỏi OP chọn NCC không?
 * Chỉ xét dòng chi phí — vì đó là thứ guard hủy kiểm. Master có NCC cũng KHÔNG cứu
 * được, nên không được dùng nó để tắt câu hỏi (đúng cái bug nói trên).
 */
export function needAskNcc(i: CancelNccInput): boolean {
  return !i.chiPhiNccId;
}

/**
 * NCC điền sẵn vào ô chọn (lấy từ master) để OP chỉ cần xác nhận.
 * Trả null khi master cũng trống → OP tự chọn.
 */
export function suggestNcc(i: CancelNccInput): number | null {
  return i.masterNccId ?? null;
}
