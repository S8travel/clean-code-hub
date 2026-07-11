import { useState, useEffect, useRef } from "react";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { useSendBookingEmail } from "@/hooks/use-booking-dv";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import {
  buildDvHuySubject, buildDvHuyEmailHtml, buildDvHuyMailtoBody,
  type DvHuyMailInput, type DvHuyDichVu,
} from "@/lib/booking-mail/dv-huy-mail";
import { normalizeEmails } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export interface DvHuyMailTarget {
  bookingId: number;
  doanId: number;
  tenNhaCungCap: string;
  dichVuList: DvHuyDichVu[];
  email: string | null;
  emailThreadId: string | null;
  emailSubject: string | null;
}

interface Props {
  target: DvHuyMailTarget | null;
  tenDoan: string;
  lyDo?: string | null;
  /** Chạy SAU khi mail gửi xong — card đổi trạng thái cả NHÓM (primary + siblings).
   *  Ném lỗi → modal báo lỗi, mail KHÔNG gửi lại. */
  onSent: () => Promise<void>;
  onCancel: () => void;
}

// Bản nháp mail HỦY booking dịch vụ. 1 card DV = 1 NCC (gộp theo email) → 1 mail.
// Mirror KsHuyMailModal: gửi mail TRƯỚC, ghi DB SAU (onSent đổi trạng thái cả nhóm).
export default function DvHuyMailModal({ target, tenDoan, lyDo, onSent, onCancel }: Props) {
  const sendMut = useSendBookingEmail();
  const { data: currentUserName = "" } = useCurrentUserName();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const mailSentRef = useRef(false);
  const builtHtmlRef = useRef("");

  const senderName = userProfile?.ho_ten || currentUserName;
  const senderPhone = userProfile?.so_dien_thoai ?? null;

  useEffect(() => {
    setTo("");
    setSubject("");
    setHtml("");
    builtHtmlRef.current = "";
    mailSentRef.current = false;
  }, [target?.bookingId]);

  useEffect(() => {
    if (!target || sending) return;
    const input: DvHuyMailInput = {
      tenDoan,
      tenNhaCungCap: target.tenNhaCungCap,
      dichVuList: target.dichVuList,
      lyDo,
      senderName,
      senderPhone,
    };
    const nextHtml = buildDvHuyEmailHtml(input);
    setTo((prev) => (prev === "" ? normalizeEmails(target.email ?? "") : prev));
    setSubject((prev) => (prev === "" ? buildDvHuySubject(input, target.emailSubject) : prev));
    setHtml((prev) => (prev === "" || prev === builtHtmlRef.current ? nextHtml : prev));
    builtHtmlRef.current = nextHtml;
  }, [target, tenDoan, lyDo, senderName, senderPhone, sending]);

  if (!target) return null;

  const finish = async () => {
    try {
      await onSent();
    } catch (e) {
      toast.error(
        `${t("Đã gửi mail hủy cho")} ${target.tenNhaCungCap} ${t("nhưng lưu thất bại")}: ` +
        `${errMsg(e) || t("Thử lại")}`,
        { duration: 10000 },
      );
      throw e;
    }
  };

  const handleSendViaServer = async () => {
    setSending(true);
    try {
      if (!mailSentRef.current) {
        await sendMut.mutateAsync({
          bookingId: target.bookingId,
          doanId: target.doanId,
          to,
          subject,
          html,
          sentBy: currentUserName,
          replyTo: userProfile?.email || currentUserEmail || undefined,
          emailThreadId: target.emailThreadId,
          mode: "huy",
        });
        mailSentRef.current = true;
        toast.success(`${t("Đã gửi mail hủy cho")} ${target.tenNhaCungCap}`);
      }
      await finish();
    } catch (e) {
      if (!mailSentRef.current) toast.error(`${t("Lỗi gửi email")}: ${errMsg(e) || t("Vui lòng thử lại")}`);
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = async () => {
    const body = buildDvHuyMailtoBody({
      tenDoan,
      tenNhaCungCap: target.tenNhaCungCap,
      dichVuList: target.dichVuList,
      lyDo,
      senderName,
      senderPhone,
    });
    window.location.href =
      `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSending(true);
    try {
      mailSentRef.current = true;
      await finish();
    } catch {
      /* toast đã hiện trong finish() */
    } finally {
      setSending(false);
    }
  };

  return (
    <EmailPreviewModal
      open
      onOpenChange={(o) => { if (!o && !sending) onCancel(); }}
      title={`${t("Mail hủy booking dịch vụ")} — ${target.tenNhaCungCap}`}
      to={to}
      onToChange={setTo}
      subject={subject}
      onSubjectChange={setSubject}
      html={html}
      onHtmlChange={setHtml}
      onSendViaServer={handleSendViaServer}
      onMailtoFallback={handleMailtoFallback}
      sending={sending}
    />
  );
}
