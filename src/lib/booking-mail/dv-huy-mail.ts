// Mail HỦY booking dịch vụ — mirror ks-huy-mail.ts. Cho nút "Hủy" trên
// BookingDVCard (tab Booking DV).
//
// THREADING: subject = `Re: <subject gốc>` (doan_booking_dv.email_subject). Rỗng
// → dựng lại đúng khuôn BookingDVCard.openEmailModal, lệch = Gmail tách thread.
//
// Ngày trong subject = NGÀY DÙNG DỊCH VỤ (từ dich_vu_list, sort ASC), KHÔNG phải
// ngày đi đoàn — giống hệt card.

import { esc, fmtDateVi, fmtDateShort, buildHuyMailHtml, type HuyMailRow } from "./huy-mail-shell";

export interface DvHuyDichVu {
  ten_dv: string;
  ngay_date: string | null;
  so_khach?: number | null;
}

export interface DvHuyMailInput {
  tenDoan: string;
  tenNhaCungCap: string;
  dichVuList: DvHuyDichVu[];
  lyDo?: string | null;
  senderName: string;
  senderPhone?: string | null;
}

/** Chuỗi ngày cho subject: 1 ngày → dd/MM; nhiều ngày → dd/MM–dd/MM (en-dash).
 *  Khớp BookingDVCard.openEmailModal (dòng 282-287). */
export function buildDvDateStr(dichVuList: DvHuyDichVu[]): string {
  const dates = [...new Set(dichVuList.map((d) => d.ngay_date).filter((d): d is string => !!d))].sort();
  if (dates.length === 0) return "";
  if (dates.length === 1) return fmtDateShort(dates[0]);
  return `${fmtDateShort(dates[0])}–${fmtDateShort(dates[dates.length - 1])}`;
}

/** Dựng lại subject gốc — PHẢI KHỚP BookingDVCard.openEmailModal:290 (en-dash `–`). */
export function buildDvDatSubjectFallback(
  input: Pick<DvHuyMailInput, "tenDoan" | "tenNhaCungCap" | "dichVuList">,
): string {
  const dvDateStr = buildDvDateStr(input.dichVuList);
  const ncc = input.tenNhaCungCap || "";
  return `[S8 Travel] Đặt dịch vụ – ${input.tenDoan}${dvDateStr ? ` – ${dvDateStr}` : ""}${ncc ? ` – ${ncc}` : ""}`;
}

export function buildDvHuySubject(input: DvHuyMailInput, originalSubject?: string | null): string {
  const base = originalSubject?.trim() || buildDvDatSubjectFallback(input);
  return base.startsWith("Re: ") ? base : `Re: ${base}`;
}

/** Danh sách dịch vụ trong THÂN mail: "Tên (dd/MM/yyyy, N khách)". */
function dichVuLine(d: DvHuyDichVu): string {
  const parts: string[] = [];
  if (d.ngay_date) parts.push(fmtDateVi(d.ngay_date));
  if (d.so_khach != null && d.so_khach > 0) parts.push(`${d.so_khach} khách`);
  return `${d.ten_dv}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

export function buildDvHuyEmailHtml(input: DvHuyMailInput): string {
  const rows: HuyMailRow[] = [
    { label: "Mã đoàn", value: `<strong>${esc(input.tenDoan)}</strong>` },
    { label: "Nhà cung cấp", value: esc(input.tenNhaCungCap) },
  ];
  if (input.dichVuList.length > 0) {
    const items = input.dichVuList
      .map((d) => `<li style="margin:2px 0">${esc(dichVuLine(d))}</li>`)
      .join("");
    rows.push({
      label: "Dịch vụ",
      value: `<ul style="margin:0;padding-left:18px;list-style:disc">${items}</ul>`,
    });
  }
  if (input.lyDo?.trim()) rows.push({ label: "Lý do", value: esc(input.lyDo.trim()) });

  return buildHuyMailHtml({
    toName: esc(input.tenNhaCungCap),
    introHtml: `Công ty TNHH Du lịch S8 xin thông báo <strong style="color:#dc2626">HỦY</strong> booking dịch vụ của đoàn <strong>${esc(input.tenDoan)}</strong>:`,
    rows,
    closingNote:
      "Kính nhờ Quý nhà cung cấp xác nhận đã hủy booking trên. Rất mong tiếp tục hợp tác trong các đoàn sắp tới.",
    senderName: input.senderName,
    senderPhone: input.senderPhone,
  });
}

export function buildDvHuyMailtoBody(input: DvHuyMailInput): string {
  const dvLines = input.dichVuList.map((d) => `\n- ${dichVuLine(d)}`).join("");
  return `Kính gửi ${input.tenNhaCungCap},

Công ty TNHH Du lịch S8 xin thông báo HỦY booking dịch vụ của đoàn ${input.tenDoan}:${dvLines}${input.lyDo?.trim() ? `\n\nLý do: ${input.lyDo.trim()}` : ""}

Kính nhờ Quý nhà cung cấp xác nhận đã hủy booking trên.

${input.senderName}${input.senderPhone ? `\n${input.senderPhone}` : ""}

CÔNG TY TNHH DU LỊCH S8
MST: 0402021137
Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam
Email: s8travel.hddt@gmail.com`;
}
