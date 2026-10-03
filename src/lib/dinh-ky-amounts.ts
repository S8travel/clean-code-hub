/**
 * Số tiền phải trả NCC cho 1 dòng chi phí trong luồng Thanh toán định kỳ.
 *
 * GOTCHA FOC: `doan_chi_phi.thanh_tien` là generated = đơn_giá × số_lượng — CHƯA
 * trừ FOC. Với dòng khách sạn / nhà hàng có FOC, số công ty thực trả NCC là
 * `tien_cong_ty = (so_luong − foc_count) × gia_phong` (đã trừ phòng/suất miễn).
 * Dùng `thanh_tien` làm base → đề nghị & trả DƯ đúng phần FOC cho NCC.
 *
 * `thanh_tien_thuc_te` (nếu có) là số thực tế công ty phải trả sau điều chỉnh —
 * cùng thang "net" với `tien_cong_ty` — nên override trực tiếp.
 */
export interface ChiPhiNetLite {
  tien_cong_ty: number;
  thanh_tien_thuc_te: number | null;
}

/** Số công ty phải trả NCC cho 1 dòng chi phí (đã trừ FOC; override = thanh_tien_thuc_te). */
export function netPhaiTra(r: ChiPhiNetLite): number {
  return r.thanh_tien_thuc_te ?? r.tien_cong_ty;
}

export interface ChiPhiCamKetLite extends ChiPhiNetLite {
  /** Đã ĐỀ NGHỊ (Σ allocation của ĐNTT chưa hủy, gồm phiếu chưa trả). */
  so_tien_da_dntt: number;
}

/**
 * Phần dòng còn phải ĐỀ NGHỊ = net − đã đề nghị, không âm. Đây là số "Còn" của cụm
 * và số tiền nút "Tạo ĐNTT". KHÔNG dùng so_tien_da_tt (đã trả) — phần đã đề nghị mà
 * chưa trả sẽ bị gộp vào phiếu mới lần nữa.
 */
export function conPhaiDeNghi(r: ChiPhiCamKetLite): number {
  return Math.max(0, netPhaiTra(r) - r.so_tien_da_dntt);
}

/**
 * Phần ĐNTT đã gán cho dòng VƯỢT chi phí hiện tại của nó (chi phí bị sửa giảm sau khi
 * đề nghị). Phía trang không trừ được phần này vào `conPhaiDeNghi` của dòng khác, nên
 * DB tự dồn nó sang dòng còn thiếu cùng NCC × kỳ (trigger trg_dinh_ky_don_phan_du,
 * migration 20261003). Còn sót lại ở đây là phần trigger CỐ Ý không dồn: dư từ trước
 * lần giảm, phiếu đã có công nợ đối ứng, hoặc không còn dòng thiếu cùng NCC → "Còn"
 * của cụm CHƯA tính phần này, kế toán soát công nợ NCC trước khi tạo ĐNTT.
 */
export function deNghiVuot(r: ChiPhiCamKetLite): number {
  return Math.max(0, r.so_tien_da_dntt - netPhaiTra(r));
}

export interface TongCumDinhKy {
  /** Σ net phải trả NCC. */
  tongPhaiTra: number;
  /** Σ đã trả. */
  daTra: number;
  /** Σ phần còn phải đề nghị — số "Còn" + số tiền "Tạo ĐNTT → Toàn bộ". */
  conPhaiDeNghi: number;
  /** Σ phần đề nghị vượt chi phí (xem `deNghiVuot`). */
  deNghiVuot: number;
  soDongVuot: number;
}

/** Tổng của 1 cụm NCC × kỳ trên trang Thanh toán định kỳ. */
export function tongCumDinhKy(
  rows: ReadonlyArray<ChiPhiCamKetLite & { so_tien_da_tt: number }>,
): TongCumDinhKy {
  const tong: TongCumDinhKy = { tongPhaiTra: 0, daTra: 0, conPhaiDeNghi: 0, deNghiVuot: 0, soDongVuot: 0 };
  for (const r of rows) {
    tong.tongPhaiTra += netPhaiTra(r);
    tong.daTra += r.so_tien_da_tt;
    tong.conPhaiDeNghi += conPhaiDeNghi(r);
    const vuot = deNghiVuot(r);
    if (vuot > 0) {
      tong.deNghiVuot += vuot;
      tong.soDongVuot += 1;
    }
  }
  return tong;
}
