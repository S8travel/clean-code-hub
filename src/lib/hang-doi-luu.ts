/** Hàng đợi MỘT lượt cho autosave Điều tour: không bao giờ có 2 lượt lưu cùng một đoàn
 *  chạy chồng nhau.
 *
 *  Vì sao cần: autosave nổ 1,5 giây sau mỗi lần sửa, còn một lượt lưu (kiểm tra + ~50
 *  lệnh nối đuôi) mất ~7 giây. OP gõ liên tục → lượt sau bắt đầu khi lượt trước chưa
 *  xong (đo được trên log 02/10/2026): gấp đôi tải, và hai lượt cùng ghi `doan_ngay` /
 *  `doan_ngay_item` / `doan_chi_phi` của cùng một đoàn theo thứ tự xen kẽ.
 *
 *  Cách làm: lượt đang chạy thì yêu cầu mới chỉ ĐÁNH DẤU; lượt cũ xong mới chạy thêm
 *  ĐÚNG MỘT lượt nữa với dữ liệu mới nhất (bao nhiêu yêu cầu dồn lại cũng gộp làm một).
 *
 *  Kèm bộ đếm số lần sửa: lượt lưu chụp mốc lúc bắt đầu; lúc xong nếu OP đã sửa thêm thì
 *  màn hình MỚI hơn bản vừa ghi → caller KHÔNG được coi là "hết sửa dở" (kẻo refetch đè
 *  mất phần OP vừa gõ trong lúc chờ).
 */
export interface HangDoiLuu {
  /** Tới giờ lưu. true = chạy ngay; false = đang có lượt khác → đã hẹn chạy lại khi xong. */
  batDau(): boolean;
  /** Lượt lưu kết thúc (xong / lỗi / dừng ở bước hỏi OP).
   *  true = trong lúc chạy có yêu cầu lưu mới → caller chạy thêm một lượt. */
  ketThuc(): boolean;
  /** OP vừa sửa một thứ có hẹn autosave. */
  daSua(): void;
  /** Mốc số lần sửa hiện tại — chụp lúc bắt đầu một lượt lưu. */
  readonly moc: number;
  /** Từ mốc đã chụp tới giờ OP có sửa thêm không. */
  coSuaSau(moc: number): boolean;
  readonly dangLuu: boolean;
}

export function taoHangDoiLuu(): HangDoiLuu {
  let dangLuu = false;
  let canChayLai = false;
  let soLanSua = 0;
  return {
    batDau() {
      if (dangLuu) {
        canChayLai = true;
        return false;
      }
      dangLuu = true;
      return true;
    },
    ketThuc() {
      dangLuu = false;
      const chayLai = canChayLai;
      canChayLai = false;
      return chayLai;
    },
    daSua() {
      soLanSua++;
    },
    get moc() {
      return soLanSua;
    },
    coSuaSau(moc: number) {
      return soLanSua !== moc;
    },
    get dangLuu() {
      return dangLuu;
    },
  };
}
