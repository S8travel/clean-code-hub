import { useState, useEffect } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { Stamp, Mail, Check, X, RotateCcw, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn, getDefaultDeadline, blockWeekendDate } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { buildUpdateEmailHtml, buildKeyFieldsList } from "@/lib/email-update";
import { hashMailContent, isMailDirty } from "@/lib/mail-content-hash";
import { useUpsertBookingVisa, useDeleteBookingVisa, type BookingVisaRow } from "@/hooks/use-booking-visa";
import { callSendBookingEmail } from "@/hooks/use-booking-dv";
import { BOOKING_CC } from "@/lib/booking-cc";
import { useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { useDonViVisaList, type DonViVisa } from "@/hooks/use-visa";
import {
  computeExportCells,
  getDieuTourWordBlob,
  type DieuTourExportData,
} from "@/lib/export-dieu-tour-word";

const STATUS_CFG = {
  chua_dat:     { label: "Chưa gửi",    cls: "bg-muted text-muted-foreground" },
  cho_xac_nhan: { label: "Chờ xác nhận", cls: "bg-amber-100 text-amber-700" },
  da_xac_nhan:  { label: "Đã xác nhận",  cls: "bg-emerald-100 text-emerald-700" },
  da_huy:       { label: "Đã hủy",        cls: "bg-red-100 text-red-700" },
};

function fmtDatetime(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d), "dd/MM HH:mm", { locale: vi }); } catch { return ""; }
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: vi }); } catch { return d ?? "—"; }
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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

interface Props {
  doanId: number;
  tenDoan: string;
  ngayDi: string | null;
  soKhachLon?: number;
  soKhachEm1?: number;
  soKhachEm2?: number;
  soKhachTl?: number;
  booking: BookingVisaRow;
  donViList: DonViVisa[];
  exportData: DieuTourExportData | null;
  onDelete: () => void;
}

export default function BookingVisaCard({
  doanId, tenDoan, ngayDi, soKhachLon = 0, soKhachEm1 = 0, soKhachEm2 = 0, soKhachTl = 0,
  booking, donViList, exportData, onDelete,
}: Props) {
  const upsert = useUpsertBookingVisa();
  const deleteMut = useDeleteBookingVisa();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [sending, setSending] = useState(false);
  const [attachWord, setAttachWord] = useState(true);
  const [ghiChu, setGhiChu] = useState(booking.ghi_chu ?? "");
  const [deadline, setDeadline] = useState(() => booking.deadline ?? getDefaultDeadline(ngayDi ?? "") ?? "");
  const [selectedDonViId, setSelectedDonViId] = useState<number | null>(booking.don_vi_visa_id ?? null);

  const donVi = donViList.find((d) => d.id === selectedDonViId) ?? null;
  const status = booking.booking_status ?? "chua_dat";
  const statusCfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.chua_dat;

  const buildMailFields = () => ({
    don_vi_visa_id: selectedDonViId,
    don_vi_ten: donVi?.ten ?? null,
    ngay_di: ngayDi,
    so_khach_lon: soKhachLon,
    so_khach_em1: soKhachEm1,
    so_khach_em2: soKhachEm2,
    so_khach_tl: soKhachTl,
    ghi_chu: ghiChu,
  });

  const isActive = ["cho_xac_nhan", "da_xac_nhan"].includes(status);
  const isDirty = isActive && isMailDirty(booking.sent_at, booking.mail_content_hash, buildMailFields());

  const save = (updates: Partial<BookingVisaRow>) =>
    upsert.mutate({ ...booking, doan_id: doanId, ...updates });

  const handleDonViChange = (val: string) => {
    const id = val === "none" ? null : Number(val);
    setSelectedDonViId(id);
    save({ don_vi_visa_id: id });
  };

  const handleDeadlineChange = (val: string) => {
    const corrected = blockWeekendDate(val);
    setDeadline(corrected);
    if (corrected) save({ deadline: corrected });
  };

  const buildEmailHTML = (mode: "first" | "update" = "first", note = "") => {
    const tenNCC = donVi?.ten ?? "Quý đối tác";
    const soKhachParts = [
      soKhachLon   ? `NL: ${soKhachLon}` : "",
      soKhachEm1   ? `TE 50%: ${soKhachEm1}` : "",
      soKhachEm2   ? `TE free: ${soKhachEm2}` : "",
      soKhachTl    ? `T/L: ${soKhachTl}` : "",
    ].filter(Boolean).join(" · ");

    if (mode === "update") {
      const senderName = userProfile?.ho_ten || "";
      const total = soKhachLon + soKhachEm1 + soKhachEm2 + soKhachTl;
      const keyFields = buildKeyFieldsList([
        { label: "Đoàn", value: tenDoan },
        { label: "Đơn vị visa", value: tenNCC },
        { label: "Ngày đi", value: fmtDate(ngayDi) },
        { label: "Số khách", value: total > 0 ? `${total} (${soKhachParts || "—"})` : "—" },
      ]);
      return buildUpdateEmailHtml({
        greeting: `Kính gửi ${tenNCC},`,
        intro: `Cập nhật booking visa đoàn ${tenDoan}:`,
        keyFieldsHtml: keyFields,
        note,
        senderName,
        senderPhone: userProfile?.so_dien_thoai ?? null,
      });
    }

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px;letter-spacing:.5px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY &nbsp;|&nbsp; MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${tenNCC}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin làm visa cho đoàn <strong>${tenDoan}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><td style="padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0;width:35%">Đoàn</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${tenDoan}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0">Ngày đi</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${fmtDate(ngayDi)}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0">Số khách</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${soKhachParts || "—"}</td></tr>
      </table>
      ${ghiChu ? `<div style="margin-top:20px;background:#f8fafc;border-left:3px solid #6366f1;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú / Loại visa:</strong> ${ghiChu}</div>` : ""}
      <p style="margin-top:20px;color:#475569;font-size:13px">
        Chi tiết lịch trình vui lòng xem file đính kèm.<br>
        Kính nhờ xác nhận và báo phí trong vòng <strong>24 giờ</strong>. Trân trọng cảm ơn!
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${userProfile?.ho_ten || ""}</strong>${userProfile?.so_dien_thoai ? `<br>${userProfile.so_dien_thoai}` : ""}<br><br>
        <strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, TP Đà Nẵng, VN<br>
        Email: s8travel.hddt@gmail.com
      </p>
    </div>
  </div>
</body></html>`;
  };

  const [emailMode, setEmailMode] = useState<"first" | "update">("first");
  const openEmailModal = (mode: "first" | "update" = "first") => {
    setEmailMode(mode);
    setUpdateNote("");
    const ngayDiStr = ngayDi ? format(new Date(ngayDi + "T00:00:00"), "dd/MM/yyyy", { locale: vi }) : "";
    setEmailTo(donVi?.email ?? "");
    const baseSubject = `[S8 Travel] Xin visa – ${tenDoan}${ngayDiStr ? ` – ${ngayDiStr}` : ""}`;
    setEmailSubject(mode === "update" ? `Re: ${baseSubject}` : baseSubject);
    setEmailBody(buildEmailHTML(mode, ""));
    setEmailModalOpen(true);
  };

  useEffect(() => {
    if (!emailModalOpen || emailMode !== "update") return;
    setEmailBody(buildEmailHTML("update", updateNote));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateNote]);

  const handleSendViaServer = async () => {
    if (!emailTo) { toast.error("Vui lòng nhập email đơn vị visa"); return; }
    setSending(true);
    try {
      const isFirst = !booking.email_thread_id;
      const newThreadId = isFirst ? crypto.randomUUID() : null;

      let attachments: Array<{ filename: string; content: string }> | undefined;
      if (attachWord && exportData) {
        try {
          const cells = computeExportCells(exportData);
          const blob = await getDieuTourWordBlob(exportData, cells, "");
          const b64 = await blobToBase64(blob);
          attachments = [{ filename: `${tenDoan}_bảng_điều_tour.docx`, content: b64 }];
        } catch {
          toast.error("Không thể tạo file đính kèm, vẫn gửi email không có file");
        }
      }

      // KHÔNG pass messageId/inReplyTo: Resend ghi đè Message-ID → In-Reply-To custom invalid
      // → Gmail tạo thread mới. Bỏ → Gmail group theo Subject + From.
      const emailId = await callSendBookingEmail({
        to: emailTo,
        cc: BOOKING_CC.visa,
        subject: emailSubject,
        html: emailBody,
        replyTo: currentUserEmail ?? undefined,
        attachments,
      });

      const threadId = isFirst ? newThreadId : booking.email_thread_id;
      // mode='update' → KHÔNG đổi booking_status
      const savePayload: Record<string, any> = {
        sent_at: new Date().toISOString(),
        sent_by: userProfile?.ho_ten ?? "",
        email_thread_id: emailId ?? threadId ?? undefined,
        mail_content_hash: hashMailContent(buildMailFields()),
      };
      if (emailMode !== "update") savePayload.booking_status = "cho_xac_nhan";
      save(savePayload);
      toast.success(emailMode === "update" ? "Đã gửi email cập nhật visa" : "Đã gửi email booking visa");
      setEmailModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Lỗi gửi email");
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = () => {
    save({ booking_status: "da_xac_nhan", confirm_at: new Date().toISOString() });
    toast.success("Đã xác nhận booking visa");
  };
  const handleCancel = () => { save({ booking_status: "da_huy" }); };
  const handleReset = () => { save({ booking_status: "chua_dat", sent_at: null, confirm_at: null }); };

  const handleDelete = () => {
    deleteMut.mutate({ id: booking.id, doan_id: doanId });
    onDelete();
  };

  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-3 pb-2 border-b border-border bg-muted/30">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <Stamp className="h-4 w-4 mt-0.5 shrink-0 text-indigo-600" />
            <div className="min-w-0 flex-1">
              {donVi ? (
                <>
                  <p className="text-sm font-semibold leading-tight">{donVi.ten}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {donVi.email && <span className="text-[11px] text-muted-foreground">{donVi.email}</span>}
                    {donVi.so_dien_thoai && <span className="text-[11px] text-muted-foreground">{donVi.so_dien_thoai}</span>}
                  </div>
                </>
              ) : (
                <Select value={selectedDonViId ? String(selectedDonViId) : "none"} onValueChange={handleDonViChange}>
                  <SelectTrigger className="h-7 text-xs w-full max-w-[280px]">
                    <span>{!selectedDonViId ? "-- Chọn đơn vị --" : donViList.find((d) => d.id === selectedDonViId)?.ten ?? "Chọn đơn vị visa..."}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Chọn đơn vị --</SelectItem>
                    {donViList.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>{d.ten}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isDirty && (
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 flex items-center gap-1" title="Nội dung đã thay đổi so với mail gần nhất — gửi cập nhật để đồng bộ">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                Có thay đổi
              </span>
            )}
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", statusCfg.cls)}>
              {statusCfg.label}
            </span>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="p-3 space-y-3">
          {/* Change đơn vị nếu đã chọn */}
          {donVi && (
            <Select value={String(selectedDonViId)} onValueChange={handleDonViChange}>
              <SelectTrigger className="h-6 text-[11px] border-dashed">
                <span>{donViList.find((d) => d.id === selectedDonViId)?.ten ?? "Đổi đơn vị visa"}</span>
              </SelectTrigger>
              <SelectContent>
                {donViList.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.ten}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Tracking */}
          <div className="flex items-center gap-1 px-2">
            <TrackingStep label="Đã tạo" active={true} />
            <TrackingLine active={!!booking.sent_at} />
            <TrackingStep label="Đã gửi" time={booking.sent_at} by={booking.sent_by} active={!!booking.sent_at} />
            <TrackingLine active={!!booking.confirm_at} />
            <TrackingStep label="Xác nhận" time={booking.confirm_at} active={!!booking.confirm_at} />
          </div>

          {/* Deadline + ghi chú */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Deadline</label>
              <DatePicker
                className="w-full mt-0.5 h-7 text-xs"
                value={deadline}
                onChange={(v) => handleDeadlineChange(v)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Loại visa / Ghi chú</label>
              <Textarea
                className="mt-0.5 text-xs resize-none min-h-[28px] h-7"
                rows={1}
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                onBlur={() => { if (ghiChu !== (booking.ghi_chu ?? "")) save({ ghi_chu: ghiChu }); }}
                placeholder="VD: Visa TQ 30 ngày..."
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
                booking.sent_at && "text-amber-700 border-amber-300 hover:bg-amber-50",
              )}
              onClick={() => openEmailModal(booking.sent_at ? "update" : "first")}
              title={booking.sent_at ? "Gửi cập nhật — sẽ thread vào mail booking cũ" : undefined}
            >
              <Mail className="h-3 w-3" /> {booking.sent_at ? "Gửi cập nhật" : "Soạn email"}
            </Button>
            {status === "cho_xac_nhan" && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={handleConfirm}>
                <Check className="h-3 w-3" /> Xác nhận
              </Button>
            )}
            {(status === "cho_xac_nhan" || status === "da_xac_nhan") && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={handleCancel}>
                <X className="h-3 w-3" /> Hủy
              </Button>
            )}
            {status !== "chua_dat" && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-muted-foreground" onClick={handleReset}>
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            )}
          </div>

          {/* Attach toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-3 w-3 rounded"
              checked={attachWord}
              onChange={(e) => setAttachWord(e.target.checked)}
            />
            <Paperclip className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">
              Đính kèm bảng điều tour (.docx){!exportData && " — chưa có dữ liệu"}
            </span>
          </label>
        </div>
      </div>

      <EmailPreviewModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        title={emailMode === "update" ? "Gửi email cập nhật visa (thread vào mail cũ)" : "Gửi email booking visa"}
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
      />
    </>
  );
}
