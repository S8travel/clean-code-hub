import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Building2, Mail, Send, Check, X, RotateCcw, ChevronDown, ChevronUp, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  useUpdateBookingDV,
  useDeleteBookingDV,
  useSendBookingEmail,
  type BookingDVRow as DVRow,
} from "@/hooks/use-booking-dv";
import { cn } from "@/lib/utils";

const STATUS_CFG = {
  chua_dat:     { label: "Chưa gửi",      cls: "bg-muted text-muted-foreground" },
  cho_xac_nhan: { label: "Chờ xác nhận", cls: "bg-amber-100 text-amber-700" },
  da_xac_nhan:  { label: "Đã xác nhận",  cls: "bg-emerald-100 text-emerald-700" },
  da_huy:       { label: "Đã hủy",        cls: "bg-red-100 text-red-700" },
};

function fmtDatetime(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d), "dd/MM HH:mm", { locale: vi }); } catch { return ""; }
}
function fmtDay(d: string) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy"); } catch { return d; }
}

function TrackingStep({
  label, time, active, by,
}: { label: string; time?: string | null; active: boolean; by?: string | null }) {
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
  return (
    <div className={cn("flex-1 h-0.5 mb-5 transition-colors", active ? "bg-primary" : "bg-muted-foreground/20")} />
  );
}

interface Props {
  row: DVRow;
  tenDoan: string;
  currentUserName: string;
}

export default function BookingDVCard({ row, tenDoan, currentUserName }: Props) {
  const updateMut = useUpdateBookingDV();
  const deleteMut = useDeleteBookingDV();
  const sendEmailMut = useSendBookingEmail();

  const [tenNCC, setTenNCC] = useState(row.ten_nha_cung_cap || "");
  const [email, setEmail] = useState(row.email_nha_cung_cap || "");
  const [ghiChu, setGhiChu] = useState(row.ghi_chu || "");
  const [expanded, setExpanded] = useState(true);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(row.email_nha_cung_cap || "");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);

  const isCancelled = row.booking_status === "da_huy";
  const statusKey = row.booking_status as keyof typeof STATUS_CFG;
  const status = STATUS_CFG[statusKey] || STATUS_CFG.chua_dat;

  const [dvList, setDvList] = useState(row.dich_vu_list || []);
  const dvSorted = [...dvList].sort((a, b) => a.ngay_date.localeCompare(b.ngay_date));

  const save = (updates: Record<string, any>) =>
    updateMut.mutate({ id: row.id, doan_id: row.doan_id, updates });

  const updateSoKhach = (tenDv: string, ngayDate: string, val: number) => {
    const next = dvList.map((d) =>
      d.ten_dv === tenDv && d.ngay_date === ngayDate ? { ...d, so_khach: val } : d
    );
    setDvList(next);
    save({ dich_vu_list: next });
  };

  // ── Email ──────────────────────────────────────────────────────────
  const buildEmailHTML = () => {
    const nccName = tenNCC || row.ten_nha_cung_cap || "Quý đối tác";
    const serviceRows = dvSorted
      .map(
        (d) => `
        <tr>
          <td style="border:1px solid #e2e8f0;padding:8px 12px">${fmtDay(d.ngay_date)}</td>
          <td style="border:1px solid #e2e8f0;padding:8px 12px">${d.ten_dv}</td>
          <td style="border:1px solid #e2e8f0;padding:8px 12px;text-align:center">${d.so_khach}</td>
        </tr>`
      )
      .join("");

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px;letter-spacing:.5px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY &nbsp;|&nbsp; MST: 0402021137</p>
    </div>

    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${nccName}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin đặt dịch vụ cho đoàn <strong>${tenDoan}</strong>:</p>

      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left;font-weight:600">Ngày</th>
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left;font-weight:600">Dịch vụ</th>
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:center;font-weight:600">Số khách</th>
          </tr>
        </thead>
        <tbody>${serviceRows}</tbody>
      </table>

      ${ghiChu ? `<div style="margin-top:20px;background:#f8fafc;border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú:</strong> ${ghiChu}</div>` : ""}

      <p style="margin-top:24px;color:#64748b;font-size:13px">
        Kính nhờ quý đối tác xác nhận booking trong vòng <strong>24 giờ</strong>.<br>
        Trân trọng cảm ơn!
      </p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6">
        <strong style="color:#475569">CÔNG TY TNHH DU LỊCH S8</strong><br>
        S8 TRAVEL COMPANY &nbsp;|&nbsp; MST: 0402021137
      </p>
    </div>
  </div>
</body>
</html>`;
  };

  const openEmailModal = () => {
    const ncc = tenNCC || row.ten_nha_cung_cap || "";
    setEmailTo(email || row.email_nha_cung_cap || "");
    setEmailSubject(`[S8 Travel] Đặt dịch vụ – Đoàn ${tenDoan}${ncc ? ` – ${ncc}` : ""}`);
    setEmailBody(buildEmailHTML());
    setEmailModalOpen(true);
  };

  const handleMockSend = () => {
    save({ booking_status: "cho_xac_nhan", sent_at: new Date().toISOString(), sent_by: currentUserName });
    toast.success("Đã gửi email booking");
  };

  const handleSendViaServer = async () => {
    if (!emailTo) { toast.error("Vui lòng nhập email nhà cung cấp"); return; }
    setSending(true);
    try {
      await sendEmailMut.mutateAsync({
        bookingId: row.id,
        doanId: row.doan_id,
        to: emailTo,
        subject: emailSubject,
        html: emailBody,
        sentBy: currentUserName,
      });
      setEmailModalOpen(false);
      toast.success("Đã gửi email booking");
    } catch (err: any) {
      toast.error("Lỗi gửi email: " + (err?.message || "Vui lòng thử lại"));
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = () => {
    const recipient = emailTo || "";
    const bodyText = [
      `Kính gửi ${tenNCC || row.ten_nha_cung_cap},`,
      "",
      `S8 Travel xin đặt dịch vụ cho đoàn ${tenDoan}:`,
      "",
      ...dvSorted.map(
        (d) => `- ${fmtDay(d.ngay_date)}: ${d.ten_dv} (${d.so_khach} khách)`
      ),
      ...(ghiChu ? ["", `Ghi chú: ${ghiChu}`] : []),
      "",
      "Kính nhờ xác nhận booking trong vòng 24 giờ.",
      "",
      "CÔNG TY TNHH DU LỊCH S8",
    ].join("\n");

    window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(bodyText)}`;
    save({ booking_status: "cho_xac_nhan", sent_at: new Date().toISOString(), sent_by: currentUserName });
    setEmailModalOpen(false);
    toast.success("Đã mở email client");
  };

  // ── Status actions ─────────────────────────────────────────────────
  const handleConfirm = () => {
    save({ booking_status: "da_xac_nhan", confirm_at: new Date().toISOString() });
    toast.success("Đã xác nhận booking");
  };
  const handleCancel = () => {
    save({ booking_status: "da_huy" });
    toast("Đã hủy booking");
  };
  const handleReset = () => {
    save({ booking_status: "chua_dat", sent_at: null, sent_by: null, confirm_at: null });
    toast("Đã đặt lại");
  };

  return (
    <div className={cn("rounded-lg border border-border bg-card overflow-hidden transition-opacity", isCancelled && "opacity-60")}>
      {/* ── Card Header ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center gap-3">
        <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />

        <div className="flex-1 min-w-0">
          {isCancelled ? (
            <p className="text-sm font-semibold line-through text-muted-foreground truncate">{tenNCC || "—"}</p>
          ) : (
            <input
              className="text-sm font-semibold bg-transparent border-none outline-none w-full hover:bg-muted/50 focus:bg-background focus:border focus:border-input focus:px-2 rounded transition-all"
              value={tenNCC}
              onChange={(e) => setTenNCC(e.target.value)}
              onBlur={() => save({ ten_nha_cung_cap: tenNCC })}
              placeholder="Tên nhà cung cấp..."
            />
          )}
          <div className="flex items-center gap-1 mt-0.5">
            <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              className="text-xs text-muted-foreground bg-transparent border-none outline-none flex-1 min-w-0 hover:bg-muted/50 focus:bg-background focus:border focus:border-input focus:px-1.5 rounded transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => save({ email_nha_cung_cap: email })}
              placeholder="Email nhà cung cấp..."
              disabled={isCancelled}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium", status.cls)}>
            {status.label}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground p-1 rounded"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* ── Services Table ────────────────────────────────────────── */}
          <div className="px-4 py-3">
            {dvSorted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Chưa có dịch vụ. Lưu điều tour để tự động sync.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-1.5 font-medium pr-4 w-[100px]">Ngày</th>
                    <th className="text-left py-1.5 font-medium">Dịch vụ</th>
                    <th className="text-center py-1.5 font-medium w-[100px]">Số khách</th>
                  </tr>
                </thead>
                <tbody>
                  {dvSorted.map((dv, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      <td className="py-2 text-muted-foreground pr-4">{fmtDay(dv.ngay_date)}</td>
                      <td className="py-2">{dv.ten_dv}</td>
                      <td className="py-2 text-center">
                        <input
                          type="number"
                          value={dv.so_khach || ""}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setDvList((prev) =>
                              prev.map((d) =>
                                d.ten_dv === dv.ten_dv && d.ngay_date === dv.ngay_date
                                  ? { ...d, so_khach: val }
                                  : d
                              )
                            );
                          }}
                          onBlur={(e) => updateSoKhach(dv.ten_dv, dv.ngay_date, Number(e.target.value))}
                          disabled={isCancelled}
                          className="w-16 text-center text-sm border border-input rounded-md bg-background px-1 py-1 focus:outline-none focus:ring-2 focus:ring-ring no-spinner"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Tracking Timeline ────────────────────────────────────── */}
          <div className="px-6 py-3 bg-muted/10 border-t border-border">
            <div className="flex items-center">
              <TrackingStep label="Đã sync" time={row.created_at} active={true} />
              <TrackingLine active={!!row.sent_at} />
              <TrackingStep label="Đã gửi mail" time={row.sent_at} active={!!row.sent_at} by={row.sent_by} />
              <TrackingLine active={!!row.confirm_at} />
              <TrackingStep label="Xác nhận" time={row.confirm_at} active={!!row.confirm_at} />
            </div>
          </div>

          {/* ── Notes + Actions ──────────────────────────────────────── */}
          <div className="px-4 py-3 border-t border-border flex items-start gap-4">
            <Textarea
              placeholder="Ghi chú..."
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              onBlur={() => save({ ghi_chu: ghiChu })}
              disabled={isCancelled}
              className="text-xs min-h-[52px] resize-none flex-1"
              rows={2}
            />

            <div className="flex flex-wrap gap-1.5 shrink-0 pt-0.5">
              {/* Gửi email */}
              {(row.booking_status === "chua_dat") && (
                <Button size="sm" className="h-8 text-xs" onClick={handleMockSend}>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Gửi email
                </Button>
              )}
              {(row.booking_status === "cho_xac_nhan" || row.booking_status === "da_xac_nhan") && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleMockSend}>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Gửi lại
                </Button>
              )}
              {/* Xác nhận */}
              {row.booking_status === "cho_xac_nhan" && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleConfirm}>
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Xác nhận
                </Button>
              )}
              {/* Hủy */}
              {(row.booking_status === "cho_xac_nhan" || row.booking_status === "da_xac_nhan") && (
                <Button
                  size="sm" variant="outline"
                  className="h-8 text-xs text-destructive hover:bg-destructive/10"
                  onClick={handleCancel}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Hủy
                </Button>
              )}
              {/* Đặt lại */}
              {isCancelled && (
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleReset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Đặt lại
                </Button>
              )}
              {/* Xóa */}
              <Button
                size="sm" variant="ghost"
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                onClick={() => {
                  if (confirm(`Xóa booking "${tenNCC || "này"}"?`)) {
                    deleteMut.mutate({ id: row.id, doan_id: row.doan_id });
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ── Email Modal ───────────────────────────────────────────────── */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Gửi email đặt dịch vụ
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Đến</p>
                <Input
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="email@nhacungcap.com"
                  className="text-sm"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Tiêu đề</p>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Nội dung email (HTML)</p>
              <Textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={12}
                className="text-xs font-mono"
              />
            </div>

            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <strong>Lưu ý:</strong> "Gửi qua server" dùng Supabase Edge Function (cần cấu hình RESEND_API_KEY).
              "Mở email client" dùng ứng dụng mail mặc định trên máy, không cần cấu hình.
            </div>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={handleMailtoFallback} type="button">
              <Mail className="h-4 w-4 mr-1" />
              Mở email client
            </Button>
            <Button onClick={handleSendViaServer} disabled={sending || !emailTo}>
              <Send className="h-4 w-4 mr-1" />
              {sending ? "Đang gửi..." : "Gửi qua server"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
