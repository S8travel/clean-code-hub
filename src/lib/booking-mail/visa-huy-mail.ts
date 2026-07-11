// Mail HỦY booking visa. doan_booking_visa KHÔNG có cột email_subject → luôn dựng
// lại subject từ khuôn BookingVisaCard. Lưu ý: khuôn visa là "Xin visa" (không
// phải "Đặt"), ngày đi dd/MM/yyyy (có năm).

import { esc, fmtDateVi, buildHuyMailHtml, type HuyMailRow } from "./huy-mail-shell";

export interface VisaHuyMailInput {
  tenDoan: string;
  tenDonVi: string;
  /** ngay_di của đoàn (YYYY-MM-DD). */
  ngayDi: string | null;
  lyDo?: string | null;
  senderName: string;
  senderPhone?: string | null;
}

/** Khớp BookingVisaCard.openEmailModal:205 — "Xin visa", ngày đi dd/MM/yyyy. */
export function buildVisaDatSubjectFallback(
  input: Pick<VisaHuyMailInput, "tenDoan" | "ngayDi">,
): string {
  const ngayDiStr = input.ngayDi ? fmtDateVi(input.ngayDi) : "";
  return `[S8 Travel] Xin visa – ${input.tenDoan}${ngayDiStr ? ` – ${ngayDiStr}` : ""}`;
}

export function buildVisaHuySubject(input: VisaHuyMailInput): string {
  return `Re: ${buildVisaDatSubjectFallback(input)}`;
}

export function buildVisaHuyEmailHtml(input: VisaHuyMailInput): string {
  const rows: HuyMailRow[] = [
    { label: "Mã đoàn", value: `<strong>${esc(input.tenDoan)}</strong>` },
    { label: "Đơn vị visa", value: esc(input.tenDonVi) },
  ];
  if (input.ngayDi) rows.push({ label: "Ngày đi", value: esc(fmtDateVi(input.ngayDi)) });
  if (input.lyDo?.trim()) rows.push({ label: "Lý do", value: esc(input.lyDo.trim()) });

  return buildHuyMailHtml({
    toName: esc(input.tenDonVi),
    introHtml: `Công ty TNHH Du lịch S8 xin thông báo <strong style="color:#dc2626">HỦY</strong> yêu cầu xin visa của đoàn <strong>${esc(input.tenDoan)}</strong>:`,
    rows,
    closingNote:
      "Kính nhờ Quý đơn vị xác nhận đã hủy yêu cầu trên. Rất mong tiếp tục hợp tác trong các đoàn sắp tới.",
    senderName: input.senderName,
    senderPhone: input.senderPhone,
  });
}

export function buildVisaHuyMailtoBody(input: VisaHuyMailInput): string {
  const ngayLine = input.ngayDi ? `\n- Ngày đi: ${fmtDateVi(input.ngayDi)}` : "";
  return `Kính gửi ${input.tenDonVi},

Công ty TNHH Du lịch S8 xin thông báo HỦY yêu cầu xin visa của đoàn ${input.tenDoan}:${ngayLine}${input.lyDo?.trim() ? `\n- Lý do: ${input.lyDo.trim()}` : ""}

Kính nhờ Quý đơn vị xác nhận đã hủy yêu cầu trên.

${input.senderName}${input.senderPhone ? `\n${input.senderPhone}` : ""}

CÔNG TY TNHH DU LỊCH S8
MST: 0402021137
Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam
Email: s8travel.hddt@gmail.com`;
}
