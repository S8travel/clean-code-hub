// Mail HỦY booking xe. doan_booking_xe KHÔNG có cột email_subject → mail hủy LUÔN
// dựng lại subject từ khuôn BookingXeCard (giống mọi lần card mở modal update).
// Threading dựa trên khuôn ổn định (đoàn/xe/ngày đi ít đổi trước khi hủy).

import { esc, fmtDateVi, buildHuyMailHtml, type HuyMailRow } from "./huy-mail-shell";
import { formatXeForEmail } from "@/lib/xe-email";

export interface XeHuyMailInput {
  tenDoan: string;
  tenNhaXe: string;
  /** ten_xe của loại xe (để formatXeForEmail). */
  tenXe: string | null;
  soCho: number | null;
  /** ngay_di của đoàn (YYYY-MM-DD). */
  ngayDi: string | null;
  lyDo?: string | null;
  senderName: string;
  senderPhone?: string | null;
}

/** Khớp BookingXeCard.openEmailModal:238 — en-dash `–`, ngày đi dd/MM/yyyy (CÓ năm). */
export function buildXeDatSubjectFallback(
  input: Pick<XeHuyMailInput, "tenDoan" | "tenXe" | "soCho" | "ngayDi">,
): string {
  const xeStr = formatXeForEmail(input.tenXe, input.soCho);
  const xeSubjectPart = xeStr && xeStr !== "—" ? ` – ${xeStr}` : "";
  const ngayDiStr = input.ngayDi ? fmtDateVi(input.ngayDi) : "";
  return `[S8 Travel] Đặt xe – ${input.tenDoan}${xeSubjectPart}${ngayDiStr ? ` – ${ngayDiStr}` : ""}`;
}

export function buildXeHuySubject(input: XeHuyMailInput): string {
  // Xe không lưu subject gốc → luôn dựng lại rồi Re:.
  return `Re: ${buildXeDatSubjectFallback(input)}`;
}

export function buildXeHuyEmailHtml(input: XeHuyMailInput): string {
  const xeStr = formatXeForEmail(input.tenXe, input.soCho);
  const rows: HuyMailRow[] = [
    { label: "Mã đoàn", value: `<strong>${esc(input.tenDoan)}</strong>` },
    { label: "Nhà xe", value: esc(input.tenNhaXe) },
  ];
  if (xeStr && xeStr !== "—") rows.push({ label: "Xe", value: esc(xeStr) });
  if (input.ngayDi) rows.push({ label: "Ngày đi", value: esc(fmtDateVi(input.ngayDi)) });
  if (input.lyDo?.trim()) rows.push({ label: "Lý do", value: esc(input.lyDo.trim()) });

  return buildHuyMailHtml({
    toName: esc(input.tenNhaXe),
    introHtml: `Công ty TNHH Du lịch S8 xin thông báo <strong style="color:#dc2626">HỦY</strong> booking đặt xe của đoàn <strong>${esc(input.tenDoan)}</strong>:`,
    rows,
    closingNote:
      "Kính nhờ Quý nhà xe xác nhận đã hủy booking trên. Rất mong tiếp tục hợp tác trong các đoàn sắp tới.",
    senderName: input.senderName,
    senderPhone: input.senderPhone,
  });
}

export function buildXeHuyMailtoBody(input: XeHuyMailInput): string {
  const xeStr = formatXeForEmail(input.tenXe, input.soCho);
  const xeLine = xeStr && xeStr !== "—" ? `\n- Xe: ${xeStr}` : "";
  const ngayLine = input.ngayDi ? `\n- Ngày đi: ${fmtDateVi(input.ngayDi)}` : "";
  return `Kính gửi ${input.tenNhaXe},

Công ty TNHH Du lịch S8 xin thông báo HỦY booking đặt xe của đoàn ${input.tenDoan}:${xeLine}${ngayLine}${input.lyDo?.trim() ? `\n- Lý do: ${input.lyDo.trim()}` : ""}

Kính nhờ Quý nhà xe xác nhận đã hủy booking trên.

${input.senderName}${input.senderPhone ? `\n${input.senderPhone}` : ""}

CÔNG TY TNHH DU LỊCH S8
MST: 0402021137
Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam
Email: s8travel.hddt@gmail.com`;
}
