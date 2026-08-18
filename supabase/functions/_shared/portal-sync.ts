// Quyết định dòng nào được đẩy sang cổng đối tác, dòng nào phải gỡ khỏi cổng, và
// dòng nào bị bỏ qua vì lý do gì. Tách riêng khỏi edge function để test được.
//
// Ba khái niệm KHÁC NHAU, trước đây bị gộp làm một nên sinh lỗi:
//  - HIỂN THỊ: đối tác được phép thấy dòng này. Không nằm trong danh sách này thì
//    bị XOÁ khỏi cổng (tắt chia sẻ = thu hồi thật, không phải chỉ ngừng cập nhật).
//  - CẦN DỰNG LẠI: nội dung cần build lại và gửi sang lần này. Đoàn về lâu rồi thì
//    thôi không dựng lại nữa cho đỡ tốn, NHƯNG vẫn nằm trong danh sách hiển thị —
//    ngừng cập nhật khác với biến mất.
//  - BỎ QUA: đủ điều kiện lẽ ra phải đi mà thiếu thứ gì đó. Phải nêu lý do, vì
//    im lặng bỏ qua chính là thứ làm OP tưởng hệ thống hỏng.

export interface BoQua {
  loai: "bao_gia" | "doan";
  id: number;
  ly_do: string;
}

export interface KetQuaLoc<T> {
  /** id bên CRM của những dòng đối tác được phép thấy. */
  hienThi: number[];
  /** Dòng cần dựng nội dung và đẩy lần này. */
  canDay: T[];
  boQua: BoQua[];
}

export interface BaoGiaNguon {
  id: number;
  agent_id: number | null;
  portal_noi_dung: unknown;
}

export interface DoanNguon {
  id: number;
  agent_id: number | null;
  trang_thai: string | null;
  ngay_ve: string | null;
  /** Đã từng đẩy sang cổng chưa — chưa thì phải đẩy dù nằm ngoài cửa sổ cập nhật. */
  portal_pushed_at: string | null;
}

/** Số ngày sau khi đoàn về thì thôi không dựng lại chương trình nữa.
 *  Dòng vẫn nằm bên cổng, chỉ là không cập nhật thêm. */
export const NGAY_GIU_CAP_NHAT_DOAN = 30;

export function locBaoGia(rows: BaoGiaNguon[]): KetQuaLoc<BaoGiaNguon> {
  const hienThi: number[] = [];
  const canDay: BaoGiaNguon[] = [];
  const boQua: BoQua[] = [];

  for (const r of rows) {
    if (r.agent_id == null) {
      boQua.push({ loai: "bao_gia", id: r.id, ly_do: "chưa chọn Đối tác bán nên không biết đưa cho ai xem" });
      continue;
    }
    if (r.portal_noi_dung == null) {
      boQua.push({ loai: "bao_gia", id: r.id, ly_do: "chưa chốt bảng giá (bấm Gửi khách)" });
      continue;
    }
    hienThi.push(r.id);
    canDay.push(r);
  }
  return { hienThi, canDay, boQua };
}

/** `homNay` dạng YYYY-MM-DD. So sánh chuỗi ngày ISO là so sánh đúng thứ tự thời gian. */
export function locDoan(
  rows: DoanNguon[],
  homNay: string,
  soNgayGiuCapNhat: number = NGAY_GIU_CAP_NHAT_DOAN,
): KetQuaLoc<DoanNguon> {
  const hienThi: number[] = [];
  const canDay: DoanNguon[] = [];
  const boQua: BoQua[] = [];

  const moc = new Date(`${homNay}T00:00:00Z`);
  moc.setUTCDate(moc.getUTCDate() - soNgayGiuCapNhat);
  const mocStr = moc.toISOString().slice(0, 10);

  for (const r of rows) {
    if (r.agent_id == null) {
      boQua.push({ loai: "doan", id: r.id, ly_do: "đoàn chưa gắn đối tác" });
      continue;
    }
    // Đoàn hủy phải BIẾN MẤT khỏi cổng, không chỉ ngừng cập nhật — nên không vào
    // danh sách hiển thị, và vòng xoá sẽ gỡ nó đi.
    if (r.trang_thai === "huy") {
      boQua.push({ loai: "doan", id: r.id, ly_do: "đoàn đã hủy — đã gỡ khỏi cổng" });
      continue;
    }
    hienThi.push(r.id);

    // Chưa từng đẩy thì PHẢI đẩy, kể cả đoàn về đã lâu — nếu không, đoàn cũ sẽ
    // không bao giờ xuất hiện bên cổng.
    const chuaTungDay = r.portal_pushed_at == null;
    // Chưa có ngày về (đoàn mới dựng) thì vẫn cập nhật bình thường.
    if (chuaTungDay || r.ngay_ve == null || r.ngay_ve >= mocStr) {
      canDay.push(r);
    } else {
      boQua.push({
        loai: "doan",
        id: r.id,
        ly_do: `đoàn về ngày ${r.ngay_ve}, quá ${soNgayGiuCapNhat} ngày nên ngừng cập nhật (vẫn xem được bản cũ)`,
      });
    }
  }
  return { hienThi, canDay, boQua };
}

/** Chia mảng thành từng lô — đẩy vài trăm đoàn một lượt thì phải cắt nhỏ, không
 *  thì một request quá to sẽ chết cả lô. */
export function chiaLo<T>(rows: T[], coLo: number): T[][] {
  const ra: T[][] = [];
  for (let i = 0; i < rows.length; i += coLo) ra.push(rows.slice(i, i + coLo));
  return ra;
}
