import { useState, useEffect, useRef } from "react";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { useSendNHBookingEmail } from "@/hooks/use-booking-nh";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import {
  buildNhHuySubject, buildNhHuyEmailHtml, buildNhHuyMailtoBody, type NhHuyMailInput,
} from "@/lib/booking-mail/nh-huy-mail";
import { normalizeEmails } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export interface NhHuyMailTarget {
  bookingId: number;
  doanId: number;
  nhaHangTen: string;
  buaAn: "trua" | "toi";
  ngayDate: string | null;
  email: string | null;
  emailThreadId: string | null;
  /** Subject mail booking đã lưu — mail hủy dùng `Re: <subject>` để cùng thread Gmail. */
  emailSubject: string | null;
}

interface Props {
  target: NhHuyMailTarget | null;
  tenDoan: string;
  lyDo?: string | null;
  /** Chạy SAU khi mail đã gửi xong (card đổi trạng thái cho_xac_nhan_huy ở đây).
   *  Ném lỗi → modal báo lỗi, mail KHÔNG gửi lại. */
  onSent: () => Promise<void>;
  onCancel: () => void;
}

// Bản nháp mail HỦY booking nhà hàng — OP luôn soát trước khi gửi (opt-in + review
// bắt buộc). Mirror KsHuyMailModal: gửi mail TRƯỚC, ghi DB SAU (onSent).
//   - Mail lỗi  → chưa đổi gì, OP thử lại, NH không nhận nhầm.
//   - DB lỗi sau khi mail bay → onSent ném lỗi, KHÔNG gửi lại (cờ mailSentRef).
export default function NhHuyMailModal({ target, tenDoan, lyDo, onSent, onCancel }: Props) {
  const sendMut = useSendNHBookingEmail();
  const { data: currentUserName = "" } = useCurrentUserName();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  // Mail đã bay thì lần thử lại (khi ghi DB lỗi) KHÔNG gửi lần hai. PHẢI là ref —
  // đọc lại ngay trong cùng lần chạy catch, state chưa kịp cập nhật.
  const mailSentRef = useRef(false);
  const builtHtmlRef = useRef("");

  const senderName = userProfile?.ho_ten || currentUserName;
  const senderPhone = userProfile?.so_dien_thoai ?? null;

  // Reset bản nháp khi mở cho booking khác. PHẢI khai báo TRƯỚC effect dựng nháp —
  // effect chạy theo thứ tự khai báo, đảo lại thì nháp vừa dựng bị xóa ngay.
  useEffect(() => {
    setTo("");
    setSubject("");
    setHtml("");
    builtHtmlRef.current = "";
    mailSentRef.current = false;
  }, [target?.bookingId]);

  // Dựng lại nháp khi nguồn đổi. senderName/senderPhone đến từ query resolve MUỘN
  // → phải trong deps, không thì mail thiếu tên+SĐT người gửi. Chỉ ghi đè khi OP
  // chưa sửa tay và không giữa lúc đang gửi.
  useEffect(() => {
    if (!target || sending) return;
    const input: NhHuyMailInput = {
      tenDoan,
      nhaHangTen: target.nhaHangTen,
      buaAn: target.buaAn,
      ngayDate: target.ngayDate,
      lyDo,
      senderName,
      senderPhone,
    };
    const nextHtml = buildNhHuyEmailHtml(input);
    setTo((prev) => (prev === "" ? normalizeEmails(target.email ?? "") : prev));
    setSubject((prev) => (prev === "" ? buildNhHuySubject(input, target.emailSubject) : prev));
    setHtml((prev) => (prev === "" || prev === builtHtmlRef.current ? nextHtml : prev));
    builtHtmlRef.current = nextHtml;
  }, [target, tenDoan, lyDo, senderName, senderPhone, sending]);

  if (!target) return null;

  const finish = async () => {
    try {
      await onSent();
    } catch (e) {
      toast.error(
        `${t("Đã gửi mail hủy cho")} ${target.nhaHangTen} ${t("nhưng lưu thất bại")}: ` +
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
          mode: "huy", // CHỈ gửi mail, KHÔNG đụng booking (email_subject/hash/status)
        });
        mailSentRef.current = true;
        toast.success(`${t("Đã gửi mail hủy cho")} ${target.nhaHangTen}`);
      }
      await finish();
    } catch (e) {
      if (!mailSentRef.current) toast.error(`${t("Lỗi gửi email")}: ${errMsg(e) || t("Vui lòng thử lại")}`);
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = async () => {
    const body = buildNhHuyMailtoBody({
      tenDoan,
      nhaHangTen: target.nhaHangTen,
      buaAn: target.buaAn,
      ngayDate: target.ngayDate,
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
      title={`${t("Mail hủy booking nhà hàng")} — ${target.nhaHangTen}`}
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
