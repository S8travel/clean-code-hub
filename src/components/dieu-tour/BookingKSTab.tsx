import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Mail, Check, X, FileDown, Loader2, Trash2,
  MapPin, Phone, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { DeleteDialog } from "@/components/DeleteDialog";
import {
  useBookingKS,
  useUpdateBookingKS,
  useDeleteBookingKS,
  useSendKSBookingEmail,
  syncBookingStatus,
  type BookingKSDisplay,
} from "@/hooks/use-booking-ks";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";

const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHNid29xem1ia256ZHBhZXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDAzNzcsImV4cCI6MjA4OTI3NjM3N30.RLsKYfH6XZw3Mcmk2fm1R6rKKzrtm0MLrYhtjIT--T0";

function getOverallStatus(row: BookingKSDisplay) {
  const dt = row.ks_dat_truoc_status;
  const fn = row.ks_final_status;
  if (fn === "ks_xac_nhan_huy")
    return { label: "Đã hủy", cls: "bg-red-100 text-red-700" };
  if (fn === "cho_ks_xac_nhan_huy")
    return { label: "Chờ XN hủy", cls: "bg-orange-100 text-orange-700" };
  if (fn === "ks_xac_nhan_final")
    return { label: "Final đã XN", cls: "bg-purple-100 text-purple-700" };
  if (fn === "cho_ks_xac_nhan")
    return { label: "Chờ XN Final", cls: "bg-green-100 text-green-700" };
  if (dt === "ks_xac_nhan")
    return { label: "Đặt trước: KS đã XN", cls: "bg-teal-100 text-teal-700" };
  if (dt === "cho_ks_xac_nhan")
    return { label: "Chờ XN đặt trước", cls: "bg-blue-100 text-blue-700" };
  return { label: "Chưa gửi", cls: "bg-muted text-muted-foreground" };
}

function fmtDate(d: string) {
  try {
    return format(new Date(d + "T00:00:00"), "dd/MM", { locale: vi });
  } catch {
    return d;
  }
}

function fmtDatetime(d: string | null) {
  if (!d) return "";
  try {
    return format(new Date(d), "dd/MM HH:mm", { locale: vi });
  } catch {
    return "";
  }
}

interface Props {
  doanId: number;
  tenDoan: string;
  ngayDi?: string | null;
}

export default function BookingKSTab({ doanId, tenDoan, ngayDi }: Props) {
  const { data: bookings, isLoading } = useBookingKS(doanId);
  const updateMut = useUpdateBookingKS();
  const deleteMut = useDeleteBookingKS();
  const { data: currentUserName = "" } = useCurrentUserName();
  const [deleteTarget, setDeleteTarget] = useState<BookingKSDisplay | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((prev) =>
      prev.size === (bookings?.length ?? 0)
        ? new Set()
        : new Set(bookings?.map((b) => b.id) ?? [])
    );

  const handleExportAll = async () => {
    if (selectedIds.size === 0) { toast.warning("Chọn ít nhất 1 khách sạn"); return; }
    setIsExporting(true);
    try {
      const res = await fetch(
        "https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/xuat-word-booking-ks",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ANON_KEY}`,
            apikey: ANON_KEY,
          },
          body: JSON.stringify({ doan_id: doanId, booking_ids: Array.from(selectedIds) }),
        }
      );
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tenDoan}_訂房確認單.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Đã xuất file Word");
    } catch (err: any) {
      toast.error("Lỗi xuất: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const updateStatus = async (
    row: BookingKSDisplay,
    fields: Partial<BookingKSDisplay>
  ) => {
    try {
      await updateMut.mutateAsync({ id: row.id, fields: fields as any });
      await syncBookingStatus(doanId);
    } catch {
      toast.error("Lỗi khi cập nhật");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      await syncBookingStatus(doanId);
      toast.success("Đã xóa booking");
      setDeleteTarget(null);
    } catch {
      toast.error("Lỗi khi xóa");
    }
  };

  if (isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );

  if (!bookings?.length)
    return (
      <div className="rounded-xl bg-card border border-border p-14 text-center">
        <p className="text-sm font-medium text-muted-foreground">Chưa có booking nào.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Chọn khách sạn trong tab Điều Tour và lưu để tạo booking.
        </p>
      </div>
    );

  const total = bookings.length;
  const dtConfirmed = bookings.filter((b) => b.ks_dat_truoc_status === "ks_xac_nhan").length;
  const finalConfirmed = bookings.filter((b) => b.ks_final_status === "ks_xac_nhan_final").length;
  const allSelected = selectedIds.size === total;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Booking Khách Sạn</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total} khách sạn · {dtConfirmed} đã XN đặt trước · {finalConfirmed} đã XN final
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <Checkbox
              checked={allSelected && total > 0}
              onCheckedChange={toggleAll}
            />
            Chọn tất cả
          </label>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleExportAll}
            disabled={isExporting || selectedIds.size === 0}
          >
            {isExporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <FileDown className="h-3.5 w-3.5 mr-1" />
            )}
            In xác nhận{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {bookings.map((row) => (
          <BookingKSCard
            key={row.id}
            row={row}
            doanId={doanId}
            tenDoan={tenDoan}
            ngayDi={ngayDi}
            currentUserName={currentUserName}
            updateMut={updateMut}
            onDelete={() => setDeleteTarget(row)}
            updateStatus={updateStatus}
            selected={selectedIds.has(row.id)}
            onToggleSelect={() => toggleSelect(row.id)}
          />
        ))}
      </div>

      <DeleteDialog
        open={!!deleteTarget}
        name={deleteTarget?.khach_san_ten || ""}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isDeleting={deleteMut.isPending}
      />
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────
function BookingKSCard({
  row,
  doanId,
  tenDoan,
  ngayDi,
  currentUserName,
  updateMut,
  onDelete,
  updateStatus,
  selected,
  onToggleSelect,
}: {
  row: BookingKSDisplay;
  doanId: number;
  tenDoan: string;
  ngayDi?: string | null;
  currentUserName: string;
  updateMut: ReturnType<typeof useUpdateBookingKS>;
  onDelete: () => void;
  updateStatus: (row: BookingKSDisplay, fields: Partial<BookingKSDisplay>) => Promise<void>;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const [soPhong, setSoPhong] = useState(row.ks_dat_truoc || "");
  const [soPhongFinal, setSoPhongFinal] = useState(row.ks_final || "");
  const [ghiChu, setGhiChu] = useState(row.ks_ghi_chu_booking || "");
  const [deadline, setDeadline] = useState(row.deadline || "");

  // Email state
  const sendMut = useSendKSBookingEmail();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setSoPhong(row.ks_dat_truoc || "");
    setSoPhongFinal(row.ks_final || "");
    setGhiChu(row.ks_ghi_chu_booking || "");
    setDeadline(row.deadline || "");
  }, [row.id]);

  const buildEmailHtml = () => {
    const sortedDates = [...row.ngay_dates].sort();
    const checkIn = sortedDates[0] ? fmtDate(sortedDates[0]) : "—";
    const lastDate = sortedDates[sortedDates.length - 1];
    let checkOut = "—";
    if (lastDate) {
      try {
        const d = new Date(lastDate + "T00:00:00");
        d.setDate(d.getDate() + 1);
        checkOut = format(d, "dd/MM", { locale: vi });
      } catch { checkOut = lastDate; }
    }
    const ngayDiStr = ngayDi ? fmtDate(ngayDi) : "—";
    const soPhongHtml = soPhongFinal || soPhong || row.ks_final || row.ks_dat_truoc || "—";
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY | MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${row.khach_san_ten}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin đặt phòng cho đoàn <strong>${tenDoan}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Hạng mục</th>
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Thông tin</th>
        </tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Mã đoàn / Ngày đi</td><td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${tenDoan}</strong> – ${ngayDiStr}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Khách sạn</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${row.khach_san_ten}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Check-in</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${checkIn}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Check-out</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${checkOut} (${row.so_dem} đêm)</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Số phòng</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${soPhongHtml}</td></tr>
      </table>
      ${ghiChu ? `<div style="margin-top:20px;background:#f8fafc;border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú:</strong> ${ghiChu}</div>` : ""}
      <p style="margin-top:24px;color:#64748b;font-size:13px">Kính nhờ quý khách sạn xác nhận booking trong vòng <strong>24 giờ</strong>.<br>Trân trọng cảm ơn!</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${userProfile?.ho_ten || currentUserName}</strong>${userProfile?.so_dien_thoai ? `<br>${userProfile.so_dien_thoai}` : ""}<br><br>
        <strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam<br>
        Email: s8travel.hddt@gmail.com
      </p>
    </div>
  </div>
</body></html>`;
  };

  const openEmailModal = () => {
    const ngayDiStr = ngayDi ? fmtDate(ngayDi) : "";
    setEmailTo(row.khach_san_email || "");
    setEmailSubject(`[S8 Travel] Đặt phòng – ${tenDoan}${ngayDiStr ? ` – ${ngayDiStr}` : ""} – ${row.khach_san_ten}`);
    setEmailHtml(buildEmailHtml());
    setEmailModalOpen(true);
  };

  const buildMailtoBody = () => {
    const userPhone = userProfile?.so_dien_thoai || "";
    const userName = userProfile?.ho_ten || currentUserName;
    return `KÃ­nh gá»­i ${row.khach_san_ten},\n\nCÃ´ng ty TNHH Du lá»‹ch S8 xin Ä‘áº·t phÃ²ng cho Ä‘oÃ n ${tenDoan}:\n- NgÃ y Ä‘i: ${ngayDi ? fmtDate(ngayDi) : "â€”"}\n- Check-in: ${row.ngay_dates.length ? fmtDate([...row.ngay_dates].sort()[0]) : "â€”"}\n- NgÃ y: ${row.ngay_dates.map(fmtDate).join(", ")} (${row.so_dem} Ä‘Ãªm)\n- Sá»‘ phÃ²ng: ${soPhongFinal || soPhong || "â€”"}${ghiChu ? `\n- Ghi chÃº: ${ghiChu}` : ""}\n\nKÃ­nh nhá» xÃ¡c nháº­n trong 24 giá».\n\n${userName}${userPhone ? `\n${userPhone}` : ""}\n\nCÃ”NG TY TNHH DU Lá»ŠCH S8\nMST: 0402021137\nÄ/C: Táº§ng 2, TÃ²a nhÃ  Kim SÆ¡n, Sá»‘ 18 Phan ThÃ nh TÃ i, PhÆ°á»ng HÃ²a CÆ°á»ng, ThÃ nh Phá»‘ ÄÃ  Náºµng, Viá»‡t Nam\nEmail: s8travel.hddt@gmail.com`;
  };

  const handleSendViaServer = async () => {
    setSending(true);
    try {
      await sendMut.mutateAsync({ bookingId: row.id, loai: "dat_truoc", to: emailTo, subject: emailSubject, html: emailHtml, sentBy: currentUserName, replyTo: userProfile?.email || currentUserEmail || undefined, emailThreadId: row.email_thread_id });
      setEmailModalOpen(false);
      toast.success("Đã gửi email đặt phòng");
    } catch (err: any) {
      toast.error("Lỗi gửi email: " + (err?.message || "Vui lòng thử lại"));
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = () => {
    const mailtoBody = buildMailtoBody();
    window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(mailtoBody)}`;
    updateStatus(row, { ks_dat_truoc_status: "cho_ks_xac_nhan", ks_dat_truoc_sent_at: new Date().toISOString(), ks_dat_truoc_sent_by: currentUserName });
    setEmailModalOpen(false);
    toast.success("Đã mở email client");
  };

  const save = async (fields: Record<string, any>) => {
    try {
      await updateMut.mutateAsync({ id: row.id, fields: fields as any });
    } catch {
      toast.error("Lỗi khi lưu");
    }
  };

  const datTruocConfirmed = row.ks_dat_truoc_status === "ks_xac_nhan";
  const isCancelled = row.ks_final_status === "ks_xac_nhan_huy";
  const overall = getOverallStatus(row);

  return (
    <>
    <div
      className={cn(
        "rounded-xl border bg-card overflow-hidden transition-colors",
        selected ? "border-primary/40 bg-primary/5" : !row.con_trong_dieu_tour ? "border-amber-300" : "border-border",
        isCancelled && "opacity-60"
      )}
    >
      {/* Orphaned warning banner */}
      {!row.con_trong_dieu_tour && (
        <div className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Khách sạn này đã bị xóa khỏi điều tour — booking vẫn được giữ lại
        </div>
      )}
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-border bg-muted/20">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{row.khach_san_ten}</span>
            <span
              className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-medium",
                overall.cls
              )}
            >
              {overall.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
            {row.khach_san_dia_diem && (
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {row.khach_san_dia_diem}
              </span>
            )}
            {row.ngay_dates.length > 0 && (
              <span>
                📅 {row.ngay_dates.map(fmtDate).join(", ")} ({row.so_dem} đêm)
              </span>
            )}
            {row.khach_san_so_dien_thoai && (
              <span className="flex items-center gap-0.5">
                <Phone className="h-3 w-3" />
                {row.khach_san_so_dien_thoai}
              </span>
            )}
            {row.khach_san_email && (
              <span className="text-primary/70">{row.khach_san_email}</span>
            )}
          </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Số phòng đặt trước</p>
            <Input
              value={soPhong}
              onChange={(e) => setSoPhong(e.target.value)}
              onBlur={() => save({ ks_dat_truoc: soPhong })}
              placeholder="VD: 6 TWN, 1 DBL..."
              className="h-8 text-xs"
              disabled={isCancelled}
            />
          </div>
          {datTruocConfirmed ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Số phòng Final</p>
              <Input
                value={soPhongFinal}
                onChange={(e) => setSoPhongFinal(e.target.value)}
                onBlur={() => save({ ks_final: soPhongFinal })}
                placeholder="VD: 5 TWN, 2 DBL..."
                className="h-8 text-xs"
                disabled={isCancelled}
              />
            </div>
          ) : (
            <div />
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Ghi chú</p>
            <Input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              onBlur={() => save({ ks_ghi_chu_booking: ghiChu })}
              placeholder="Ghi chú..."
              className="h-8 text-xs"
            />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Deadline xác nhận</p>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            onBlur={() => save({ deadline: deadline || null })}
            className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Gửi email — chỉ hiện ở giai đoạn đặt trước */}
        {!isCancelled && row.ks_dat_truoc_status === "chua_gui" && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs w-full"
            onClick={openEmailModal}
          >
            <Mail className="h-3.5 w-3.5 mr-1.5" /> Gửi email đặt phòng
          </Button>
        )}

        {/* Booking flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <DatTruocSection
            row={row}
            updateStatus={updateStatus}
          />
          <FinalSection
            row={row}
            updateStatus={updateStatus}
            datTruocConfirmed={datTruocConfirmed}
          />
        </div>
      </div>
    </div>

    <EmailPreviewModal
      open={emailModalOpen}
      onOpenChange={setEmailModalOpen}
      title="Gửi email đặt phòng"
      to={emailTo}
      onToChange={setEmailTo}
      subject={emailSubject}
      onSubjectChange={setEmailSubject}
      html={emailHtml}
      onHtmlChange={setEmailHtml}
      textBody={buildMailtoBody()}
      onSendViaServer={handleSendViaServer}
      onMailtoFallback={handleMailtoFallback}
      sending={sending}
    />
    </>
  );
}

// ── Đặt trước ─────────────────────────────────────────────────────────────────
function DatTruocSection({
  row,
  updateStatus,
}: {
  row: BookingKSDisplay;
  updateStatus: (row: BookingKSDisplay, fields: Partial<BookingKSDisplay>) => Promise<void>;
}) {
  const status = row.ks_dat_truoc_status;

  const BADGE: Record<string, { label: string; dot: string }> = {
    chua_gui:        { label: "Chưa gửi",         dot: "bg-muted-foreground/30" },
    cho_ks_xac_nhan: { label: "Chờ KS xác nhận",  dot: "bg-amber-400" },
    ks_xac_nhan:     { label: "KS đã xác nhận",    dot: "bg-teal-500" },
  };
  const badge = BADGE[status] || BADGE.chua_gui;

  return (
    <div className="rounded-lg border border-blue-200/60 bg-blue-50/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-700">Đặt trước</p>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className={cn("w-2 h-2 rounded-full shrink-0", badge.dot)} />
          {badge.label}
        </span>
      </div>

      {status === "cho_ks_xac_nhan" && (
        <div className="space-y-1.5">
          {row.ks_dat_truoc_sent_at && (
            <p className="text-[10px] text-muted-foreground">
              Gửi lúc: {fmtDatetime(row.ks_dat_truoc_sent_at)}
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-teal-600 border-teal-300 w-full"
            onClick={() =>
              updateStatus(row, {
                ks_dat_truoc_status: "ks_xac_nhan",
                ks_dat_truoc_confirm_at: new Date().toISOString(),
              }).then(() => toast.success("KS đã xác nhận đặt trước"))
            }
          >
            <Check className="h-3 w-3 mr-1" /> KS xác nhận đặt trước
          </Button>
        </div>
      )}

      {status === "ks_xac_nhan" && row.ks_dat_truoc_confirm_at && (
        <p className="text-[10px] text-teal-600">
          ✓ XN lúc: {fmtDatetime(row.ks_dat_truoc_confirm_at)}
        </p>
      )}
    </div>
  );
}

// ── Final ─────────────────────────────────────────────────────────────────────
function FinalSection({
  row,
  updateStatus,
  datTruocConfirmed,
}: {
  row: BookingKSDisplay;
  updateStatus: (row: BookingKSDisplay, fields: Partial<BookingKSDisplay>) => Promise<void>;
  datTruocConfirmed: boolean;
}) {
  const status = row.ks_final_status;

  const handleHuy = () => {
    updateStatus(row, { ks_final_status: "cho_ks_xac_nhan_huy" })
      .then(() => toast.success("Đã cập nhật trạng thái hủy"));
  };

  const BADGE: Record<string, { label: string; dot: string }> = {
    chua_gui:             { label: "Chờ xử lý",        dot: "bg-muted-foreground/30" },
    cho_ks_xac_nhan:      { label: "Chờ KS xác nhận",  dot: "bg-amber-400" },
    ks_xac_nhan_final:    { label: "KS đã XN Final",   dot: "bg-purple-500" },
    cho_ks_xac_nhan_huy:  { label: "Chờ XN hủy",       dot: "bg-orange-400" },
    ks_xac_nhan_huy:      { label: "Đã hủy",            dot: "bg-red-400" },
  };
  const badge = BADGE[status] || BADGE.chua_gui;

  if (!datTruocConfirmed) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/10 p-3 flex items-center justify-center min-h-[80px]">
        <p className="text-xs text-muted-foreground italic">Chờ xác nhận đặt trước</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-green-200/60 bg-green-50/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-green-700">Final</p>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className={cn("w-2 h-2 rounded-full shrink-0", badge.dot)} />
          {badge.label}
        </span>
      </div>

      {status === "chua_gui" && (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-green-700 border-green-300 flex-1"
            onClick={() =>
              updateStatus(row, { ks_final_status: "cho_ks_xac_nhan" })
                .then(() => toast.success("Chờ KS xác nhận Final"))
            }
          >
            <Check className="h-3 w-3 mr-1" /> Final
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0 text-red-500 border-red-300 shrink-0"
            onClick={handleHuy}
            title="Hủy booking"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {status === "cho_ks_xac_nhan" && (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-purple-600 border-purple-300 flex-1"
            onClick={() =>
              updateStatus(row, {
                ks_final_status: "ks_xac_nhan_final",
                ks_final_confirm_at: new Date().toISOString(),
              }).then(() => toast.success("KS đã xác nhận Final"))
            }
          >
            <Check className="h-3 w-3 mr-1" /> KS xác nhận Final
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0 text-red-500 border-red-300 shrink-0"
            onClick={handleHuy}
            title="Hủy booking"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {status === "ks_xac_nhan_final" && (
        <div className="space-y-1.5">
          {row.ks_final_confirm_at && (
            <p className="text-[10px] text-purple-600">
              ✓ Final lúc: {fmtDatetime(row.ks_final_confirm_at)}
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-red-500 border-red-300 w-full"
            onClick={handleHuy}
          >
            <X className="h-3 w-3 mr-1" /> Hủy booking
          </Button>
        </div>
      )}

      {status === "cho_ks_xac_nhan_huy" && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-orange-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Chờ KS xác nhận hủy
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-red-600 border-red-300 w-full"
            onClick={() =>
              updateStatus(row, {
                ks_final_status: "ks_xac_nhan_huy",
                ks_final_confirm_at: new Date().toISOString(),
              }).then(() => toast.success("Đã xác nhận hủy"))
            }
          >
            <Check className="h-3 w-3 mr-1" /> KS xác nhận hủy
          </Button>
        </div>
      )}

      {status === "ks_xac_nhan_huy" && (
        <p className="text-xs text-red-500">
          ✕ Đã hủy{" "}
          {row.ks_final_confirm_at ? fmtDatetime(row.ks_final_confirm_at) : ""}
        </p>
      )}
    </div>
  );
}
