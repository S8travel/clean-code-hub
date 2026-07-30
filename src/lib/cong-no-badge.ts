// Tách công nợ của một nhóm chi phí thành 3 con số để hiển thị badge.
//
// Vì sao tách "đã cấn trừ" ra thành số riêng thay vì bỏ qua: trước đây badge CN chỉ
// hiện công nợ `con_du` (còn dư). Cấn trừ hết → badge biến mất sạch, nên nhìn thẻ chi
// phí KHÔNG cách nào biết khoản này từng được ghi công nợ hay chưa — kế toán phải mở
// trang Công nợ đối chiếu mới biết, và dễ tưởng là chưa xử lý gì.
// Nay giữ badge cho cả phần đã cấn trừ, chỉ khác nhãn + màu nhạt (lịch sử, không phải
// việc cần làm).
//
// Ba số KHÔNG chồng nhau:
//   conDu     = số CÒN LẠI của công nợ `con_du`  → còn dùng cấn trừ được (việc cần làm)
//   daCanTru  = số GỐC của công nợ `da_can_tru`  → đã dùng hết (lịch sử)
//   hoanTien  = số GỐC của công nợ `da_hoan_tien` → NCC đã trả lại tiền mặt
// `con_du` dùng số CÒN LẠI vì nó có thể đã cấn trừ một phần; hai loại kia đã chốt nên
// lấy số gốc.

export interface CongNoBadgeRow {
  trang_thai: string;
  so_tien_goc?: number | null;
  so_tien_con_lai?: number | null;
}

export interface CongNoBadge {
  conDu: number;
  daCanTru: number;
  hoanTien: number;
}

export function splitCongNoBadge(rows: CongNoBadgeRow[]): CongNoBadge {
  let conDu = 0;
  let daCanTru = 0;
  let hoanTien = 0;
  for (const c of rows) {
    if (c.trang_thai === "con_du") conDu += Number(c.so_tien_con_lai ?? 0);
    else if (c.trang_thai === "da_can_tru") daCanTru += Number(c.so_tien_goc ?? 0);
    else if (c.trang_thai === "da_hoan_tien") hoanTien += Number(c.so_tien_goc ?? 0);
  }
  return { conDu, daCanTru, hoanTien };
}
