import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { normalizeEmails } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { useSendLockPhongEmail, type LockPhongDisplay, type LockPhongKSDisplay } from "@/hooks/use-lock-phong";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { buildUpdateEmailHtml, buildKeyFieldsList } from "@/lib/email-update";
import { useEffect } from "react";

function fmtDate(d: string) {
  try {
    return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return d;
  }
}

function buildEmailHtml(
  lockPhong: LockPhongDisplay,
  ksRow: LockPhongKSDisplay,
  userName: string,
  userPhone: string | null
): string {
  const checkIn = fmtDate(ksRow.check_in);
  const checkOut = fmtDate(ksRow.check_out);
  const ngayXuatPhat = fmtDate(lockPhong.ngay_xuat_phat);
  const soPhong = ksRow.so_phong || "—";
  const ghiChu = ksRow.ghi_chu || lockPhong.ghi_chu || "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY | MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${ksRow.khach_san_ten}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin lock phòng trước cho đoàn <strong>${lockPhong.ten_doan}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Hạng mục</th>
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Thông tin</th>
        </tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Tên đoàn / Seri</td><td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${lockPhong.ten_doan}</strong> / ${lockPhong.ten_seri}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Ngày xuất phát</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${ngayXuatPhat}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Khách sạn</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${ksRow.khach_san_ten}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Check-in</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${checkIn}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Check-out</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${checkOut} (${ksRow.so_dem} đêm)</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Yêu cầu phòng</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${soPhong}</td></tr>
      </table>
      ${ghiChu ? `<div style="margin-top:20px;background:#f8fafc;border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú:</strong> ${ghiChu}</div>` : ""}
      <p style="margin-top:24px;color:#64748b;font-size:13px">Kính nhờ quý khách sạn xác nhận lock phòng trong vòng <strong>24 giờ</strong>.<br>Trân trọng cảm ơn!</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${userName}</strong>${userPhone ? `<br>${userPhone}` : ""}<br><br>
        <strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam<br>
        Email: s8travel.hddt@gmail.com
      </p>
    </div>
  </div>
</body></html>`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lockPhong: LockPhongDisplay;
  ksRow: LockPhongKSDisplay;
  mode?: "first" | "update";
}

export default function LockPhongEmailModal({ open, onOpenChange, lockPhong, ksRow, mode = "first" }: Props) {
  const { data: currentUserName = "" } = useCurrentUserName();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();
  const sendMut = useSendLockPhongEmail();

  const baseSubject = `[S8 Travel] Lock Phòng – ${lockPhong.ten_doan} – ${ksRow.khach_san_ten}`;

  // Build update HTML (minimal) hoặc first HTML (full)
  const buildHtml = (forMode: "first" | "update", note: string): string => {
    const name = userProfile?.ho_ten || currentUserName;
    const phone = userProfile?.so_dien_thoai ?? null;
    if (forMode === "update") {
      const keyFields = buildKeyFieldsList([
        { label: "Đoàn / Seri", value: `${lockPhong.ten_doan} / ${lockPhong.ten_seri}` },
        { label: "Khách sạn", value: ksRow.khach_san_ten },
        { label: "Check-in", value: fmtDate(ksRow.check_in) },
        { label: "Check-out", value: `${fmtDate(ksRow.check_out)}${ksRow.so_dem ? ` (${ksRow.so_dem} đêm)` : ""}` },
        { label: "Yêu cầu phòng", value: ksRow.so_phong || "—" },
      ]);
      return buildUpdateEmailHtml({
        greeting: `Kính gửi ${ksRow.khach_san_ten || "Quý khách sạn"},`,
        intro: `Cập nhật lock phòng đoàn ${lockPhong.ten_doan}:`,
        keyFieldsHtml: keyFields,
        note,
        senderName: name,
        senderPhone: phone,
      });
    }
    return buildEmailHtml(lockPhong, ksRow, name, phone);
  };

  const [emailTo, setEmailTo] = useState(() => normalizeEmails(ksRow.khach_san_email));
  const [emailSubject, setEmailSubject] = useState(
    () => (mode === "update" ? `Re: ${baseSubject}` : baseSubject),
  );
  const [emailHtml, setEmailHtml] = useState(() => buildHtml(mode, ""));
  const [updateNote, setUpdateNote] = useState("");
  const [sending, setSending] = useState(false);

  // Refresh email content when modal opens or data changes
  const refreshEmail = () => {
    setEmailTo(normalizeEmails(ksRow.khach_san_email));
    setEmailSubject(mode === "update" ? `Re: ${baseSubject}` : baseSubject);
    setUpdateNote("");
    setEmailHtml(buildHtml(mode, ""));
  };

  // Rebuild HTML when updateNote changes (only update mode)
  useEffect(() => {
    if (!open || mode !== "update") return;
    setEmailHtml(buildHtml("update", updateNote));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateNote]);

  const handleOpenChange = (v: boolean) => {
    if (v) refreshEmail();
    onOpenChange(v);
  };

  const handleSendViaServer = async () => {
    setSending(true);
    try {
      const sentBy = userProfile?.ho_ten || currentUserName;
      const replyTo = userProfile?.email || currentUserEmail || undefined;
      await sendMut.mutateAsync({
        lockPhongKsId: ksRow.id,
        to: emailTo,
        subject: emailSubject,
        html: emailHtml,
        sentBy,
        replyTo,
        emailThreadId: ksRow.email_thread_id,
        mode,
      });
      onOpenChange(false);
      toast.success(mode === "update" ? "Đã gửi email cập nhật lock phòng" : "Đã gửi email lock phòng");
    } catch (err: any) {
      toast.error("Lỗi gửi email: " + (err?.message || "Vui lòng thử lại"));
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = () => {
    const name = userProfile?.ho_ten || currentUserName;
    const phone = userProfile?.so_dien_thoai || "";
    const body =
      `Kính gửi ${ksRow.khach_san_ten},\n\n` +
      `Công ty TNHH Du lịch S8 xin lock phòng cho đoàn ${lockPhong.ten_doan} (${lockPhong.ten_seri}):\n` +
      `- Ngày xuất phát: ${fmtDate(lockPhong.ngay_xuat_phat)}\n` +
      `- Check-in: ${fmtDate(ksRow.check_in)}\n` +
      `- Check-out: ${fmtDate(ksRow.check_out)} (${ksRow.so_dem} đêm)\n` +
      `- Yêu cầu phòng: ${ksRow.so_phong || "—"}\n` +
      (ksRow.ghi_chu ? `- Ghi chú: ${ksRow.ghi_chu}\n` : "") +
      `\nKính nhờ xác nhận trong 24 giờ.\n\n` +
      `${name}${phone ? `\n${phone}` : ""}\n\n` +
      `CÔNG TY TNHH DU LỊCH S8\nMST: 0402021137\nEmail: s8travel.hddt@gmail.com`;
    window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`;
    onOpenChange(false);
    toast.success("Đã mở email client");
  };

  return (
    <EmailPreviewModal
      open={open}
      onOpenChange={handleOpenChange}
      title={mode === "update"
        ? `Gửi cập nhật lock phòng – ${ksRow.khach_san_ten} (thread vào mail cũ)`
        : `Gửi email lock phòng – ${ksRow.khach_san_ten}`}
      to={emailTo}
      onToChange={setEmailTo}
      subject={emailSubject}
      onSubjectChange={setEmailSubject}
      html={emailHtml}
      onHtmlChange={setEmailHtml}
      onSendViaServer={handleSendViaServer}
      onMailtoFallback={handleMailtoFallback}
      sending={sending}
      mode={mode}
      updateNote={updateNote}
      onUpdateNoteChange={setUpdateNote}
    />
  );
}
