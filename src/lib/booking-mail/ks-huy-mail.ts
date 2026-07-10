// Mail HỦY booking khách sạn — 1 nguồn dựng nội dung cho cả 2 lối vào:
//   - Guard "đổi khách sạn" ở Điều tour (DoiKsPhiHuyModal)
//   - Nút "Hủy booking" trên card ở tab Booking KS
//
// Vì sao tồn tại: trước 07/2026 nhánh gửi mail `loai:"huy"` (use-booking-ks.ts) có
// code nhưng KHÔNG có caller nào → đổi/hủy KS xong OP vẫn phải mở Gmail báo tay.
// Đó là lý do gốc khiến OP bỏ booking trên hệ thống (guard chỉ là giọt nước cuối).
//
// THREADING: Resend ghi đè Message-ID nên In-Reply-To custom vô dụng — Gmail gom
// thread theo Subject + From. Vì vậy subject mail hủy PHẢI là `Re: <subject gốc>`
// (lưu ở doan_booking_ks.email_subject lúc gửi đặt trước/final). Không có subject
// gốc (booking cũ trước khi cột này ra đời) → dựng lại đúng khuôn cũ để vẫn khớp.
//
// Đợt 3 sẽ chuyển nốt builder đặt-trước/update từ BookingKSTab về thư mục này
// (mirror nh-mail.ts) khi làm gửi hàng loạt. Nay CHỈ tách phần hủy để không đụng
// vào mail đặt-trước đang chạy thật trên 712 dòng.

export interface KsHuyMailInput {
  tenDoan: string;
  khachSanTen: string;
  /** Các đêm đang đặt (YYYY-MM-DD, đã sort). Rỗng → bỏ dòng ngày trong mail. */
  roomDates: string[];
  /** Lý do hủy — OP nhập ở modal. Rỗng → bỏ dòng lý do. */
  lyDo?: string | null;
  senderName: string;
  senderPhone?: string | null;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** dd/MM/yyyy — dùng trong THÂN mail hủy (rõ năm, tránh nhầm đoàn năm sau). */
export function fmtDateVi(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** dd/MM — CHỈ dùng dựng lại subject đặt-trước. PHẢI khớp `fmtDate` của
 *  BookingKSTab.tsx:63 (`format(..., "dd/MM")`). Thêm năm vào đây là đổi subject
 *  → Gmail tách thread mới → mail hủy không nằm cùng luồng với booking gốc. */
function fmtDateSubject(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Khuôn subject mail đặt-trước (BookingKSTab.openEmailModal) — dùng để dựng lại khi
 *  booking cũ chưa lưu email_subject. Giữ đồng bộ với chỗ đó, lệch là vỡ thread Gmail. */
export function buildKsDatTruocSubject(input: Pick<KsHuyMailInput, "tenDoan" | "khachSanTen" | "roomDates">): string {
  const datesStr = input.roomDates.length > 0
    ? `${input.roomDates.map(fmtDateSubject).join(", ")} (${input.roomDates.length} đêm)`
    : "";
  return `[S8 Travel] Đặt phòng – ${input.tenDoan} – ${input.khachSanTen}${datesStr ? ` – ${datesStr}` : ""}`;
}

/**
 * Subject mail hủy = `Re: <subject gốc>` để rơi đúng thread Gmail của booking.
 * `originalSubject` lấy từ doan_booking_ks.email_subject. Đã có tiền tố `Re: ` rồi
 * thì KHÔNG chồng thêm (mail cập nhật cũng lưu subject dạng Re:).
 */
export function buildKsHuySubject(input: KsHuyMailInput, originalSubject?: string | null): string {
  const base = originalSubject?.trim() || buildKsDatTruocSubject(input);
  return base.startsWith("Re: ") ? base : `Re: ${base}`;
}

/** HTML mail hủy — body-only wrapper giống mail đặt-trước (header S8 + bảng + chữ ký). */
export function buildKsHuyEmailHtml(input: KsHuyMailInput): string {
  const { tenDoan, khachSanTen, roomDates, lyDo, senderName, senderPhone } = input;

  const checkIn = roomDates[0] ?? null;
  const checkOut = roomDates.length > 0 ? nextDay(roomDates[roomDates.length - 1]) : null;
  const ngayRow = checkIn && checkOut
    ? `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Ngày đã đặt</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${esc(fmtDateVi(checkIn))} – ${esc(fmtDateVi(checkOut))} (${roomDates.length} đêm)</td></tr>`
    : "";
  const lyDoRow = lyDo?.trim()
    ? `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Lý do</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${esc(lyDo.trim())}</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY | MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${esc(khachSanTen)}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin thông báo <strong style="color:#dc2626">HỦY</strong> booking đặt phòng của đoàn <strong>${esc(tenDoan)}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Hạng mục</th>
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Thông tin</th>
        </tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Mã đoàn</td><td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${esc(tenDoan)}</strong></td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Khách sạn</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${esc(khachSanTen)}</td></tr>
        ${ngayRow}
        ${lyDoRow}
      </table>
      <div style="margin-top:20px;background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px">
        Kính nhờ Quý khách sạn xác nhận đã hủy booking trên. Rất mong tiếp tục hợp tác trong các đoàn sắp tới.
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${esc(senderName)}</strong>${senderPhone ? `<br>${esc(senderPhone)}` : ""}<br><br>
        <strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam<br>
        Email: s8travel.hddt@gmail.com
      </p>
    </div>
  </div>
</body></html>`;
}

/** Bản text cho mailto: fallback (EmailPreviewModal.onMailtoFallback). */
export function buildKsHuyMailtoBody(input: KsHuyMailInput): string {
  const { tenDoan, khachSanTen, roomDates, lyDo, senderName, senderPhone } = input;
  const ngayLine = roomDates.length > 0
    ? `\n- Ngày đã đặt: ${fmtDateVi(roomDates[0])} -> ${fmtDateVi(nextDay(roomDates[roomDates.length - 1]))} (${roomDates.length} đêm)`
    : "";
  return `Kính gửi ${khachSanTen},

Công ty TNHH Du lịch S8 xin thông báo HỦY booking đặt phòng của đoàn ${tenDoan}:${ngayLine}${lyDo?.trim() ? `\n- Lý do: ${lyDo.trim()}` : ""}

Kính nhờ Quý khách sạn xác nhận đã hủy booking trên.

${senderName}${senderPhone ? `\n${senderPhone}` : ""}

CÔNG TY TNHH DU LỊCH S8
MST: 0402021137
Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam
Email: s8travel.hddt@gmail.com`;
}
