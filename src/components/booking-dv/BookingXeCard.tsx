import { useState, useEffect, useMemo } from "react";
import { sanitizeEmailSubject } from "@/lib/email-subject";
import { errMsg } from "@/lib/error";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { Bus, Mail, Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { cn, getDefaultDeadline, blockWeekendDate } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import {
  buildXeEmailHtml,
  buildXeMailSnapshot,
  diffXeMailSnapshot,
  parseXeMailSnapshot,
  type XeMailInput,
} from "@/lib/booking-mail/xe-mail";
import { hashMailContent, isMailDirty } from "@/lib/mail-content-hash";
import { useUpsertBookingXe, type BookingXeRow } from "@/hooks/use-booking-xe";
import { callSendBookingEmail } from "@/hooks/use-booking-dv";
import { BOOKING_CC } from "@/lib/booking-cc";
import HuyBookingConfirmDialog, { type HuyBookingConfirmArgs } from "@/components/shared/HuyBookingConfirmDialog";
import HuyMailModal, { type HuyMailModalTarget } from "@/components/shared/HuyMailModal";
import { buildXeHuySubject, buildXeHuyEmailHtml, buildXeHuyMailtoBody } from "@/lib/booking-mail/xe-huy-mail";
import { useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { useHdvsByDoanId, formatHdvsForEmail } from "@/hooks/use-hdv";
import { formatXeForEmail } from "@/lib/xe-email";
import {
  computeExportCells,
  type DieuTourExportData,
} from "@/lib/export-dieu-tour-word";
import { t, useTranslate } from "@/lib/i18n";

const STATUS_CFG = {
  chua_dat:     { labelKey: "Chưa gửi",    cls: "bg-muted text-muted-foreground" },
  cho_xac_nhan: { labelKey: "Chờ xác nhận", cls: "bg-amber-100 text-amber-700" },
  da_xac_nhan:  { labelKey: "Đã xác nhận",  cls: "bg-emerald-100 text-emerald-700" },
  da_huy:       { labelKey: "Đã hủy",        cls: "bg-red-100 text-red-700" },
};

function fmtDatetime(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d), "dd/MM HH:mm", { locale: vi }); } catch { return ""; }
}
/** Giờ gửi mail trước — ghi trong khung "Các thay đổi" của mail cập nhật (giờ máy người gửi). */
function fmtSentAt(d: string) {
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: vi }); } catch { return ""; }
}

function TrackingStep({ label, time, active, by }: { label: string; time?: string | null; active: boolean; by?: string | null }) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5 min-w-[70px]", active ? "text-foreground" : "text-muted-foreground/40")}>
      <div className={cn("w-3 h-3 rounded-full border-2 transition-colors", active ? "bg-primary border-primary" : "border-muted-foreground/30 bg-background")} />
      <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
      {time && <span className="text-[10px] text-muted-foreground leading-tight">{fmtDatetime(time)}</span>}
      {by && <span className="text-[10px] text-muted-foreground/70 leading-tight">{by}</span>}
    </div>
  );
}
function TrackingLine({ active }: { active: boolean }) {
  return <div className={cn("flex-1 h-0.5 mb-5 transition-colors", active ? "bg-primary" : "bg-muted-foreground/20")} />;
}

interface XeInfo {
  id: number;
  ten_xe: string;
  so_cho: number | null;
  nha_xe: { id: number; ten: string; email: string | null; so_dien_thoai: string | null } | null;
}

interface Props {
  doanId: number;
  tenDoan: string;
  ngayDi: string | null;
  ngayVe: string | null;
  chuyenBayDon?: string | null;
  chuyenBayTien?: string | null;
  hdvTen?: string | null;
  soKhach?: number | null;
  xe: XeInfo | null;
  booking: BookingXeRow | null;
  exportData: DieuTourExportData | null;
}

export default function BookingXeCard({
  doanId, tenDoan, ngayDi, ngayVe, chuyenBayDon, chuyenBayTien, hdvTen, soKhach,
  xe, booking, exportData,
}: Props) {
  useTranslate();
  const upsert = useUpsertBookingXe();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();
  const { data: doanHdvs = [] } = useHdvsByDoanId(doanId);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [sending, setSending] = useState(false);
  const [ghiChu, setGhiChu] = useState(booking?.ghi_chu ?? "");
  const [deadline, setDeadline] = useState(() => booking?.deadline ?? getDefaultDeadline(ngayDi ?? "") ?? "");
  const [huyDialogOpen, setHuyDialogOpen] = useState(false);
  const [huyTarget, setHuyTarget] = useState<HuyMailModalTarget | null>(null);
  // Input mail CHỐT lúc mở modal: nội dung mail, khung "thay đổi" và bản chụp lưu khi
  // gửi cùng dựng từ 1 input → lần cập nhật sau so đúng cái nhà xe đã nhận.
  const [mailInput, setMailInput] = useState<XeMailInput | null>(null);

  const status = booking?.booking_status ?? "chua_dat";
  const statusCfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.chua_dat;

  const buildMailFields = () => ({
    xe_id: xe?.id ?? null,
    nha_xe_id: xe?.nha_xe?.id ?? null,
    ten_xe: xe?.ten_xe ?? null,
    so_cho: xe?.so_cho ?? null,
    ngay_di: ngayDi,
    ngay_ve: ngayVe,
    chuyen_bay_don: chuyenBayDon ?? null,
    chuyen_bay_tien: chuyenBayTien ?? null,
    hdv_ten: hdvTen ?? null,
    so_khach: soKhach ?? null,
  });

  const isActive = ["cho_xac_nhan", "da_xac_nhan"].includes(status);
  const isDirty = isActive && isMailDirty(booking?.sent_at, booking?.mail_content_hash, buildMailFields());

  // xe_id BẮT BUỘC để upsert đúng booking của nhà xe này (mỗi xe 1 booking).
  const save = (updates: Partial<BookingXeRow>) =>
    upsert.mutate({ doan_id: doanId, xe_id: xe?.id ?? null, ...updates });

  const handleDeadlineChange = (val: string) => {
    const corrected = blockWeekendDate(val);
    setDeadline(corrected);
    if (corrected) save({ deadline: corrected });
  };

  // Mail đặt lần đầu và mail cập nhật dựng CÙNG khuôn (lib/booking-mail/xe-mail):
  // cập nhật gửi lại đủ lịch trình, không bảo nhà xe "xem mail booking gốc".
  const buildMailInput = (): XeMailInput => ({
    tenDoan,
    nhaXeTen: xe?.nha_xe?.ten ?? null,
    tenXe: xe?.ten_xe ?? null,
    soCho: xe?.so_cho ?? null,
    ngayDi,
    ngayVe,
    chuyenBayDon: chuyenBayDon ?? null,
    chuyenBayTien: chuyenBayTien ?? null,
    hdvText: formatHdvsForEmail(doanHdvs),
    soKhach: soKhach ?? null,
    ghiChu,
    cells: exportData ? computeExportCells(exportData) : [],
    senderName: userProfile?.ho_ten || "",
    senderPhone: userProfile?.so_dien_thoai ?? null,
    prevSnapshot: parseXeMailSnapshot(booking?.mail_sent_snapshot),
    prevSentLabel: booking?.sent_at ? fmtSentAt(booking.sent_at) : null,
  });

  const [emailMode, setEmailMode] = useState<"first" | "update">("first");
  const openEmailModal = (mode: "first" | "update" = "first") => {
    setEmailMode(mode);
    setUpdateNote("");
    const input = buildMailInput();
    setMailInput(input);
    const ngayDiStr = ngayDi ? format(new Date(ngayDi + "T00:00:00"), "dd/MM/yyyy", { locale: vi }) : "";
    setEmailTo(xe?.nha_xe?.email ?? "");
    // Tiêu đề kèm loại xe/số chỗ (formatXeForEmail: xe thường "45 chỗ",
    // limousine "LMS 9C (9 chỗ)") — nhà xe nhìn tiêu đề là biết loại xe.
    const xeSubject = xe ? formatXeForEmail(xe.ten_xe, xe.so_cho) : "";
    const xeSubjectPart = xeSubject && xeSubject !== "—" ? ` – ${xeSubject}` : "";
    const baseSubject = sanitizeEmailSubject(`[S8 Travel] Đặt xe – ${tenDoan}${xeSubjectPart}${ngayDiStr ? ` – ${ngayDiStr}` : ""}`);
    setEmailSubject(mode === "update" ? `Re: ${baseSubject}` : baseSubject);
    setEmailBody(buildXeEmailHtml(input, mode, ""));
    setEmailModalOpen(true);
  };

  useEffect(() => {
    if (!emailModalOpen || emailMode !== "update" || !mailInput) return;
    setEmailBody(buildXeEmailHtml(mailInput, "update", updateNote));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateNote]);

  // Thay đổi hệ thống tự phát hiện so với mail trước — null = mail trước chưa có bản chụp.
  const mailChanges = useMemo(
    () => (mailInput?.prevSnapshot ? diffXeMailSnapshot(mailInput.prevSnapshot, buildXeMailSnapshot(mailInput)) : null),
    [mailInput],
  );

  const handleSendViaServer = async () => {
    if (!emailTo) { toast.error(t("Vui lòng nhập email nhà xe")); return; }
    setSending(true);
    try {
      const isFirst = !booking?.email_thread_id;
      const newThreadId = isFirst ? crypto.randomUUID() : null;

      // KHÔNG pass messageId/inReplyTo: Resend ghi đè Message-ID → In-Reply-To custom invalid
      // → Gmail tạo thread mới. Bỏ → Gmail group theo Subject + From.
      const emailId = await callSendBookingEmail({
        to: emailTo,
        cc: BOOKING_CC.xe,
        subject: emailSubject,
        html: emailBody,
        replyTo: userProfile?.email || currentUserEmail || undefined,
      });

      const threadId = isFirst ? newThreadId : booking?.email_thread_id;
      // mode='update' → KHÔNG đổi booking_status
      const savePayload: Partial<BookingXeRow> = {
        sent_at: new Date().toISOString(),
        sent_by: userProfile?.ho_ten ?? "",
        email_thread_id: emailId ?? threadId ?? undefined,
        mail_content_hash: hashMailContent(buildMailFields()),
      };
      // Bản chụp đúng nội dung vừa gửi → lần "Gửi cập nhật" sau tự liệt kê thay đổi.
      if (mailInput) savePayload.mail_sent_snapshot = buildXeMailSnapshot(mailInput);
      if (emailMode !== "update") savePayload.booking_status = "cho_xac_nhan";
      save(savePayload);
      toast.success(emailMode === "update" ? t("Đã gửi email cập nhật xe") : t("Đã gửi email booking xe"));
      setEmailModalOpen(false);
    } catch (err: unknown) {
      toast.error(errMsg(err) || t("Lỗi gửi email"));
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = () => {
    save({ booking_status: "da_xac_nhan", confirm_at: new Date().toISOString() });
    toast.success(t("Đã xác nhận booking xe"));
  };

  const handleCancel = () => setHuyDialogOpen(true);

  // mutateAsync (không phải save fire-and-forget): onSent PHẢI biết ghi da_huy có
  // thành công không. Mail hủy đã bay cho nhà xe rồi mà DB ghi hụt trong im lặng
  // thì hệ thống vẫn "chờ xác nhận" — desync đúng cái luồng này cần tránh.
  const applyHuyStatus = () =>
    upsert.mutateAsync({ doan_id: doanId, xe_id: xe?.id ?? null, booking_status: "da_huy" });

  const handleHuyConfirm = ({ lyDo, sendMail }: HuyBookingConfirmArgs) => {
    const to = xe?.nha_xe?.email ?? "";
    if (sendMail && to) {
      const tenNhaXe = xe?.nha_xe?.ten ?? "";
      setHuyTarget({
        resetKey: booking?.id ?? 0,
        title: `${t("Mail hủy booking xe")} — ${tenNhaXe}`,
        nccTen: tenNhaXe,
        toEmail: to,
        buildDraft: (s) => {
          const input = {
            tenDoan, tenNhaXe, tenXe: xe?.ten_xe ?? null, soCho: xe?.so_cho ?? null,
            ngayDi, lyDo: lyDo || null, senderName: s.name, senderPhone: s.phone,
          };
          return {
            subject: buildXeHuySubject(input),
            html: buildXeHuyEmailHtml(input),
            mailtoBody: buildXeHuyMailtoBody(input),
          };
        },
        send: async ({ to: sendTo, subject, html, replyTo }) => {
          await callSendBookingEmail({ to: sendTo, cc: BOOKING_CC.xe, subject, html, replyTo });
        },
      });
      setHuyDialogOpen(false);
      return;
    }
    applyHuyStatus()
      .then(() => toast.success(t("Đã hủy booking xe")))
      .catch(() => toast.error(t("Lỗi cập nhật")));
    setHuyDialogOpen(false);
  };

  const handleReset = () => {
    save({ booking_status: "chua_dat", sent_at: null, confirm_at: null });
    toast.success(t("Đã reset trạng thái"));
  };

  if (!xe) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {t("Chưa có xe trong điều tour — vào tab")} <strong>{t("Điều Tour")}</strong> {t("để gán xe cho đoàn.")}
      </div>
    );
  }

  const nhaXe = xe.nha_xe;

  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-3 pb-2 border-b border-border bg-muted/30">
          <div className="flex items-start gap-2 min-w-0">
            <Bus className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">
                {nhaXe?.ten ?? "—"}
                {xe.ten_xe && <span className="font-normal text-muted-foreground ml-1.5">· {xe.ten_xe}</span>}
                {xe.so_cho && <span className="font-normal text-muted-foreground ml-1.5">· {xe.so_cho} {t("chỗ")}</span>}
              </p>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {nhaXe?.email && (
                  <span className="text-[11px] text-muted-foreground">{nhaXe.email}</span>
                )}
                {nhaXe?.so_dien_thoai && (
                  <span className="text-[11px] text-muted-foreground">{nhaXe.so_dien_thoai}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isDirty && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 flex items-center gap-1" title={t("Nội dung đã thay đổi so với mail gần nhất — gửi cập nhật để đồng bộ")}>
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                {t("Có thay đổi")}
              </span>
            )}
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", statusCfg.cls)}>
              {t(statusCfg.labelKey)}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-3 space-y-3">
          {/* Tracking */}
          <div className="flex items-center gap-1 px-2">
            <TrackingStep label={t("Đã sync")} active={true} />
            <TrackingLine active={!!booking?.sent_at} />
            <TrackingStep label={t("Đã gửi")} time={booking?.sent_at} by={booking?.sent_by} active={!!booking?.sent_at} />
            <TrackingLine active={!!booking?.confirm_at} />
            <TrackingStep label={t("Xác nhận")} time={booking?.confirm_at} active={!!booking?.confirm_at} />
          </div>

          {/* Deadline + ghi chú */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Deadline")}</label>
              <DatePicker
                className="w-full mt-0.5 h-7 text-xs"
                value={deadline}
                onChange={(v) => handleDeadlineChange(v)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("Ghi chú")}</label>
              <Textarea
                className="mt-0.5 text-xs resize-none min-h-[28px] h-7"
                rows={1}
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                onBlur={() => { if (ghiChu !== (booking?.ghi_chu ?? "")) save({ ghi_chu: ghiChu }); }}
                placeholder={t("Ghi chú...")}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className={cn(
                "h-7 text-xs gap-1.5",
                booking?.sent_at && "text-amber-700 border-amber-300 hover:bg-amber-50",
              )}
              onClick={() => openEmailModal(booking?.sent_at ? "update" : "first")}
              title={booking?.sent_at ? t("Gửi cập nhật — sẽ thread vào mail booking cũ") : undefined}
            >
              <Mail className="h-3 w-3" /> {booking?.sent_at ? t("Gửi cập nhật") : t("Soạn email")}
            </Button>
            {status === "cho_xac_nhan" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={handleConfirm}>
                <Check className="h-3 w-3" /> {t("Xác nhận")}
              </Button>
            )}
            {(status === "cho_xac_nhan" || status === "da_xac_nhan") && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={handleCancel}>
                <X className="h-3 w-3" /> {t("Hủy")}
              </Button>
            )}
            {status !== "chua_dat" && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-muted-foreground" onClick={handleReset}>
                <RotateCcw className="h-3 w-3" /> {t("Reset")}
              </Button>
            )}
          </div>

        </div>
      </div>

      <EmailPreviewModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        title={emailMode === "update" ? t("Gửi email cập nhật xe (thread vào mail cũ)") : t("Gửi email booking xe")}
        to={emailTo}
        onToChange={setEmailTo}
        subject={emailSubject}
        onSubjectChange={setEmailSubject}
        html={emailBody}
        onHtmlChange={setEmailBody}
        onSendViaServer={handleSendViaServer}
        onMailtoFallback={() => {
          window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}`;
        }}
        sending={sending}
        mode={emailMode}
        updateNote={updateNote}
        onUpdateNoteChange={setUpdateNote}
        updateHint={
          mailChanges === null
            ? t("Mail trước được gửi khi hệ thống chưa biết so sánh, nên lần này chưa tự liệt kê được thay đổi — hãy ghi thay đổi vào ô trên. Từ lần gửi sau sẽ tự liệt kê.")
            : mailChanges.length === 0
              ? t("Không thấy thay đổi nào so với mail đã gửi gần nhất.")
              : `${t("Đã tự liệt kê")} ${mailChanges.length} ${t("thay đổi so với mail trước và tô vàng trong nội dung mail.")}`
        }
      />

      <HuyBookingConfirmDialog
        open={huyDialogOpen}
        onOpenChange={setHuyDialogOpen}
        tenNcc={xe?.nha_xe?.ten ?? "—"}
        loaiNcc={t("nhà xe")}
        hasEmail={!!xe?.nha_xe?.email}
        submitting={upsert.isPending}
        onConfirm={handleHuyConfirm}
      />

      <HuyMailModal
        target={huyTarget}
        onSent={async () => { await applyHuyStatus(); setHuyTarget(null); }}
        onCancel={() => setHuyTarget(null)}
      />
    </>
  );
}
