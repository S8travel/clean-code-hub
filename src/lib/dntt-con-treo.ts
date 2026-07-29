// Số tiền ĐNTT còn "treo" của một cụm chi phí — dùng để ẩn nút chốt chênh lệch
// (aggregate footer) khi tiền chưa đi tới nơi.
//
// VÌ SAO PHẢI CÓ HÀM RIÊNG: hệ thống có HAI định nghĩa "đã trả" và chúng KHÔNG
// khớp nhau —
//
//   • view `dntt_with_payment_status`: paid_amount = SUM(payments), tính
//     BẤT KỂ phiếu đã duyệt hay chưa → payment_status = 'paid' ngay khi tạo
//     phiếu có cấn trừ đủ.
//   • RPC `recalc_chi_phi_payment_status`: `so_tien_da_tt` CHỈ cộng payment của
//     phiếu `da_duyet` (`WHERE d.trang_thai_duyet = 'da_duyet' AND paid > 0`).
//
// Một ĐNTT bổ sung được cấn trừ đủ ngay lúc tạo (còn `cho_duyet`) rơi vào khe
// giữa hai định nghĩa: view coi là đã trả xong → không nằm trong "đang chờ", nên
// chốt ẩn nút mở ra; nhưng `sumPaid` lại chưa tính nó → vẫn thấy thiếu. Kết quả:
// footer mời tạo tiếp một ĐNTT bổ sung nữa cho cùng khoản tiền (đã gặp thật trên
// prod 29/07/2026: 10 đoàn cùng lúc dính, trải cả NH, DV lẫn KS).
//
// Hàm này bám theo định nghĩa của RPC — cùng nguồn với `sumPaid` — nên chốt và
// phép tính không còn cãi nhau.

export interface DnttConTreoRow {
  trang_thai_duyet: string;
  so_tien: number | string | null;
  /** SUM(payments) từ view — có thể > 0 dù phiếu chưa duyệt. */
  paid_amount?: number | null;
}

const KHONG_CON_HIEU_LUC = new Set(["da_huy", "tu_choi"]);

/**
 * Tổng tiền các ĐNTT còn treo (chưa được `so_tien_da_tt` ghi nhận).
 *
 * - `da_huy` / `tu_choi` → bỏ qua (phiếu chết, RPC cũng loại).
 * - `da_duyet` → phần chưa trả: `so_tien − paid_amount`.
 * - Còn lại (`cho_duyet`…) → treo TOÀN BỘ `so_tien`, kể cả khi đã cấn trừ đủ —
 *   vì RPC chưa cộng đồng nào của phiếu chưa duyệt vào `so_tien_da_tt`.
 *
 * Trả `0` = không còn gì treo → được phép chốt chênh lệch.
 */
export function tinhDnttConTreo(dntts: DnttConTreoRow[]): number {
  return dntts.reduce((tong, d) => {
    if (KHONG_CON_HIEU_LUC.has(d.trang_thai_duyet)) return tong;
    const soTien = Number(d.so_tien ?? 0);
    if (!Number.isFinite(soTien) || soTien <= 0) return tong;
    if (d.trang_thai_duyet !== "da_duyet") return tong + soTien;
    return tong + Math.max(0, soTien - Number(d.paid_amount ?? 0));
  }, 0);
}
