import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { Bus, Mail, Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, getDefaultDeadline, blockWeekendDate } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { useUpsertBookingXe, type BookingXeRow } from "@/hooks/use-booking-xe";
import { callSendBookingEmail } from "@/hooks/use-booking-dv";
import { useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import {
  computeExportCells,
  type DayExportCell,
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

function buildScheduleHTML(cells: DayExportCell[]): string {
  if (cells.length === 0) return "";
  const COL = "border:1px solid #e2e8f0;padding:6px 10px;font-size:13px;vertical-align:top";
  const HD  = COL + ";background:#f1f5f9;font-weight:600;text-align:center";
  const toHtml = (text: string) => text ? text.split("\n").join("<br>") : "—";

  const header = `<tr>
    <th style="${HD}">Ngày</th>
    <th style="${HD}">Chương trình</th>
    <th style="${HD}">Ăn trưa</th>
    <th style="${HD}">Ăn tối</th>
    <th style="${HD}">Khách sạn</th>
  </tr>`;

  const rows = cells.map((dc) => {
    const d = new Date(dc.ngay_date + "T00:00:00");
    const dateLabel = `${d.getDate()}/${d.getMonth() + 1}<br><span style="color:#64748b;font-size:11px">${dc.thu}</span>`;
    return `<tr>
      <td style="${COL};text-align:center;white-space:nowrap">${dateLabel}</td>
      <td style="${COL}">${toHtml(dc.chuongTrinh)}</td>
      <td style="${COL}">${toHtml(dc.anTrua)}</td>
      <td style="${COL}">${toHtml(dc.anToi)}</td>
      <td style="${COL}">${toHtml(dc.khachSan)}</td>
    </tr>`;
  }).join("");

  return `<h3 style="margin:24px 0 8px;font-size:14px;color:#0f172a">Lịch trình</h3>
<table style="border-collapse:collapse;width:100%;font-size:13px">${header}${rows}</table>`;
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
  const upsert = useUpsertBookingXe();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);
  const [ghiChu, setGhiChu] = useState(booking?.ghi_chu ?? "");
  const [deadline, setDeadline] = useState(() => booking?.deadline ?? getDefaultDeadline(ngayDi ?? "") ?? "");

  const status = booking?.booking_status ?? "chua_dat";
  const statusCfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.chua_dat;

  const save = (updates: Partial<BookingXeRow>) =>
    upsert.mutate({ doan_id: doanId, ...updates });

  const handleDeadlineChange = (val: string) => {
    const corrected = blockWeekendDate(val);
    setDeadline(corrected);
    if (corrected) save({ deadline: corrected });
  };

  const buildEmailHTML = () => {
    const nhaXeTen = xe?.nha_xe?.ten ?? "Quý đối tác";
    const xeStr = xe ? `${xe.ten_xe}${xe.so_cho ? ` (${xe.so_cho} chỗ)` : ""}` : "—";
    const hdvStr = hdvTen || "—";
    const soKhachStr = soKhach ? `${soKhach} khách` : "—";
    const cells = exportData ? computeExportCells(exportData) : [];
    const scheduleHtml = buildScheduleHTML(cells);

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:780px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px;letter-spacing:.5px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY &nbsp;|&nbsp; MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${nhaXeTen}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin đặt xe cho đoàn <strong>${tenDoan}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr><td style="padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0;width:35%">Đoàn</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${tenDoan}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0">Xe</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${xeStr}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0">Ngày đón</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${fmtDate(ngayDi)}${chuyenBayDon ? ` &nbsp;|&nbsp; CB: ${chuyenBayDon}` : ""}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0">Ngày tiễn</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${fmtDate(ngayVe)}${chuyenBayTien ? ` &nbsp;|&nbsp; CB: ${chuyenBayTien}` : ""}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0">HDV</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${hdvStr}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;background:#f1f5f9;border:1px solid #e2e8f0">Số khách</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${soKhachStr}</td></tr>
      </table>
      ${scheduleHtml}
      ${ghiChu ? `<div style="margin-top:20px;background:#f8fafc;border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú:</strong> ${ghiChu}</div>` : ""}
      <p style="margin-top:20px;color:#475569;font-size:13px">
        Kính nhờ xác nhận và báo giá trong vòng <strong>24 giờ</strong>. Trân trọng cảm ơn!
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

  const openEmailModal = () => {
    const ngayDiStr = ngayDi ? format(new Date(ngayDi + "T00:00:00"), "dd/MM/yyyy", { locale: vi }) : "";
    setEmailTo(xe?.nha_xe?.email ?? "");
    setEmailSubject(`[S8 Travel] Đặt xe – ${tenDoan}${ngayDiStr ? ` – ${ngayDiStr}` : ""}`);
    setEmailBody(buildEmailHTML());
    setEmailModalOpen(true);
  };

  const handleSendViaServer = async () => {
    if (!emailTo) { toast.error("Vui lòng nhập email nhà xe"); return; }
    setSending(true);
    try {
      const isFirst = !booking?.email_thread_id;
      const newThreadId = isFirst ? crypto.randomUUID() : null;

      const emailId = await callSendBookingEmail({
        to: emailTo,
        subject: emailSubject,
        html: emailBody,
        replyTo: currentUserEmail ?? undefined,
        ...(isFirst ? { messageId: newThreadId! } : { inReplyTo: booking?.email_thread_id ?? undefined }),
      });

      const threadId = isFirst ? newThreadId : booking?.email_thread_id;
      save({
        booking_status: "cho_xac_nhan",
        sent_at: new Date().toISOString(),
        sent_by: userProfile?.ho_ten ?? "",
        email_thread_id: emailId ?? threadId ?? undefined,
      });
      toast.success("Đã gửi email booking xe");
      setEmailModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Lỗi gửi email");
    } finally {
      setSending(false);
    }
  };

  const handleConfirm = () => {
    save({ booking_status: "da_xac_nhan", confirm_at: new Date().toISOString() });
    toast.success("Đã xác nhận booking xe");
  };

  const handleCancel = () => {
    save({ booking_status: "da_huy" });
    toast.success("Đã hủy booking xe");
  };

  const handleReset = () => {
    save({ booking_status: "chua_dat", sent_at: null, confirm_at: null });
    toast.success("Đã reset trạng thái");
  };

  if (!xe) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        Chưa có xe trong điều tour — vào tab <strong>Điều Tour</strong> để gán xe cho đoàn.
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
                {xe.so_cho && <span className="font-normal text-muted-foreground ml-1.5">· {xe.so_cho} chỗ</span>}
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
          <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0", statusCfg.cls)}>
            {statusCfg.label}
          </span>
        </div>

        {/* Body */}
        <div className="p-3 space-y-3">
          {/* Tracking */}
          <div className="flex items-center gap-1 px-2">
            <TrackingStep label="Đã sync" active={true} />
            <TrackingLine active={!!booking?.sent_at} />
            <TrackingStep label="Đã gửi" time={booking?.sent_at} by={booking?.sent_by} active={!!booking?.sent_at} />
            <TrackingLine active={!!booking?.confirm_at} />
            <TrackingStep label="Xác nhận" time={booking?.confirm_at} active={!!booking?.confirm_at} />
          </div>

          {/* Deadline + ghi chú */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Deadline</label>
              <input
                type="date"
                className="w-full mt-0.5 h-7 text-xs border border-border rounded-md px-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                value={deadline}
                onChange={(e) => handleDeadlineChange(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Ghi chú</label>
              <Textarea
                className="mt-0.5 text-xs resize-none min-h-[28px] h-7"
                rows={1}
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                onBlur={() => { if (ghiChu !== (booking?.ghi_chu ?? "")) save({ ghi_chu: ghiChu }); }}
                placeholder="Ghi chú..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openEmailModal}>
              <Mail className="h-3 w-3" /> Soạn email
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

        </div>
      </div>

      <EmailPreviewModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        title="Gửi email booking xe"
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
      />
    </>
  );
}
