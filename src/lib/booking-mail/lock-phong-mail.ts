// Builder mail LOCK PHÒNG — tách thuần từ LockPhongEmailModal để flow lẻ (nút
// "Email" trên từng đoàn) và GỬI RIÊNG HÀNG LOẠT dùng chung MỘT nguồn
// subject / HTML / hash-fields duy nhất.
//
// QUAN TRỌNG: output phải giữ Y HỆT flow lẻ trước đây —
//   - subject lệch → Gmail (thread theo Subject + From, không dùng Message-ID)
//     tách thành thread mới, KS trả lời rơi ra ngoài luồng cũ;
//   - field hash lệch → badge "Đổi" không tắt sau khi gửi hoặc tắt nhầm.

import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { sanitizeEmailSubject } from "@/lib/email-subject";
import { buildUpdateEmailHtml, buildKeyFieldsList } from "@/lib/email-update";
import { isMailDirty } from "@/lib/mail-content-hash";
import type { LockPhongKSDisplay } from "@/hooks/use-lock-phong";

export interface LockPhongMailInput {
  tenDoan: string;
  tenSeri: string;
  ngayXuatPhat: string;
  khachSanTen: string;
  checkIn: string;
  checkOut: string;
  soDem: number;
  soPhong: string | null;
  /** ksRow.ghi_chu ?? lockPhong.ghi_chu — resolve ở caller. */
  ghiChu: string | null;
  senderName: string;
  senderPhone?: string | null;
}

export function fmtLockPhongDate(d: string): string {
  try {
    return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return d;
  }
}

/** Field đưa vào mail — hash để detect dirty (badge "Đổi" sau khi đã gửi). */
export function buildLockPhongMailFields(
  hotel: Pick<LockPhongKSDisplay, "khach_san_id" | "check_in" | "check_out" | "so_phong" | "ghi_chu">,
) {
  return {
    khach_san_id: hotel.khach_san_id,
    check_in: hotel.check_in,
    check_out: hotel.check_out,
    so_phong: hotel.so_phong ?? "",
    ghi_chu: hotel.ghi_chu ?? "",
  };
}

/** Đã gửi mail rồi mà nội dung lock đổi sau đó → cần gửi cập nhật. */
export function isLockPhongDirty(hotel: LockPhongKSDisplay): boolean {
  const isActive = ["cho_xac_nhan", "da_xac_nhan"].includes(hotel.email_status);
  if (!isActive) return false;
  return isMailDirty(hotel.email_sent_at, hotel.mail_content_hash, buildLockPhongMailFields(hotel));
}

export function buildLockPhongSubject(tenDoan: string, khachSanTen: string): string {
  return sanitizeEmailSubject(`[S8 Travel] Lock Phòng – ${tenDoan} – ${khachSanTen}`);
}

function buildFirstHtml(i: LockPhongMailInput): string {
  const checkIn = fmtLockPhongDate(i.checkIn);
  const checkOut = fmtLockPhongDate(i.checkOut);
  const ngayXuatPhat = fmtLockPhongDate(i.ngayXuatPhat);
  const soPhong = i.soPhong || "—";
  const ghiChu = i.ghiChu || "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY | MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${i.khachSanTen}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin lock phòng trước cho đoàn <strong>${i.tenDoan}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Hạng mục</th>
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Thông tin</th>
        </tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Tên đoàn / Seri</td><td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${i.tenDoan}</strong> / ${i.tenSeri}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Ngày xuất phát</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${ngayXuatPhat}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Khách sạn</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${i.khachSanTen}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Check-in</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${checkIn}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Check-out</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${checkOut} (${i.soDem} đêm)</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Yêu cầu phòng</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${soPhong}</td></tr>
      </table>
      ${ghiChu ? `<div style="margin-top:20px;background:#f8fafc;border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú:</strong> ${ghiChu}</div>` : ""}
      <p style="margin-top:24px;color:#64748b;font-size:13px">Kính nhờ quý khách sạn xác nhận lock phòng trong vòng <strong>24 giờ</strong>.<br>Trân trọng cảm ơn!</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${i.senderName}</strong>${i.senderPhone ? `<br>${i.senderPhone}` : ""}<br><br>
        <strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam<br>
        Email: s8travel.hddt@gmail.com
      </p>
    </div>
  </div>
</body></html>`;
}

function buildUpdateHtml(i: LockPhongMailInput, note: string): string {
  const keyFields = buildKeyFieldsList([
    { label: "Đoàn / Seri", value: `${i.tenDoan} / ${i.tenSeri}` },
    { label: "Khách sạn", value: i.khachSanTen },
    { label: "Check-in", value: fmtLockPhongDate(i.checkIn) },
    { label: "Check-out", value: `${fmtLockPhongDate(i.checkOut)}${i.soDem ? ` (${i.soDem} đêm)` : ""}` },
    { label: "Yêu cầu phòng", value: i.soPhong || "—" },
  ]);
  return buildUpdateEmailHtml({
    greeting: `Kính gửi ${i.khachSanTen || "Quý khách sạn"},`,
    intro: `Cập nhật lock phòng đoàn ${i.tenDoan}:`,
    keyFieldsHtml: keyFields,
    note,
    senderName: i.senderName,
    senderPhone: i.senderPhone ?? null,
  });
}

/** HTML mail lock phòng — 'first' = bảng đầy đủ, 'update' = bản cập nhật gọn. */
export function buildLockPhongEmailHtml(
  i: LockPhongMailInput,
  mode: "first" | "update" = "first",
  note = "",
): string {
  return mode === "update" ? buildUpdateHtml(i, note) : buildFirstHtml(i);
}
