// Cảnh báo "bớt đêm khách sạn" — ca mà guard đổi/gỡ KS CỐ TÌNH bỏ qua.
//
// BỐI CẢNH. `checkKsPhiHuyOnChange` (use-doi-ks-phi-huy.ts) chỉ nổ khi khách sạn BIẾN
// MẤT HẲN khỏi tour. Hai dòng `continue` (stillUsedLocal + remaining.length > 0) khiến
// nó im lặng khi KS vẫn còn đêm khác — tức ca "bớt 1 đêm". Điều đó là ĐÚNG với nó: luồng
// đó làm detach TOÀN BỘ khách sạn (tách chi phí ra ngoài tour, hủy ĐNTT, sinh công nợ),
// chạy nó cho ca bớt-đêm sẽ tách nhầm cả những đêm còn đang ở.
//
// Nhưng bỏ qua hoàn toàn thì OP gỡ một đêm ĐÃ TRẢ TIỀN mà không được báo một chữ nào.
// Đo trên dữ liệu thật: chuyện này đã xảy ra, và chỉ được cứu ở tab Chi phí bằng một nút
// footer mà OP phải tự nhớ vào xem. Nó cứu được vì OP kỹ tính, không phải vì hệ thống chặn.
//
// File này lo ĐÚNG khoảng trống đó: chỉ CẢNH BÁO, KHÔNG tự động hoá tiền. Quy trình xử lý
// tiền hiện hành (nút "Xử lý chênh lệch thừa" → công nợ) đang chạy tốt — không thay thế nó
// bằng tự động hoá chưa được kiểm chứng.
//
// VÌ SAO ĐO TIỀN BẰNG `so_tien_da_dntt` / `so_tien_da_tt` TRÊN DÒNG CHI PHÍ, chứ không
// hỏi bảng ĐNTT:
//   1. Hai cột này do RPC `recalc_chi_phi_payment_status` tính từ allocation, nên bắt được
//      MỌI kênh — kể cả ĐNTT ĐỊNH KỲ (doan_id = NULL, ref_loai='dinh_ky'). Dò theo
//      `ref_id = ksId` thì mù hẳn với kênh định kỳ.
//   2. RLS: OP điều hành KHÔNG đọc được ĐNTT định kỳ. Hỏi thẳng bảng ĐNTT sẽ nhận về rỗng
//      và guard lại câm y như cũ — đúng cái bẫy ta đang chữa. Còn `doan_chi_phi` của chính
//      đoàn mình thì OP đọc được.
//   3. Tiền nằm ở ĐÊM, không nằm ở khách sạn. Một ĐNTT thường bao 3-4 đêm; lấy tổng cả
//      phiếu để cảnh báo cho MỘT đêm bị gỡ là sai đơn vị.

/** Tiền đang nằm trên một đêm (gộp mọi dòng chi phí KS của đêm đó). */
export interface DemChiPhiLite {
  dayId: number;
  ngaySo: number | null;
  ngayDate: string | null;
  /** Σ `so_tien_da_dntt` — đã cam kết qua ĐNTT (kể cả chưa chi). */
  daDeNghi: number;
  /** Σ `so_tien_da_tt` — tiền đã thực sự ra khỏi công ty. */
  daTra: number;
}

/** Đêm này có đang giữ tiền không? Cam kết cũng tính — ĐNTT đã duyệt chờ chi vẫn sẽ chi. */
export function coTien(d: DemChiPhiLite): boolean {
  return d.daDeNghi > 0 || d.daTra > 0;
}

/**
 * Hai thời điểm phải chặn — chúng là hai nửa của CÙNG một tai nạn:
 *
 *  - `go_bot_dem`: gỡ/đổi một đêm đang giữ tiền, mà KS cũ VẪN còn đêm khác.
 *    Đây là lúc dòng chi phí thành mồ côi.
 *
 *  - `gan_ks_vao_dem_co_tien`: gán khách sạn cho một đêm ĐANG giữ tiền mồ côi.
 *    Đây mới là lúc TIỀN BỊ QUY NHẦM: dòng chi phí (đã trả cho KS cũ) lập tức được
 *    đọc thành của KS mới, vì danh tính KS suy từ `doan_ngay.khach_san_id`.
 *    Guard cũ mù hẳn ca này (`if (!dbRow?.khach_san_id) continue`) — và vì Điều tour
 *    bắt xóa KS cũ trước rồi mới chọn KS mới, MỌI lần đổi KS đều đi qua đúng đây.
 */
export type BotDemKind = "go_bot_dem" | "gan_ks_vao_dem_co_tien";

export interface KsBotDemCanhBao {
  kind: BotDemKind;
  /** KS đang giữ các đêm này. `null` khi đêm đã mồ côi (không suy ra được KS cũ). */
  oldKsId: number | null;
  oldKsName: string | null;
  /** CHỈ những đêm dính tiền. Đêm sạch không vào đây (không làm phiền OP). */
  demDinhTien: DemChiPhiLite[];
  /** Số đêm KS cũ VẪN giữ sau thay đổi — để modal nói rõ "các đêm kia không bị đụng". */
  soDemConLai: number;
  tongDaTra: number;
  tongDaDeNghi: number;
}

/**
 * Dựng cảnh báo. `null` = không đêm nào dính tiền → im lặng, OP đổi 1 click như thường.
 *
 * CỐ Ý không nổ khi đêm sạch: OP đổi khách sạn gần như hàng ngày, đa số ca không dính tiền.
 * Modal nổ bừa thì sau một tuần sẽ có người xin tắt nó đi — và thế là mất luôn cái chốt duy
 * nhất ở đúng những ca nguy hiểm.
 */
export function buildBotDemCanhBao(input: {
  kind: BotDemKind;
  oldKsId: number | null;
  oldKsName: string | null;
  /** Các đêm bị đụng (đã kèm tiền). */
  demBiGo: DemChiPhiLite[];
  /** Số đêm KS cũ còn giữ lại. */
  soDemConLai: number;
}): KsBotDemCanhBao | null {
  const dinhTien = input.demBiGo.filter(coTien);
  if (dinhTien.length === 0) return null;

  return {
    kind: input.kind,
    oldKsId: input.oldKsId,
    oldKsName: input.oldKsName,
    demDinhTien: dinhTien,
    soDemConLai: input.soDemConLai,
    tongDaTra: dinhTien.reduce((s, d) => s + d.daTra, 0),
    tongDaDeNghi: dinhTien.reduce((s, d) => s + d.daDeNghi, 0),
  };
}

/** Nhãn ngắn cho một đêm: "Đêm 5 (12/07)". Thiếu dữ liệu thì lùi dần, không vỡ. */
export function nhanDem(d: DemChiPhiLite): string {
  const so = d.ngaySo != null ? `Đêm ${d.ngaySo}` : `Đêm #${d.dayId}`;
  if (!d.ngayDate) return so;
  const [, m, day] = d.ngayDate.split("-");
  return m && day ? `${so} (${day}/${m})` : so;
}
