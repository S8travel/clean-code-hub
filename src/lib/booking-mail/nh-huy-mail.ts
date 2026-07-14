// Mail HỦY booking nhà hàng — mirror ks-huy-mail.ts. 1 nguồn dựng nội dung cho
// nút "Hủy booking" trên MealCard (tab Booking NH).
//
// THREADING: Resend đè Message-ID → Gmail gom thread theo Subject + From. Subject
// mail hủy PHẢI = `Re: <subject gốc>` (doan_booking_nh.email_subject, lưu lúc gửi
// booking). Booking cũ chưa có subject gốc → dựng lại đúng khuôn buildNhSubject,
// lệch 1 ký tự là Gmail tách thread mới.
//
// Phạm vi: CHỈ nhà hàng thường (buaAn trua/toi). Du thuyền (tau_ngay) dùng
// final_status + khuôn subject "Đặt tàu" khác → để đợt sau.

import { esc, fmtDateVi, fmtDateShort, buildHuyMailHtml, type HuyMailRow } from "./huy-mail-shell";

export interface NhHuyMailInput {
  tenDoan: string;
  nhaHangTen: string;
  buaAn: "trua" | "toi";
  /** YYYY-MM-DD của bữa ăn. Rỗng → bỏ dòng ngày + phần ngày trong subject. */
  ngayDate: string | null;
  /** Lý do hủy — OP nhập ở dialog. Rỗng → bỏ dòng lý do. */
  lyDo?: string | null;
  senderName: string;
  senderPhone?: string | null;
}

const buaLabelOf = (buaAn: "trua" | "toi") => (buaAn === "trua" ? "ăn trưa" : "ăn tối");

/**
 * Dựng lại subject booking gốc khi email_subject rỗng. PHẢI KHỚP TỪNG KÝ TỰ với
 * buildNhSubject (nh-mail.ts:64-70): dấu en-dash `–`, "ăn trưa"/"ăn tối", ngày dd/MM,
 * fallback tên "Nhà hàng". Lệch = Gmail tách thread.
 */
export function buildNhDatSubjectFallback(
  input: Pick<NhHuyMailInput, "tenDoan" | "nhaHangTen" | "buaAn" | "ngayDate">,
): string {
  const buaLabel = buaLabelOf(input.buaAn);
  const ngayStr = input.ngayDate ? fmtDateShort(input.ngayDate) : "";
  return `[S8 Travel] Đặt ${buaLabel}${input.tenDoan ? ` – ${input.tenDoan}` : ""}${ngayStr ? ` – ${ngayStr}` : ""} – ${input.nhaHangTen || "Nhà hàng"}`;
}

export function buildNhHuySubject(input: NhHuyMailInput, originalSubject?: string | null): string {
  const base = originalSubject?.trim() || buildNhDatSubjectFallback(input);
  return base.startsWith("Re: ") ? base : `Re: ${base}`;
}

export function buildNhHuyEmailHtml(input: NhHuyMailInput): string {
  const buaLabelUp = input.buaAn === "trua" ? "Ăn trưa" : "Ăn tối";
  const rows: HuyMailRow[] = [
    { label: "Mã đoàn", value: `<strong>${esc(input.tenDoan)}</strong>` },
    { label: "Nhà hàng", value: esc(input.nhaHangTen) },
    { label: "Bữa ăn", value: buaLabelUp },
  ];
  if (input.ngayDate) rows.push({ label: "Ngày", value: esc(fmtDateVi(input.ngayDate)) });
  if (input.lyDo?.trim()) rows.push({ label: "Lý do", value: esc(input.lyDo.trim()) });

  return buildHuyMailHtml({
    toName: esc(input.nhaHangTen),
    introHtml: `Công ty TNHH Du lịch S8 xin thông báo <strong style="color:#dc2626">HỦY</strong> booking đặt bàn ${esc(buaLabelUp.toLowerCase())} của đoàn <strong>${esc(input.tenDoan)}</strong>:`,
    rows,
    closingNote:
      "Kính nhờ Quý nhà hàng xác nhận đã hủy booking trên. Rất mong tiếp tục hợp tác trong các đoàn sắp tới.",
    senderName: input.senderName,
    senderPhone: input.senderPhone,
  });
}

/** Bản text cho mailto: fallback (EmailPreviewModal.onMailtoFallback). */
export function buildNhHuyMailtoBody(input: NhHuyMailInput): string {
  const buaLabel = buaLabelOf(input.buaAn);
  const ngayLine = input.ngayDate ? `\n- Ngày: ${fmtDateVi(input.ngayDate)}` : "";
  return `Kính gửi ${input.nhaHangTen},

Công ty TNHH Du lịch S8 xin thông báo HỦY booking đặt bàn ${buaLabel} của đoàn ${input.tenDoan}:${ngayLine}${input.lyDo?.trim() ? `\n- Lý do: ${input.lyDo.trim()}` : ""}

Kính nhờ Quý nhà hàng xác nhận đã hủy booking trên.

${input.senderName}${input.senderPhone ? `\n${input.senderPhone}` : ""}

CÔNG TY TNHH DU LỊCH S8
MST: 0402021137
Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam
Email: s8travel.hddt@gmail.com`;
}
