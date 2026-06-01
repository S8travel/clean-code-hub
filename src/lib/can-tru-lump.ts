// Gộp (lump) cấn trừ của 1 ĐNTT gộp vào DÒNG ĐẦU để hiển thị 1 con số tổng rõ ràng
// (thay vì chia pro-rata khó hiểu). Đây là TẦNG HIỂN THỊ thuần — không đụng số
// liệu thực (so_tien_da_tt pro-rata theo allocation vẫn do RPC tính).
//
// Quy tắc waterfall (theo THỨ TỰ HIỂN THỊ của các dòng):
//   - Mỗi dòng hấp thụ cấn trừ tới min(alloc, cấn trừ còn lại) → dòng đầu gánh hết
//     trong ca thường (alloc dòng đầu ≥ tổng cấn trừ) = "dồn vào 1 dòng".
//   - Sau cấn trừ, hấp thụ tiền mặt (UNC đã trả) vào phần alloc còn trống.
//   - choUNC (còn phải trả) = alloc − cấn trừ dồn − tiền mặt dồn, LUÔN ≥ 0.
// Bất biến: Σ canTru = min(totalCanTru, Σ alloc); Σ choUNC = Σ alloc − Σ canTru − Σ cash.
// (cấn trừ/tiền mặt vượt Σ alloc thì phần dư bị bỏ — không thể trừ quá số phải trả.)

export interface LumpRow {
  /** Cấn trừ dồn vào dòng này (full tổng ở dòng đầu khi đủ chỗ). */
  canTru: number;
  /** Tiền mặt (UNC) phân vào dòng này. */
  cash: number;
  /** Còn phải thanh toán UNC = alloc − canTru − cash (≥ 0). */
  choUNC: number;
}

/** Thông tin lump của 1 ĐNTT: lump theo từng chi_phi + ghi chú nguồn cấn trừ. */
export interface DnttLump {
  rows: Map<number, LumpRow>;
  /** "Cấn trừ từ đoàn: ..." — tooltip nguồn (provenance). */
  canTruNote?: string;
}

/**
 * Waterfall cấn trừ rồi tới tiền mặt vào các dòng theo `allocs` (ĐÚNG thứ tự hiển thị).
 * Trả LumpRow tương ứng từng dòng.
 */
export function lumpCanTruCash(
  allocs: number[],
  totalCanTru: number,
  totalCash = 0,
): LumpRow[] {
  let rc = Math.max(0, totalCanTru);
  let rk = Math.max(0, totalCash);
  return allocs.map((raw) => {
    const alloc = Math.max(0, raw);
    const canTru = Math.min(alloc, rc);
    rc -= canTru;
    const room = alloc - canTru;
    const cash = Math.min(room, rk);
    rk -= cash;
    return { canTru, cash, choUNC: room - cash };
  });
}
