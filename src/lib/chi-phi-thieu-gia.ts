// Dòng phát sinh ([trua] / [toi] / [dvps_<id>]) đã đặt tên nhưng CHƯA nhập giá.
//
// Nút ➕ tạo dòng phát sinh với SL 1 / đơn giá 0 rồi để OP gõ tiếp. Bỏ dở giữa chừng
// (gõ tên xong đi làm việc khác) thì dòng nằm im ở 1 × 0 — không có tín hiệu nào cả:
// cột thành tiền để trống, file Excel in ra "SL 1 / đơn giá 0 / không tiền", đọc y
// như một khoản miễn phí. Tiền của bữa đó biến mất khỏi bản quyết toán mà không ai
// biết là quên nhập.
//
// KHÔNG lọc dòng này khỏi file: file phải phản ánh đúng dữ liệu đang có. Việc cần làm
// là nói cho OP biết trước khi họ gửi file đi.
//
// Chỉ soi dòng PHÁT SINH: dòng chính giá 0 là chuyện bình thường (bữa tự lo, ăn trong
// vé tham quan, "XXX" chờ chốt nhà hàng).

import { nhanChiPhi } from "./dinh-ky-nhom";

export interface DongChiPhiThieuGiaLite {
  id: number;
  mo_ta: string | null;
  don_gia: number | null;
  tien_cong_ty: number | null;
  tien_hdv: number | null;
}

export function timDongPhatSinhThieuGia(
  rows: DongChiPhiThieuGiaLite[],
): { id: number; nhan: string }[] {
  const out: { id: number; nhan: string }[] = [];
  for (const r of rows) {
    const { nhan, laPhatSinh } = nhanChiPhi(r.mo_ta);
    // Dòng chưa đặt tên = OP đang gõ dở, chưa phải chuyện để cảnh báo.
    if (!laPhatSinh || !nhan) continue;
    const tien = Number(r.tien_cong_ty ?? 0) + Number(r.tien_hdv ?? 0);
    if (Number(r.don_gia ?? 0) > 0 && tien > 0) continue;
    out.push({ id: r.id, nhan });
  }
  return out;
}
