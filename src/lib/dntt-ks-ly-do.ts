/**
 * Dòng chú giải ("lý do") trên bản in ĐNTT khách sạn / dịch vụ lưu trú.
 *
 * Bẫy đã gặp (28/08/2026): phiếu gộp nhiều dịch vụ (vd du thuyền + tàu hoả trên
 * cùng một đoàn) chỉ in lý do của dòng ĐẦU TIÊN → chú giải ghi tên đúng
 * MỘT dịch vụ trong khi phiếu đòi tiền cho cả hai. Phiếu gộp thì nói ngắn gọn
 * "thanh toán tiền cho đoàn X", không nêu tên dịch vụ nào cả — chi tiết đã nằm
 * trong bảng bên dưới.
 */
export interface LyDoDNTTKSInput {
  tenDoan: string;
  soKhach?: number | null;
  /** Tên khách sạn / dịch vụ — chỉ dùng khi phiếu chỉ có 1 dịch vụ. */
  tenKS?: string | null;
  laCoc?: boolean | null;
  /** true khi phiếu gộp từ 2 dịch vụ trở lên. */
  gopNhieuDichVu?: boolean;
}

export function computeLyDoDNTTKS(input: LyDoDNTTKSInput): string {
  const { tenDoan, soKhach, tenKS, laCoc, gopNhieuDichVu } = input;
  const suffix = soKhach ? ` - ${soKhach} khách` : "";

  if (gopNhieuDichVu) return `Đề nghị thanh toán tiền cho đoàn ${tenDoan}${suffix}`;

  const ten = (tenKS ?? "").trim();
  const coc = laCoc ? " cọc" : "";
  if (!ten) return `Đề nghị thanh toán tiền${coc} cho đoàn ${tenDoan}${suffix}`;
  return `Đề nghị thanh toán tiền${coc} khách sạn ${ten} cho đoàn ${tenDoan}${suffix}`;
}
