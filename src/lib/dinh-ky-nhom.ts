// Cờ "thanh toán định kỳ" thuộc về CẢ NHÓM chi phí (dòng chính + dòng phát sinh),
// không phải của riêng dòng chính.
//
// SỰ CỐ (30/07/2026, phát hiện trên một đoàn đang chạy): bữa trưa bật "Định kỳ"
// nhưng dòng phát sinh của nó vẫn giữ thanh_toan_dinh_ky = false, nên:
//   • trang Thanh toán định kỳ lọc `.eq("thanh_toan_dinh_ky", true)` → KHÔNG thấy nó;
//   • luồng gộp theo NCC trong đoàn (lib/dntt-gop-calc) lại bỏ qua cả nhóm khi dòng
//     chính là định kỳ.
// → dòng phát sinh không nằm trong luồng đề nghị thanh toán NÀO CẢ = tiền bỏ quên.
//
// Hai hệ quả phải xử CÙNG LÚC khi gắn cờ định kỳ cho dòng phát sinh:
//  1. NHÀ CUNG CẤP — trang định kỳ gom cụm theo `nha_cung_cap_id`. Dòng phát sinh do
//     tab Chi phí tạo ra không có NCC (chỉ cascade Điều tour mới set) → rơi vào cụm
//     "Chưa có NCC" và nút Tạo ĐNTT báo "Tháng này không có NCC hợp lệ".
//  2. CAM KẾT CŨ — ĐNTT per-bữa / per-dịch vụ dồn TOÀN BỘ allocation vào dòng chính
//     (so_tien = main + extras). Bật định kỳ sau khi đã có phiếu đó thì phần phát sinh
//     hiện lại như "chưa đề nghị" → đề nghị lần hai. Xem `tienDeNghiTrung`.

export interface ChiPhiNhomLite {
  id: number;
  tien_cong_ty?: number | null;
  thanh_tien_thuc_te?: number | null;
  so_tien_da_dntt?: number | null;
  thanh_toan_dinh_ky?: boolean | null;
}

/** Net công ty phải trả của 1 dòng — mirror `netPhaiTra` (lib/dinh-ky-amounts). */
function net(r: ChiPhiNhomLite): number {
  return r.thanh_tien_thuc_te ?? r.tien_cong_ty ?? 0;
}

/** Phần còn phải ĐỀ NGHỊ của 1 dòng = net − đã đề nghị (không âm). */
function conPhaiDeNghi(r: ChiPhiNhomLite): number {
  return Math.max(0, net(r) - (r.so_tien_da_dntt ?? 0));
}

/**
 * Số tiền có nguy cơ bị ĐỀ NGHỊ HAI LẦN khi bật định kỳ cho nhóm.
 *
 * = giao của hai vế:
 *   • phần cam kết trên dòng chính VƯỢT giá trị của chính nó (dòng chính đang gánh
 *     tiền phát sinh — dấu hiệu đã có ĐNTT per-bữa/per-dịch vụ dồn allocation);
 *   • phần phát sinh sẽ hiện ra như "còn phải đề nghị" trên trang định kỳ.
 *
 * 0 = an toàn (chưa có phiếu nào, hoặc phiếu chỉ vừa đủ phần dòng chính).
 */
export function tienDeNghiTrung(
  main: ChiPhiNhomLite | null | undefined,
  extras: ChiPhiNhomLite[],
): number {
  if (!main) return 0;
  const ganhHo = Math.max(0, (main.so_tien_da_dntt ?? 0) - net(main));
  if (ganhHo <= 0) return 0;
  const conLaiExtras = extras.reduce((s, e) => s + conPhaiDeNghi(e), 0);
  return Math.min(ganhHo, conLaiExtras);
}

/**
 * Các dòng cần ghi lại cờ định kỳ (bỏ dòng đã đúng cờ → không mutate thừa).
 * `rows` là cả nhóm: dòng chính + phát sinh đã có id trong DB.
 */
export function idsCanDoiCoDinhKy(rows: ChiPhiNhomLite[], target: boolean): number[] {
  return rows.filter((r) => !!r.thanh_toan_dinh_ky !== target).map((r) => r.id);
}

const PREFIX_PHAT_SINH = /^\[(?:trua|toi|dvps_\d+)\]\s*/;

/**
 * Nhãn hiển thị 1 dòng chi phí ngoài phạm vi tab Chi phí (trang định kỳ, Excel gửi
 * NCC): bỏ prefix nhóm `[trua] / [toi] / [dvps_<id>]` — prefix chỉ là khoá kỹ thuật
 * để gom nhóm, in ra cho kế toán/NCC đọc thì thành rác.
 */
export function nhanChiPhi(moTa: string | null | undefined): {
  nhan: string;
  laPhatSinh: boolean;
} {
  const raw = (moTa ?? "").trim();
  const laPhatSinh = PREFIX_PHAT_SINH.test(raw);
  return { nhan: raw.replace(PREFIX_PHAT_SINH, "").trim(), laPhatSinh };
}
