import { useState, useEffect, useRef } from "react";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { normalizeEmails } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export interface HuyMailSender {
  name: string;
  phone: string | null;
}

export interface HuyMailDraft {
  subject: string;
  html: string;
  mailtoBody: string;
}

export interface HuyMailModalTarget {
  /** Đổi giá trị này = reset bản nháp (thường là bookingId). */
  resetKey: string | number;
  title: string;
  /** Tên NCC cho toast "đã gửi mail hủy cho …". */
  nccTen: string;
  toEmail: string | null;
  /** Dựng nháp từ thông tin người gửi (resolve muộn từ query). Thuần, gọi lại được. */
  buildDraft: (sender: HuyMailSender) => HuyMailDraft;
  /** Gửi mail (CHỈ gửi, không ghi booking). Ném lỗi nếu gửi thất bại. */
  send: (args: {
    to: string;
    subject: string;
    html: string;
    sender: HuyMailSender;
    replyTo?: string;
  }) => Promise<void>;
}

interface Props {
  target: HuyMailModalTarget | null;
  /** Chạy SAU khi mail đã gửi (card đổi trạng thái hủy ở đây). Ném lỗi → báo lỗi,
   *  mail KHÔNG gửi lại. */
  onSent: () => Promise<void>;
  onCancel: () => void;
}

// Modal soạn+soát mail HỦY dùng chung cho tàu / xe / visa (NH & DV có modal riêng
// đã ship trước). Gom phần tinh vi vào MỘT chỗ: gửi mail TRƯỚC → ghi DB SAU
// (onSent); cờ mailSentRef chặn gửi hai lần; effect reset khai báo TRƯỚC effect
// dựng nháp (chạy theo thứ tự khai báo). Luôn opt-in + OP soát trước khi gửi.
export default function HuyMailModal({ target, onSent, onCancel }: Props) {
  const { data: currentUserName = "" } = useCurrentUserName();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  // PHẢI là ref: đọc lại ngay trong cùng lần chạy catch, state chưa kịp cập nhật.
  const mailSentRef = useRef(false);
  const builtHtmlRef = useRef("");

  const senderName = userProfile?.ho_ten || currentUserName;
  const senderPhone = userProfile?.so_dien_thoai ?? null;
  const sender: HuyMailSender = { name: senderName, phone: senderPhone };

  // Reset khi mở cho booking khác. PHẢI khai báo TRƯỚC effect dựng nháp.
  useEffect(() => {
    setTo("");
    setSubject("");
    setHtml("");
    builtHtmlRef.current = "";
    mailSentRef.current = false;
  }, [target?.resetKey]);

  // Dựng lại nháp khi nguồn đổi. senderName/senderPhone resolve MUỘN → phải trong
  // deps. Chỉ ghi đè khi OP chưa sửa tay và không giữa lúc đang gửi.
  useEffect(() => {
    if (!target || sending) return;
    const draft = target.buildDraft({ name: senderName, phone: senderPhone });
    setTo((prev) => (prev === "" ? normalizeEmails(target.toEmail ?? "") : prev));
    setSubject((prev) => (prev === "" ? draft.subject : prev));
    setHtml((prev) => (prev === "" || prev === builtHtmlRef.current ? draft.html : prev));
    builtHtmlRef.current = draft.html;
  }, [target, senderName, senderPhone, sending]);

  if (!target) return null;
  const activeTarget = target;

  const finish = async () => {
    try {
      await onSent();
    } catch (e) {
      toast.error(
        `${t("Đã gửi mail hủy cho")} ${activeTarget.nccTen} ${t("nhưng lưu thất bại")}: ` +
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
        await activeTarget.send({
          to,
          subject,
          html,
          sender,
          replyTo: userProfile?.email || currentUserEmail || undefined,
        });
        mailSentRef.current = true;
        toast.success(`${t("Đã gửi mail hủy cho")} ${activeTarget.nccTen}`);
      }
      await finish();
    } catch (e) {
      if (!mailSentRef.current) toast.error(`${t("Lỗi gửi email")}: ${errMsg(e) || t("Vui lòng thử lại")}`);
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = async () => {
    const draft = activeTarget.buildDraft(sender);
    window.location.href =
      `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(draft.mailtoBody)}`;
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
      title={activeTarget.title}
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
