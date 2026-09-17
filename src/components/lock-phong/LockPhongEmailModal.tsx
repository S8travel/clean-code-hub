import { useState } from "react";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { normalizeEmails } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { useSendLockPhongEmail, type LockPhongDisplay, type LockPhongKSDisplay } from "@/hooks/use-lock-phong";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { hashMailContent } from "@/lib/mail-content-hash";
import {
  buildLockPhongEmailHtml, buildLockPhongSubject, fmtLockPhongDate,
  type LockPhongMailInput,
} from "@/lib/booking-mail/lock-phong-mail";
import { useEffect } from "react";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lockPhong: LockPhongDisplay;
  ksRow: LockPhongKSDisplay;
  mode?: "first" | "update";
}

export default function LockPhongEmailModal({ open, onOpenChange, lockPhong, ksRow, mode = "first" }: Props) {
  useTranslate();
  const { data: currentUserName = "" } = useCurrentUserName();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();
  const sendMut = useSendLockPhongEmail();

  const baseSubject = buildLockPhongSubject(lockPhong.ten_doan, ksRow.khach_san_ten);

  const mailInput: LockPhongMailInput = {
    tenDoan: lockPhong.ten_doan,
    tenSeri: lockPhong.ten_seri,
    ngayXuatPhat: lockPhong.ngay_xuat_phat,
    khachSanTen: ksRow.khach_san_ten,
    checkIn: ksRow.check_in,
    checkOut: ksRow.check_out,
    soDem: ksRow.so_dem,
    soPhong: ksRow.so_phong,
    ghiChu: ksRow.ghi_chu ?? lockPhong.ghi_chu,
    senderName: userProfile?.ho_ten || currentUserName,
    senderPhone: userProfile?.so_dien_thoai ?? null,
  };

  // Build update HTML (minimal) hoặc first HTML (full) — chung builder với
  // flow gửi riêng hàng loạt, đừng dựng HTML tại chỗ nữa.
  const buildHtml = (forMode: "first" | "update", note: string): string =>
    buildLockPhongEmailHtml(mailInput, forMode, note);

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
      const hash = hashMailContent({
        khach_san_id: ksRow.khach_san_id,
        check_in: ksRow.check_in,
        check_out: ksRow.check_out,
        so_phong: ksRow.so_phong ?? "",
        ghi_chu: ksRow.ghi_chu ?? "",
      });
      await sendMut.mutateAsync({
        lockPhongKsId: ksRow.id,
        to: emailTo,
        subject: emailSubject,
        html: emailHtml,
        sentBy,
        replyTo,
        emailThreadId: ksRow.email_thread_id,
        mode,
        mailContentHash: hash,
      });
      onOpenChange(false);
      toast.success(mode === "update" ? t("Đã gửi email cập nhật lock phòng") : t("Đã gửi email lock phòng"));
    } catch (err: unknown) {
      toast.error(t("Lỗi gửi email") + ": " + (errMsg(err) || t("Vui lòng thử lại")));
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
      `- Ngày xuất phát: ${fmtLockPhongDate(lockPhong.ngay_xuat_phat)}\n` +
      `- Check-in: ${fmtLockPhongDate(ksRow.check_in)}\n` +
      `- Check-out: ${fmtLockPhongDate(ksRow.check_out)} (${ksRow.so_dem} đêm)\n` +
      `- Yêu cầu phòng: ${ksRow.so_phong || "—"}\n` +
      (ksRow.ghi_chu ? `- Ghi chú: ${ksRow.ghi_chu}\n` : "") +
      `\nKính nhờ xác nhận trong 24 giờ.\n\n` +
      `${name}${phone ? `\n${phone}` : ""}\n\n` +
      `CÔNG TY TNHH DU LỊCH S8\nMST: 0402021137\nEmail: s8travel.hddt@gmail.com`;
    window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`;
    onOpenChange(false);
    toast.success(t("Đã mở email client"));
  };

  return (
    <EmailPreviewModal
      open={open}
      onOpenChange={handleOpenChange}
      title={mode === "update"
        ? `${t("Gửi cập nhật lock phòng")} – ${ksRow.khach_san_ten} ${t("(thread vào mail cũ)")}`
        : `${t("Gửi email lock phòng")} – ${ksRow.khach_san_ten}`}
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
