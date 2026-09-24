// Nhật ký + cảnh báo cho vòng đời ĐNTT (hủy phiếu, ghi nhận / gỡ thanh toán).
//
// Bối cảnh: nhật ký hoạt động của đoàn chỉ ghi "tạo" và "duyệt" ĐNTT. Hủy phiếu
// và ghi nhận thanh toán KHÔNG ghi gì → nhìn tab Log thấy phiếu được duyệt rồi
// biến mất, không biết ai hủy, lúc nào, tiền đi đâu. Đã xảy ra thật và phải truy
// ngược bằng cách ghép nhiều bảng mới dựng lại được diễn biến.
//
// Tách thuần ở đây để test được mà không cần render / gọi DB.

export interface NccRef {
  id: number | null;
  ten: string | null;
}

/**
 * Chọn cặp (id, tên) nhà cung cấp cho công nợ sinh ra khi hủy ĐNTT.
 *
 * `tuPhieu` = NCC suy ra từ phiếu/dòng chi phí; khi dòng chưa gắn NCC thì hàm
 * resolve vẫn trả về TÊN (fallback về mô tả dòng, vd "<tên nhà hàng> (tối)") dù
 * id là null. `opChon` = NCC do OP chọn tay trong ô hủy.
 *
 * id và tên PHẢI đi cùng một nguồn. Trước đây lấy rời (`id` từ nguồn này, `ten`
 * từ nguồn kia) nên công nợ mang đúng id NCC mà tên lại là mô tả bữa ăn — trang
 * Công nợ hiện tên bữa ăn thay vì tên pháp nhân. Đã gặp trên dữ liệu thật.
 */
export function chonNccChoCongNo(tuPhieu: NccRef, opChon: NccRef): NccRef {
  if (tuPhieu.id != null) return { id: tuPhieu.id, ten: tuPhieu.ten };
  if (opChon.id != null) return { id: opChon.id, ten: opChon.ten };
  // Không nguồn nào có id (mode 'hoan_tien' cho phép) → giữ tên mô tả làm dấu vết.
  return { id: null, ten: tuPhieu.ten ?? opChon.ten ?? null };
}

function tien(n: number): string {
  return n.toLocaleString("vi-VN") + " VND";
}

const NHAN_TRANG_THAI: Record<string, string> = {
  cho_duyet: "chờ duyệt",
  da_duyet: "đã duyệt",
  tu_choi: "đã từ chối",
  da_huy: "đã hủy",
};

export interface HuyDnttArgs {
  id: number;
  soTien: number;
  trangThaiDuyet: string | null;
  /** Tổng tiền mặt đã chi cho phiếu (KHÔNG tính cấn trừ công nợ). */
  daChiCash: number;
  mode?: "cong_no" | "hoan_tien";
}

/** Câu mô tả ghi vào nhật ký hoạt động khi hủy ĐNTT. */
export function moTaHuyDntt({ id, soTien, trangThaiDuyet, daChiCash, mode }: HuyDnttArgs): string {
  const dau = `Hủy ĐNTT #${id} — ${tien(soTien)}`;
  if (daChiCash > 0) {
    const xuLy = mode === "hoan_tien"
      ? "nhà cung cấp hoàn tiền"
      : mode === "cong_no"
        ? "ghi công nợ"
        : "chưa chọn cách xử lý";
    return `${dau} (đã chi ${tien(daChiCash)} → ${xuLy})`;
  }
  const nhan = NHAN_TRANG_THAI[trangThaiDuyet ?? ""] ?? trangThaiDuyet ?? "không rõ trạng thái";
  return `${dau} (${nhan}, chưa chi tiền)`;
}

export interface CanhBaoHuyArgs {
  trangThaiDuyet: string | null;
  /** Tổng tiền mặt đã chi cho phiếu. */
  daChiCash: number;
}

/**
 * Có cần cảnh báo "hủy là mất chữ ký duyệt" trong ô hủy không?
 *
 * Chỉ đúng một ca gây mất công: phiếu ĐÃ được kế toán duyệt nhưng CHƯA chi đồng
 * nào. Hủy xong là mất chữ ký duyệt, không có đường "gỡ duyệt" hay sửa lại —
 * phải tạo phiếu mới và trình duyệt từ đầu.
 *
 * Phiếu `cho_duyet` không cảnh báo (chưa ai duyệt, hủy không mất gì). Phiếu đã
 * chi tiền cũng không — ô hủy lúc đó đã bắt chọn công nợ / hoàn tiền rồi.
 *
 * Trả boolean (không trả sẵn câu chữ) để phần hiển thị còn đi qua `t()` và dịch
 * được sang tiếng Trung.
 */
export function canCanhBaoHuyDaDuyet({ trangThaiDuyet, daChiCash }: CanhBaoHuyArgs): boolean {
  if (daChiCash > 0) return false;
  return trangThaiDuyet === "da_duyet";
}

const NHAN_HINH_THUC: Record<string, string> = {
  cash: "tiền mặt / chuyển khoản",
  can_tru: "cấn trừ công nợ",
  voucher: "voucher",
};

export interface ThanhToanArgs {
  dnttId: number;
  soTien: number;
  method: string;
  /** Nguồn tiền (tài khoản chi) nếu có. */
  nguon?: string | null;
}

/** Câu mô tả ghi vào nhật ký khi ghi nhận một lần thanh toán. */
export function moTaThanhToan({ dnttId, soTien, method, nguon }: ThanhToanArgs): string {
  const hinhThuc = NHAN_HINH_THUC[method] ?? method;
  const duoi = nguon ? ` — ${nguon}` : "";
  return `Ghi nhận thanh toán ĐNTT #${dnttId}: ${tien(soTien)} (${hinhThuc})${duoi}`;
}

/** Câu mô tả ghi vào nhật ký khi gỡ một lần thanh toán đã ghi nhận. */
export function moTaGoThanhToan({ dnttId, soTien, method }: Omit<ThanhToanArgs, "nguon">): string {
  const hinhThuc = NHAN_HINH_THUC[method] ?? method;
  return `Gỡ thanh toán ĐNTT #${dnttId}: ${tien(soTien)} (${hinhThuc})`;
}
