import { useState, useEffect, useRef } from "react";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { useSendKSBookingEmail } from "@/hooks/use-booking-ks";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import {
  buildKsHuySubject, buildKsHuyEmailHtml, buildKsHuyMailtoBody, type KsHuyMailInput,
} from "@/lib/booking-mail/ks-huy-mail";
import { normalizeEmails } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

export interface KsHuyMailTarget {
  bookingId: number;
  khachSanTen: string;
  email: string | null;
  emailThreadId: string | null;
  /** Subject mail đặt-trước đã lưu — mail hủy dùng `Re: <subject>` để cùng thread Gmail. */
  emailSubject: string | null;
  roomDates: string[];
}

interface Props {
  target: KsHuyMailTarget | null;
  tenDoan: string;
  lyDo?: string | null;
  /** Chạy SAU khi mail đã gửi xong. Ném lỗi → modal báo lỗi, mail KHÔNG gửi lại. */
  onSent: () => Promise<void>;
  /** Đóng bản nháp mà không gửi. Caller quyết định quay lại bước trước hay bỏ hẳn. */
  onCancel: () => void;
}

// Bản nháp mail HỦY booking KS — OP luôn soát trước khi gửi (opt-in + review bắt buộc,
// đã chốt với user 10/07/2026: tuyệt đối không auto-bắn mail cho NCC).
//
// Thứ tự CỐ Ý: gửi mail TRƯỚC, ghi DB SAU (onSent).
//   - Mail lỗi  → chưa ghi gì, OP thử lại, KS không nhận nhầm. Trạng thái hệ thống
//     khớp thực tế (KS chưa được báo, tour chưa đổi).
//   - DB lỗi sau khi mail đã bay → onSent ném lỗi, ta KHÔNG gửi lại mail (cờ sentRef),
//     chỉ báo OP thử lại thao tác lưu.
// Ngược lại (DB trước, mail sau) thì DB nói "đã hủy" trong khi KS chưa hề biết.
export default function KsHuyMailModal({ target, tenDoan, lyDo, onSent, onCancel }: Props) {
  const sendMut = useSendKSBookingEmail();
  const { data: currentUserName = "" } = useCurrentUserName();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  // Mail đã bay rồi thì lần thử lại (khi bước ghi DB lỗi) KHÔNG được gửi lần hai.
  // PHẢI là ref, không phải state: nó được ĐỌC LẠI ngay trong cùng lần chạy hàm sau
  // khi vừa đặt (`catch` của handleSendViaServer). State chưa cập nhật ở thời điểm đó
  // → nhánh catch sẽ báo nhầm "Lỗi gửi email" trong khi mail đã gửi xong.
  const mailSentRef = useRef(false);
  // HTML dựng tự động lần gần nhất — để biết OP đã sửa tay bản nháp hay chưa.
  const builtHtmlRef = useRef("");

  const senderName = userProfile?.ho_ten || currentUserName;
  const senderPhone = userProfile?.so_dien_thoai ?? null;

  // Mở cho booking khác → xóa sạch bản nháp + cờ đã-gửi.
  // PHẢI khai báo TRƯỚC effect dựng nháp: effect chạy theo thứ tự khai báo, đảo lại
  // thì bản nháp vừa dựng sẽ bị xóa ngay trong cùng lượt render.
  useEffect(() => {
    setTo("");
    setSubject("");
    setHtml("");
    builtHtmlRef.current = "";
    mailSentRef.current = false;
  }, [target?.bookingId]);

  // Dựng lại bản nháp khi nguồn dữ liệu đổi. senderName/senderPhone đến từ 2 query có
  // thể resolve MUỘN — nếu chỉ dựng một lần lúc mở thì mail gửi cho khách sạn sẽ thiếu
  // tên + số điện thoại người gửi (cùng loại lỗi với BatchSendNHModal). Chỉ ghi đè khi
  // OP CHƯA sửa tay, và không bao giờ ghi đè giữa lúc đang gửi.
  useEffect(() => {
    if (!target || sending) return;
    const input: KsHuyMailInput = {
      tenDoan,
      khachSanTen: target.khachSanTen,
      roomDates: target.roomDates,
      lyDo,
      senderName,
      senderPhone,
    };
    const nextHtml = buildKsHuyEmailHtml(input);
    setTo((prev) => (prev === "" ? normalizeEmails(target.email ?? "") : prev));
    setSubject((prev) => (prev === "" ? buildKsHuySubject(input, target.emailSubject) : prev));
    setHtml((prev) => (prev === "" || prev === builtHtmlRef.current ? nextHtml : prev));
    builtHtmlRef.current = nextHtml;
  }, [target, tenDoan, lyDo, senderName, senderPhone, sending]);

  if (!target) return null;

  /** Ghi DB sau khi mail xong. Lỗi ở đây KHÔNG làm mail gửi lại. */
  const finish = async () => {
    try {
      await onSent();
    } catch (e) {
      toast.error(
        `${t("Đã gửi mail hủy cho")} ${target.khachSanTen} ${t("nhưng lưu thất bại")}: ` +
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
          loai: "huy",
          to,
          subject,
          html,
          sentBy: currentUserName,
          replyTo: userProfile?.email || currentUserEmail || undefined,
          emailThreadId: target.emailThreadId,
          // KHÔNG truyền mailContentHash: hash đang giữ nội dung mail ĐẶT PHÒNG.
          // Ghi đè bằng hash mail hủy sẽ làm badge "có thay đổi" sai về sau.
        });
        mailSentRef.current = true;
        toast.success(`${t("Đã gửi mail hủy cho")} ${target.khachSanTen}`);
      }
      await finish();
    } catch (e) {
      // Chỉ báo "lỗi gửi email" khi mail THẬT SỰ chưa bay. Lỗi ở bước ghi DB đã có
      // toast riêng trong finish().
      if (!mailSentRef.current) toast.error(`${t("Lỗi gửi email")}: ${errMsg(e) || t("Vui lòng thử lại")}`);
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = async () => {
    const body = buildKsHuyMailtoBody({
      tenDoan,
      khachSanTen: target.khachSanTen,
      roomDates: target.roomDates,
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
      title={`${t("Mail hủy booking")} — ${target.khachSanTen}`}
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
