// Helper HTML cho mail "Gửi cập nhật" — banner cam + callout lời nhắn user.
// Mail update KHÔNG phải booking mới — banner giúp NCC phân biệt rõ.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildUpdateBanner(): string {
  return `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;margin-bottom:16px;border-radius:0 4px 4px 0">
    <strong style="color:#92400e;font-size:14px">📢 EMAIL CẬP NHẬT BOOKING</strong><br>
    <span style="color:#78350f;font-size:13px">Đây không phải booking mới — vui lòng tham chiếu mail booking gốc trong cùng thread và lưu ý các thay đổi sau:</span>
  </div>`;
}

export function buildUpdateNoteCallout(note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return "";
  return `<div style="background:#fffbeb;border-left:3px solid #d97706;padding:12px 16px;margin-bottom:16px;border-radius:0 4px 4px 0;font-size:14px">
    <strong style="color:#92400e">Thay đổi:</strong> ${escapeHtml(trimmed)}
  </div>`;
}

// Footer rút gọn cho mail update — chỉ tên người gửi + S8 Travel + MST.
export function buildUpdateFooter(senderName: string, senderPhone?: string | null): string {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
    <p style="margin:0;font-size:13px;color:#475569;line-height:1.6">
      <strong>${escapeHtml(senderName)}</strong>${senderPhone ? ` · ${escapeHtml(senderPhone)}` : ""}<br>
      <strong style="color:#0f172a">S8 Travel</strong> · MST: 0402021137
    </p>`;
}

// Wrapper HTML đầy đủ cho mail update (header logo gọn + banner + callout + body + footer).
export function buildUpdateEmailHtml(opts: {
  greeting: string;       // "Kính gửi Nhà hàng XYZ,"
  intro: string;          // "Cập nhật booking đoàn ABC:"
  keyFieldsHtml: string;  // HTML cho các key fields (table hoặc list)
  note: string;
  senderName: string;
  senderPhone?: string | null;
  referenceLine?: string; // mặc định: "(Chi tiết khác: vui lòng xem mail booking gốc.)"
}): string {
  const refLine = opts.referenceLine ?? "(Chi tiết khác: vui lòng xem mail booking gốc.)";
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:580px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:16px 24px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:16px">CÔNG TY TNHH DU LỊCH S8</h2>
    </div>
    <div style="padding:20px 24px">
      ${buildUpdateBanner()}
      ${buildUpdateNoteCallout(opts.note)}
      <p style="margin:0 0 6px;font-size:14px">${escapeHtml(opts.greeting)}</p>
      <p style="margin:0 0 14px;color:#475569;font-size:14px">${escapeHtml(opts.intro)}</p>
      ${opts.keyFieldsHtml}
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;font-style:italic">${escapeHtml(refLine)}</p>
      ${buildUpdateFooter(opts.senderName, opts.senderPhone ?? null)}
    </div>
  </div>
</body></html>`;
}

// Helper cho key fields list (•  Label: Value)
export function buildKeyFieldsList(items: Array<{ label: string; value: string }>): string {
  const rows = items
    .filter((it) => it.value && it.value !== "—")
    .map(
      (it) =>
        `<li style="margin:4px 0;font-size:14px"><span style="color:#64748b">${escapeHtml(it.label)}:</span> <strong>${escapeHtml(it.value)}</strong></li>`,
    )
    .join("");
  return `<ul style="margin:0 0 8px;padding-left:18px;list-style:disc">${rows}</ul>`;
}
