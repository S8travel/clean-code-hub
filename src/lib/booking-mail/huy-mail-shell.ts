// Vỏ chung cho mail HỦY booking nhà hàng / dịch vụ — cùng letterhead S8, cùng
// khối chữ ký, cùng bảng "Hạng mục / Thông tin" như mail hủy khách sạn.
//
// KS (ks-huy-mail.ts) ra đời trước và tự dựng HTML; KHÔNG refactor nó (đang chạy
// thật). Vỏ này chỉ phục vụ NH/DV để hai builder mới không chép lại 40 dòng
// letterhead — một chỗ sửa địa chỉ/MST công ty.

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** dd/MM/yyyy — dùng trong THÂN mail (rõ năm, tránh nhầm đoàn năm sau). */
export function fmtDateVi(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** dd/MM — CHỈ để dựng lại subject booking gốc. PHẢI khớp cách card format
 *  (`format(..., "dd/MM")`). Thêm năm vào đây = đổi subject = Gmail tách thread. */
export function fmtDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface HuyMailRow {
  label: string;
  /** Đã escape sẵn HOẶC an toàn (số). Người gọi tự esc phần người dùng nhập. */
  value: string;
}

export interface HuyMailShellInput {
  /** "Kính gửi <b>X</b>," — X đã esc. */
  toName: string;
  /** Câu mở, HTML — người gọi tự esc phần động. */
  introHtml: string;
  rows: HuyMailRow[];
  /** Câu nhờ xác nhận ở khối nhấn mạnh đỏ. */
  closingNote: string;
  senderName: string;
  senderPhone?: string | null;
}

const S8_FOOTER = `<strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam<br>
        Email: s8travel.hddt@gmail.com`;

export function buildHuyMailHtml(input: HuyMailShellInput): string {
  const { toName, introHtml, rows, closingNote, senderName, senderPhone } = input;
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px">${esc(r.label)}</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${r.value}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY | MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${toName}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">${introHtml}</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Hạng mục</th>
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Thông tin</th>
        </tr>
        ${rowsHtml}
      </table>
      <div style="margin-top:20px;background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px">
        ${closingNote}
      </div>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${esc(senderName)}</strong>${senderPhone ? `<br>${esc(senderPhone)}` : ""}<br><br>
        ${S8_FOOTER}
      </p>
    </div>
  </div>
</body></html>`;
}
