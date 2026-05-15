import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { normalizeEmails } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
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
import { exportBookingWord } from "@/lib/export-booking-word";
import {
  useBookingKS,
  useUpdateBookingKS,
  useDeleteBookingKS,
  useSendKSBookingEmail,
  syncBookingStatus,
  type BookingKSDisplay,
  type BookingKSRow,
} from "@/hooks/use-booking-ks";
import { useBookingTau } from "@/hooks/use-booking-tau";
import { useHdvByDoanId, formatHdvForEmail } from "@/hooks/use-hdv";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { buildUpdateEmailHtml, buildKeyFieldsList } from "@/lib/email-update";
import { hashMailContent, isMailDirty } from "@/lib/mail-content-hash";
import TauNgayCard from "@/components/booking-ks/TauNgayCard";
import {
  expandRoomValues,
  getBookingRoomDates,
  nextDateStr,
  serializeRoomValues,
} from "@/lib/booking-ks-rooms";


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
  soKhach?: number;
}

export default function BookingKSTab({ doanId, tenDoan, ngayDi, soKhach }: Props) {
  const { data: bookings, isLoading } = useBookingKS(doanId);
  const { data: tauBookings = [] } = useBookingTau(doanId);
  const { data: doanHdv } = useHdvByDoanId(doanId);
  const updateMut = useUpdateBookingKS();
  const deleteMut = useDeleteBookingKS();
  const { data: currentUserName = "" } = useCurrentUserName();
  const [deleteTarget, setDeleteTarget] = useState<BookingKSDisplay | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  // Ẩn booking đã hủy và không còn trong điều tour
  const visibleBookings = (bookings ?? []).filter(
    (b) => !(b.ks_final_status === "ks_xac_nhan_huy" && !b.con_trong_dieu_tour)
  );

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((prev) =>
      prev.size === visibleBookings.length
        ? new Set()
        : new Set(visibleBookings.map((b) => b.id))
    );

  const handleExportAll = async () => {
    if (selectedIds.size === 0) { toast.warning("Chọn ít nhất 1 khách sạn"); return; }
    setIsExporting(true);
    try {
      const selected = visibleBookings.filter((b) => selectedIds.has(b.id));
      await exportBookingWord(tenDoan, selected, tauBookings, soKhach);
      toast.success("Đã xuất file Word");
    } catch (err: unknown) {
      toast.error("Lỗi xuất: " + (err instanceof Error ? err.message : "Vui lòng thử lại"));
    } finally {
      setIsExporting(false);
    }
  };

  const updateStatus = async (
    row: BookingKSDisplay,
    fields: Partial<BookingKSRow>
  ) => {
    try {
      await updateMut.mutateAsync({ id: row.id, fields });
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

  if (!visibleBookings.length && !tauBookings.length)
    return (
      <div className="rounded-xl bg-card border border-border p-14 text-center">
        <p className="text-sm font-medium text-muted-foreground">Chưa có booking nào.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Chọn khách sạn trong tab Điều Tour và lưu để tạo booking.
        </p>
      </div>
    );

  const total = visibleBookings.length;
  const dtConfirmed = visibleBookings.filter((b) => b.ks_dat_truoc_status === "ks_xac_nhan").length;
  const finalConfirmed = visibleBookings.filter((b) => b.ks_final_status === "ks_xac_nhan_final").length;
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
        {visibleBookings.map((row) => (
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

      {tauBookings.length > 0 && (
        <div className="mt-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Tàu du lịch ngày</h3>
          <div className="space-y-2">
            {tauBookings.map((row) => (
              <TauNgayCard
                key={`${row.doan_ngay_id}_${row.bua_an}`}
                row={row}
                tenDoan={tenDoan}
                soKhach={soKhach}
                currentUserName={currentUserName}
              />
            ))}
          </div>
        </div>
      )}

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
  updateStatus: (row: BookingKSDisplay, fields: Partial<BookingKSRow>) => Promise<void>;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const roomDates = getBookingRoomDates(row.ngay_dates);
  const roomInputDates = roomDates.length > 0 ? roomDates : [""];
  const isMultiNightRoom = roomInputDates.length > 1;
  const [soPhongByNight, setSoPhongByNight] = useState(() => expandRoomValues(row.ks_dat_truoc, roomDates));
  const [soPhongFinalByNight, setSoPhongFinalByNight] = useState(() => expandRoomValues(row.ks_final, roomDates));
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
  const [updateNote, setUpdateNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setSoPhongByNight(expandRoomValues(row.ks_dat_truoc, row.ngay_dates));
    setSoPhongFinalByNight(expandRoomValues(row.ks_final, row.ngay_dates));
    setGhiChu(row.ks_ghi_chu_booking || "");
    setDeadline(row.deadline || "");
  }, [row.id, row.ks_dat_truoc, row.ks_final, row.ks_ghi_chu_booking, row.deadline, row.ngay_dates]);

  const updateRoomValue = (
    setter: Dispatch<SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => roomInputDates.map((_, i) => (i === index ? value : prev[i] ?? "")));
  };

  const datTruocRoomText = serializeRoomValues(soPhongByNight);
  const finalRoomText = serializeRoomValues(soPhongFinalByNight);
  const preferredRoomText = finalRoomText || datTruocRoomText || row.ks_final || row.ks_dat_truoc || "";

  // Gộp các đêm liên tiếp có cùng số phòng → 1 block check-in/check-out.
  // Đêm không liên tiếp HOẶC số phòng khác → tách block riêng.
  type NightGroup = { startDate: string; endDate: string; soDem: number; value: string };
  const groupConsecutiveNights = (dates: string[], values: string[]): NightGroup[] => {
    const groups: NightGroup[] = [];
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const value = values[i] ?? "";
      const last = groups[groups.length - 1];
      if (last && last.value === value && nextDateStr(last.endDate) === date) {
        last.endDate = date;
        last.soDem += 1;
      } else {
        groups.push({ startDate: date, endDate: date, soDem: 1, value });
      }
    }
    return groups;
  };

  const roomRowsHtml = () => {
    if (roomDates.length === 0) {
      // KS day-use: không qua đêm → fallback hiển thị ngày sử dụng từ day_use_dates
      // (link qua wrapper canh_diem). Không có thì để "—".
      const dayUseDates = row.day_use_dates ?? [];
      const dayUseRow = dayUseDates.length > 0
        ? `<tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Ngày sử dụng (Day Use)</td><td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${dayUseDates.map(fmtDate).join(", ")}</strong></td></tr>`
        : "";
      return `${dayUseRow}<tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Số phòng / Số bộ</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${preferredRoomText || "—"}</td></tr>`;
    }
    const values = expandRoomValues(preferredRoomText, roomDates);
    const groups = groupConsecutiveNights(roomDates, values);
    return groups.map((g, i) => {
      const checkOut = nextDateStr(g.endDate);
      const groupLabel = groups.length > 1
        ? `<tr><td colspan="2" style="border:1px solid #e2e8f0;padding:6px 12px;background:#eff6ff;font-size:12px;font-weight:600;color:#1d4ed8${i > 0 ? ";border-top:2px solid #bfdbfe" : ""}">Lượt ${i + 1} (${g.soDem} đêm)</td></tr>`
        : "";
      return `
        ${groupLabel}
        <tr>
          <td style="border:1px solid #e2e8f0;padding:8px 12px">Check-in</td>
          <td style="border:1px solid #e2e8f0;padding:8px 12px">${fmtDate(g.startDate)}</td>
        </tr>
        <tr>
          <td style="border:1px solid #e2e8f0;padding:8px 12px">Check-out</td>
          <td style="border:1px solid #e2e8f0;padding:8px 12px">${fmtDate(checkOut)}${groups.length === 1 && g.soDem > 1 ? ` (${g.soDem} đêm)` : ""}</td>
        </tr>
        <tr>
          <td style="border:1px solid #e2e8f0;padding:8px 12px">Số phòng</td>
          <td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${g.value || "—"}</strong></td>
        </tr>`;
    }).join("");
  };

  const buildEmailHtml = (mode: "first" | "update" = "first", note = "") => {
    const ngayDiStr = ngayDi ? fmtDate(ngayDi) : "—";

    if (mode === "update") {
      const senderName = userProfile?.ho_ten || currentUserName;
      const firstDate = roomDates[0];
      const lastDate = roomDates[roomDates.length - 1];
      const checkInStr = firstDate ? fmtDate(firstDate) : "—";
      const checkOutStr = lastDate ? fmtDate(nextDateStr(lastDate)) : "—";
      const soDem = roomDates.length;
      const keyFields = buildKeyFieldsList([
        { label: "Đoàn", value: tenDoan || "—" },
        { label: "Khách sạn", value: row.khach_san_ten || "—" },
        { label: "Check-in", value: checkInStr },
        { label: "Check-out", value: `${checkOutStr}${soDem ? ` (${soDem} đêm)` : ""}` },
        { label: "Số phòng", value: preferredRoomText || "—" },
        { label: "HDV", value: formatHdvForEmail(doanHdv) },
      ]);
      return buildUpdateEmailHtml({
        greeting: `Kính gửi ${row.khach_san_ten || "Quý khách sạn"},`,
        intro: `Cập nhật booking đặt phòng đoàn ${tenDoan}:`,
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
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Mã đoàn</td><td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${tenDoan}</strong></td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Khách sạn</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${row.khach_san_ten}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">HDV</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${formatHdvForEmail(doanHdv)}</td></tr>
        ${roomRowsHtml()}
      </table>
      ${ghiChu ? `<div style="margin-top:20px;background:#f8fafc;border-left:3px solid #3b82f6;padding:12px 16px;border-radius:0 4px 4px 0;font-size:13px"><strong>Ghi chú:</strong> ${ghiChu}</div>` : ""}
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

  const [emailMode, setEmailMode] = useState<"first" | "update">("first");
  const openEmailModal = (mode: "first" | "update" = "first") => {
    setEmailMode(mode);
    setUpdateNote("");
    const datesStr = roomDates.length > 0
      ? roomDates.map(fmtDate).join(", ") + ` (${roomDates.length} đêm)`
      : "";
    setEmailTo(normalizeEmails(row.khach_san_email));
    const baseSubject = `[S8 Travel] Đặt phòng – ${tenDoan} – ${row.khach_san_ten}${datesStr ? ` – ${datesStr}` : ""}`;
    setEmailSubject(mode === "update" ? `Re: ${baseSubject}` : baseSubject);
    setEmailHtml(buildEmailHtml(mode, ""));
    setEmailModalOpen(true);
  };

  useEffect(() => {
    if (!emailModalOpen || emailMode !== "update") return;
    setEmailHtml(buildEmailHtml("update", updateNote));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateNote]);

  const buildMailtoBody = () => {
    const userPhone = userProfile?.so_dien_thoai || "";
    const userName = userProfile?.ho_ten || currentUserName;
    const dayUseDates = row.day_use_dates ?? [];
    const roomLines = roomDates.length > 0
      ? groupConsecutiveNights(roomDates, expandRoomValues(preferredRoomText, roomDates))
        .map((g, i, arr) => {
          const co = fmtDate(nextDateStr(g.endDate));
          const prefix = arr.length > 1 ? `- Lượt ${i + 1} (${g.soDem} đêm): ` : "- ";
          return `${prefix}${fmtDate(g.startDate)} -> ${co}, số phòng: ${g.value || "—"}`;
        })
        .join("\n")
      : (dayUseDates.length > 0
          ? `- Ngày sử dụng (Day Use): ${dayUseDates.map(fmtDate).join(", ")}\n- Số phòng / Số bộ: ${preferredRoomText || "—"}`
          : `- Số phòng: ${preferredRoomText || "—"}`);
    return `Kính gửi ${row.khach_san_ten},

Công ty TNHH Du lịch S8 xin đặt phòng cho đoàn ${tenDoan}:
${roomLines}${ghiChu ? `\n- Ghi chú: ${ghiChu}` : ""}

Kính nhờ xác nhận trong 24 giờ.

${userName}${userPhone ? `\n${userPhone}` : ""}

CÔNG TY TNHH DU LỊCH S8
MST: 0402021137
Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam
Email: s8travel.hddt@gmail.com`;
  };

  const handleSendViaServer = async () => {
    setSending(true);
    try {
      await sendMut.mutateAsync({
        bookingId: row.id,
        loai: emailMode === "update" ? "update" : "dat_truoc",
        to: emailTo,
        subject: emailSubject,
        html: emailHtml,
        sentBy: currentUserName,
        replyTo: userProfile?.email || currentUserEmail || undefined,
        emailThreadId: row.email_thread_id,
        mailContentHash: hashMailContent(buildMailFields()),
      });
      setEmailModalOpen(false);
      toast.success(emailMode === "update" ? "Đã gửi email cập nhật" : "Đã gửi email đặt phòng");
    } catch (err: unknown) {
      toast.error("Lỗi gửi email: " + (err instanceof Error ? err.message : "Vui lòng thử lại"));
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = () => {
    const mailtoBody = buildMailtoBody();
    window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(mailtoBody)}`;
    const hash = hashMailContent(buildMailFields());
    if (emailMode === "update") {
      updateStatus(row, { ks_dat_truoc_sent_at: new Date().toISOString(), ks_dat_truoc_sent_by: currentUserName, mail_content_hash: hash });
    } else {
      updateStatus(row, { ks_dat_truoc_status: "cho_ks_xac_nhan", ks_dat_truoc_sent_at: new Date().toISOString(), ks_dat_truoc_sent_by: currentUserName, mail_content_hash: hash });
    }
    setEmailModalOpen(false);
    toast.success("Đã mở email client");
  };

  const save = async (fields: Partial<BookingKSRow>) => {
    try {
      await updateMut.mutateAsync({ id: row.id, fields });
    } catch {
      toast.error("Lỗi khi lưu");
    }
  };

  const datTruocConfirmed = row.ks_dat_truoc_status === "ks_xac_nhan";
  const isCancelled = row.ks_final_status === "ks_xac_nhan_huy";

  const buildMailFields = () => ({
    khach_san_id: row.khach_san_id,
    check_in_dates: roomDates,
    so_phong: preferredRoomText || "",
    ghi_chu: ghiChu,
  });

  const isActive =
    !isCancelled &&
    (["cho_ks_xac_nhan", "ks_xac_nhan"].includes(row.ks_dat_truoc_status) ||
      ["cho_ks_xac_nhan", "ks_xac_nhan_final"].includes(row.ks_final_status));
  const isDirty = isActive && isMailDirty(row.ks_dat_truoc_sent_at, row.mail_content_hash, buildMailFields());
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
      <div className="px-4 py-3 flex items-start justify-between gap-3 border-b-2 border-sky-200 bg-gradient-to-r from-sky-50 via-sky-50/70 to-blue-50/40">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            className="mt-0.5 shrink-0"
          />
          <div className="min-w-0 flex-1 space-y-1">
            {/* Line 1: tên KS + status */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-sky-900">🏨 {row.khach_san_ten}</span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-medium",
                  overall.cls
                )}
              >
                {overall.label}
              </span>
              {isDirty && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700 flex items-center gap-1" title="Nội dung đã thay đổi so với mail gần nhất — gửi cập nhật để đồng bộ">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                  Có thay đổi
                </span>
              )}
            </div>
            {/* Line 2: info chips */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {row.khach_san_dia_diem && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/70 border border-sky-200 text-sky-800">
                  <MapPin className="h-3 w-3" />
                  {row.khach_san_dia_diem}
                </span>
              )}
              {row.ngay_dates.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/70 border border-sky-200 text-sky-800">
                  📅 {row.ngay_dates.map(fmtDate).join(", ")} ({row.so_dem} đêm)
                </span>
              )}
              {row.day_use_dates && row.day_use_dates.length > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-medium">
                  Day Use: {row.day_use_dates.map(fmtDate).join(", ")}
                </span>
              )}
              {row.khach_san_so_dien_thoai && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/70 border border-sky-200 text-sky-800">
                  <Phone className="h-3 w-3" />
                  {row.khach_san_so_dien_thoai}
                </span>
              )}
            </div>
            {/* Line 3: emails */}
            {row.khach_san_email && (
              <div className="flex items-start gap-1.5 text-xs">
                <Mail className="h-3.5 w-3.5 text-sky-600 shrink-0 mt-0.5" />
                <div className="flex flex-wrap gap-1">
                  {String(row.khach_san_email)
                    .split(/[,;]/)
                    .map((e) => e.trim())
                    .filter(Boolean)
                    .map((e, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-white border border-sky-200 text-sky-700 font-mono text-[11px]">
                        {e}
                      </span>
                    ))}
                </div>
              </div>
            )}
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
            <div className="space-y-1.5">
              {roomInputDates.map((date, i) => (
                <div key={date || "single"} className="flex items-center gap-2">
                  {isMultiNightRoom && (
                    <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
                      {fmtDate(date)}
                    </span>
                  )}
                  <Input
                    value={soPhongByNight[i] ?? ""}
                    onChange={(e) => updateRoomValue(setSoPhongByNight, i, e.target.value)}
                    onBlur={() => save({ ks_dat_truoc: serializeRoomValues(soPhongByNight) || null })}
                    placeholder="VD: 6 TWN, 1 DBL..."
                    className="h-8 text-xs"
                    disabled={isCancelled}
                  />
                </div>
              ))}
            </div>
          </div>
          {datTruocConfirmed ? (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Số phòng Final</p>
              <div className="space-y-1.5">
                {roomInputDates.map((date, i) => (
                  <div key={date || "single"} className="flex items-center gap-2">
                    {isMultiNightRoom && (
                      <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
                        {fmtDate(date)}
                      </span>
                    )}
                    <Input
                      value={soPhongFinalByNight[i] ?? ""}
                      onChange={(e) => updateRoomValue(setSoPhongFinalByNight, i, e.target.value)}
                      onBlur={() => save({ ks_final: serializeRoomValues(soPhongFinalByNight) || null })}
                      placeholder="VD: 5 TWN, 2 DBL..."
                      className="h-8 text-xs"
                      disabled={isCancelled}
                    />
                  </div>
                ))}
              </div>
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
          <DatePicker
            value={deadline}
            onChange={(v) => { setDeadline(v); save({ deadline: v || null }); }}
            className="h-8 w-44 text-xs"
            placeholder="dd/mm/yyyy"
          />
        </div>

        {/* Gửi email — chỉ hiện ở giai đoạn đặt trước */}
        {!isCancelled && row.ks_dat_truoc_status === "chua_gui" && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs w-full"
            onClick={() => openEmailModal("first")}
          >
            <Mail className="h-3.5 w-3.5 mr-1.5" /> Gửi email đặt phòng
          </Button>
        )}

        {/* Gửi cập nhật — sau khi đã gửi lần đầu (server hoặc mailto). Gmail group theo Subject+From. */}
        {!isCancelled && row.ks_dat_truoc_sent_at && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs w-full border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={() => openEmailModal("update")}
            title="Gửi email cập nhật — sẽ thread vào mail booking cũ"
          >
            <Mail className="h-3.5 w-3.5 mr-1.5" /> Gửi cập nhật
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
      title={emailMode === "update" ? "Gửi email cập nhật (thread vào mail cũ)" : "Gửi email đặt phòng"}
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
      mode={emailMode}
      updateNote={updateNote}
      onUpdateNoteChange={setUpdateNote}
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
  updateStatus: (row: BookingKSDisplay, fields: Partial<BookingKSRow>) => Promise<void>;
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
  updateStatus: (row: BookingKSDisplay, fields: Partial<BookingKSRow>) => Promise<void>;
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
