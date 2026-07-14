// Mail HỦY booking du thuyền (tau_ngay) — dùng chung bảng doan_booking_nh nhưng
// hủy 2 pha qua final_status. Khuôn subject "Đặt tàu" khác nhà hàng thường.
//
// THREADING: subject = `Re: <subject gốc>` (doan_booking_nh.email_subject, có lưu
// vì tàu dùng useSendNHBookingEmail). Rỗng → dựng lại đúng khuôn TauNgayCard.

import { fmtNgayTau } from "@/hooks/use-booking-tau";
import { esc, buildHuyMailHtml, type HuyMailRow } from "./huy-mail-shell";

export interface TauHuyMailInput {
  tenDoan: string;
  nhaHangTen: string;
  ngayDate: string | null;
  ngaySo: number;
  buaAn: "trua" | "toi";
  soKhach?: number | null;
  lyDo?: string | null;
  senderName: string;
  senderPhone?: string | null;
}

const buaSubjectOf = (buaAn: "trua" | "toi") => (buaAn === "trua" ? "Trưa" : "Tối");

/** Khớp TauNgayCard.openEmailModal:204 — en-dash `–`, ngày fmtNgayTau, bữa "Trưa"/"Tối". */
export function buildTauDatSubjectFallback(
  input: Pick<TauHuyMailInput, "tenDoan" | "ngayDate" | "ngaySo" | "buaAn" | "soKhach">,
): string {
  const ngayStr = fmtNgayTau(input.ngayDate, input.ngaySo);
  const buaStr = buaSubjectOf(input.buaAn);
  return `[S8 Travel] Đặt tàu – ${input.tenDoan} – ${ngayStr} – ${buaStr}${input.soKhach ? ` – ${input.soKhach} khách` : ""}`;
}

export function buildTauHuySubject(input: TauHuyMailInput, originalSubject?: string | null): string {
  const base = originalSubject?.trim() || buildTauDatSubjectFallback(input);
  return base.startsWith("Re: ") ? base : `Re: ${base}`;
}

export function buildTauHuyEmailHtml(input: TauHuyMailInput): string {
  const buaLabel = input.buaAn === "trua" ? "Bữa trưa" : "Bữa tối";
  const rows: HuyMailRow[] = [
    { label: "Mã đoàn", value: `<strong>${esc(input.tenDoan)}</strong>` },
    { label: "Du thuyền", value: esc(input.nhaHangTen) },
    { label: "Ngày", value: esc(fmtNgayTau(input.ngayDate, input.ngaySo)) },
    { label: "Bữa", value: buaLabel },
  ];
  if (input.soKhach != null && input.soKhach > 0) rows.push({ label: "Số khách", value: `${input.soKhach} khách` });
  if (input.lyDo?.trim()) rows.push({ label: "Lý do", value: esc(input.lyDo.trim()) });

  return buildHuyMailHtml({
    toName: esc(input.nhaHangTen),
    introHtml: `Công ty TNHH Du lịch S8 xin thông báo <strong style="color:#dc2626">HỦY</strong> booking đặt tàu của đoàn <strong>${esc(input.tenDoan)}</strong>:`,
    rows,
    closingNote:
      "Kính nhờ Quý đơn vị xác nhận đã hủy booking trên. Rất mong tiếp tục hợp tác trong các đoàn sắp tới.",
    senderName: input.senderName,
    senderPhone: input.senderPhone,
  });
}

export function buildTauHuyMailtoBody(input: TauHuyMailInput): string {
  const buaLabel = input.buaAn === "trua" ? "Bữa trưa" : "Bữa tối";
  const soKhachLine = input.soKhach ? `\n- Số khách: ${input.soKhach}` : "";
  return `Kính gửi ${input.nhaHangTen},

Công ty TNHH Du lịch S8 xin thông báo HỦY booking đặt tàu của đoàn ${input.tenDoan}:
- Ngày: ${fmtNgayTau(input.ngayDate, input.ngaySo)}
- Bữa: ${buaLabel}${soKhachLine}${input.lyDo?.trim() ? `\n- Lý do: ${input.lyDo.trim()}` : ""}

Kính nhờ Quý đơn vị xác nhận đã hủy booking trên.

${input.senderName}${input.senderPhone ? `\n${input.senderPhone}` : ""}

CÔNG TY TNHH DU LỊCH S8
MST: 0402021137
Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam
Email: s8travel.hddt@gmail.com`;
}
