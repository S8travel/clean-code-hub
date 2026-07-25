// Số tiền ĐNTT khách sạn.
//
// BẤT BIẾN (khớp MỌI ĐNTT đã duyệt trong DB, method cash + can_tru):
//   so_tien (nghĩa vụ, = allocation vào chi phí) = cấn trừ + tiền mặt
//
// Cấn trừ là HÌNH THỨC TRẢ (gạt khoản NCC còn nợ mình) → TRỪ vào nghĩa vụ để ra
// tiền mặt phải chuyển, KHÔNG cộng thêm. Trước đây chế độ "cọc" đi cộng cấn trừ
// lên trên số cọc (so_tien = cọc + cấn trừ) → phiếu không khớp chi phí/hóa đơn.
//
// - mode "full": nghĩa vụ = toàn bộ còn phải trả (conLai). tiền mặt = conLai − cấn trừ.
// - mode "deposit": nghĩa vụ = SỐ CỌC user nhập (có thể trả 100% bằng cấn trừ →
//   tiền mặt 0). Phần chi phí còn lại (conLai − cọc) để phiếu sau.

export type KSDnttMode = "full" | "deposit";

export interface KSDnttAmountInput {
  /** Còn phải đề nghị = totalKS − đã cọc/đề nghị trước. */
  conLai: number;
  /** Tổng cấn trừ đã chọn (từ panel công nợ). */
  canTruAmount: number;
  mode: KSDnttMode;
  /** Số cọc user nhập — LÀ NGHĨA VỤ của phiếu (chỉ dùng khi mode="deposit"). */
  depositAmount: number;
}

export interface KSDnttAmountResult {
  /** = ĐNTT.so_tien. Cấn trừ NẰM TRONG số này. */
  soTien: number;
  /** Tiền mặt NCC thực nhận = so_tien − cấn trừ (kẹp ≥ 0). */
  tienMat: number;
  /** Chi phí CHƯA đề nghị sau phiếu này = conLai − so_tien (phiếu sau lo). */
  conLaiSau: number;
  hopLe: boolean;
  loi: string | null;
}

export function calcKSDnttAmount(input: KSDnttAmountInput): KSDnttAmountResult {
  const { conLai, canTruAmount, mode, depositAmount } = input;
  const soTien = mode === "full" ? conLai : Math.max(0, depositAmount);
  const tienMat = Math.max(0, soTien - canTruAmount);
  const conLaiSau = Math.max(0, conLai - soTien);

  let loi: string | null = null;
  if (soTien <= 0) loi = "Số tiền phải lớn hơn 0";
  else if (soTien > conLai) loi = "Số tiền vượt phần còn phải thanh toán";
  else if (canTruAmount > soTien) loi = "Cấn trừ vượt quá số tiền đề nghị";

  return { soTien, tienMat, conLaiSau, hopLe: loi === null, loi };
}
