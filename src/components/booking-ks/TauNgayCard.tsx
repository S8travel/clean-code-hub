import { useState, useEffect } from "react";
import { normalizeEmails } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { Mail, Check, X, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  useSendNHBookingEmail,
  useSetMenuOptions,
} from "@/hooks/use-booking-nh";
import {
  useUpdateBookingTau,
  fmtNgayTau,
  type TauNgayDisplayRow,
} from "@/hooks/use-booking-tau";
import { useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import { buildUpdateEmailHtml, buildKeyFieldsList } from "@/lib/email-update";
import { hashMailContent, isMailDirty } from "@/lib/mail-content-hash";

function fmtDatetime(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d), "dd/MM HH:mm", { locale: vi }); } catch { return ""; }
}

function BuaLabel({ bua }: { bua: "trua" | "toi" }) {
  return (
    <span className={cn(
      "px-1.5 py-0.5 rounded text-[10px] font-semibold",
      bua === "trua" ? "bg-orange-100 text-orange-700" : "bg-indigo-100 text-indigo-700"
    )}>
      {bua === "trua" ? "Trưa" : "Tối"}
    </span>
  );
}

function getOverallStatus(row: TauNgayDisplayRow): { label: string; cls: string } {
  const { dat_truoc_status: dt, final_status: fn } = row;
  if (fn === "xac_nhan_huy")      return { label: "Đã hủy",         cls: "bg-red-100 text-red-700" };
  if (fn === "cho_xac_nhan_huy")  return { label: "Chờ XN hủy",     cls: "bg-orange-100 text-orange-700" };
  if (fn === "xac_nhan_final")    return { label: "Final đã XN",     cls: "bg-purple-100 text-purple-700" };
  if (fn === "cho_xac_nhan")      return { label: "Chờ XN Final",    cls: "bg-green-100 text-green-700" };
  if (dt === "xac_nhan")          return { label: "Đặt trước đã XN", cls: "bg-teal-100 text-teal-700" };
  if (dt === "cho_xac_nhan")      return { label: "Chờ XN đặt trước", cls: "bg-blue-100 text-blue-700" };
  return { label: "Chưa gửi", cls: "bg-muted text-muted-foreground" };
}

interface Props {
  row: TauNgayDisplayRow;
  tenDoan: string;
  soKhach?: number;
  currentUserName: string;
}

export default function TauNgayCard({ row, tenDoan, soKhach, currentUserName }: Props) {
  const updateMut = useUpdateBookingTau();
  const sendEmailMut = useSendNHBookingEmail();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();
  const { data: setMenuOptions = [] } = useSetMenuOptions(row.nha_hang_id);

  const [selectedSetMenu, setSelectedSetMenu] = useState<number | null>(row.set_menu_id);
  const [deadline, setDeadline] = useState(row.deadline || "");
  const [collapsed, setCollapsed] = useState(false);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailMode, setEmailMode] = useState<"first" | "update">("first");
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setSelectedSetMenu(row.set_menu_id);
    setDeadline(row.deadline || "");
  }, [row.booking_id, row.set_menu_id, row.deadline]);

  const save = async (fields: Partial<TauNgayDisplayRow>) => {
    try {
      await updateMut.mutateAsync({
        booking_id: row.booking_id,
        doan_ngay_id: row.doan_ngay_id,
        doan_id: row.doan_id,
        bua_an: row.bua_an,
        nha_hang_id: row.nha_hang_id,
        ...fields,
      });
    } catch {
      toast.error("Lỗi khi lưu");
    }
  };

  const updateStatus = async (fields: Partial<TauNgayDisplayRow>) => {
    try {
      await save(fields);
    } catch {
      toast.error("Lỗi cập nhật");
    }
  };

  const ensureBookingExists = async (): Promise<boolean> => {
    if (row.booking_id) return true;
    try {
      await updateMut.mutateAsync({
        booking_id: null,
        doan_ngay_id: row.doan_ngay_id,
        doan_id: row.doan_id,
        bua_an: row.bua_an,
        nha_hang_id: row.nha_hang_id,
        set_menu_id: selectedSetMenu,
        booking_status: "chua_gui",
        dat_truoc_status: "chua_gui",
        final_status: "chua_gui",
      });
      toast.info("Đã tạo booking — vui lòng thử gửi lại");
      return false;
    } catch {
      toast.error("Lỗi tạo booking");
      return false;
    }
  };

  const buildEmailHtml = (smId: number | null, mode: "first" | "update" = "first", note = "") => {
    const sm = setMenuOptions.find((s) => s.id === smId);
    const ngayStr = fmtNgayTau(row.ngay_date, row.ngay_so);
    const buaStr = row.bua_an === "trua" ? "Bữa trưa" : "Bữa tối";
    const soKhachStr = soKhach ? `${soKhach} khách` : "—";
    const menuStr = sm ? `${sm.ten_set}${sm.gia ? ` – ${sm.gia.toLocaleString("vi-VN")} ${sm.don_vi}` : ""}` : "—";

    if (mode === "update") {
      const senderName = userProfile?.ho_ten || currentUserName;
      const keyFields = buildKeyFieldsList([
        { label: "Đoàn", value: tenDoan || "—" },
        { label: "Ngày", value: ngayStr },
        { label: "Bữa", value: buaStr },
        { label: "Số khách", value: soKhachStr },
        { label: "Set menu / Buffet", value: menuStr },
      ]);
      return buildUpdateEmailHtml({
        greeting: `Kính gửi ${row.nha_hang_ten || "Quý đối tác"},`,
        intro: `Cập nhật booking đặt tàu đoàn ${tenDoan}:`,
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
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${row.nha_hang_ten}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin đặt tàu cho đoàn <strong>${tenDoan}</strong>:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <tr style="background:#f1f5f9">
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Hạng mục</th>
          <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Thông tin</th>
        </tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Đoàn</td><td style="border:1px solid #e2e8f0;padding:8px 12px"><strong>${tenDoan}</strong></td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Ngày</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${ngayStr}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Bữa</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${buaStr}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Số khách</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${soKhachStr}</td></tr>
        <tr><td style="border:1px solid #e2e8f0;padding:8px 12px">Set menu / Buffet</td><td style="border:1px solid #e2e8f0;padding:8px 12px">${menuStr}</td></tr>
      </table>
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

  const openEmailModal = (mode: "first" | "update" = "first") => {
    setEmailMode(mode);
    setUpdateNote("");
    const ngayStr = fmtNgayTau(row.ngay_date, row.ngay_so);
    const buaStr = row.bua_an === "trua" ? "Trưa" : "Tối";
    setEmailTo(normalizeEmails(row.nha_hang_email));
    const baseSubject = `[S8 Travel] Đặt tàu – ${tenDoan} – ${ngayStr} – ${buaStr}${soKhach ? ` – ${soKhach} khách` : ""}`;
    setEmailSubject(mode === "update" ? `Re: ${baseSubject}` : baseSubject);
    setEmailHtml(buildEmailHtml(selectedSetMenu, mode, ""));
    setEmailModalOpen(true);
  };

  useEffect(() => {
    if (!emailModalOpen || emailMode !== "update") return;
    setEmailHtml(buildEmailHtml(selectedSetMenu, "update", updateNote));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateNote]);

  const handleOpenEmail = async () => {
    const ok = await ensureBookingExists();
    if (ok) openEmailModal();
  };

  const handleSendViaServer = async () => {
    if (!row.booking_id) { toast.error("Cần lưu booking trước khi gửi email"); return; }
    setSending(true);
    try {
      await sendEmailMut.mutateAsync({
        bookingId: row.booking_id,
        doanId: row.doan_id,
        to: emailTo,
        subject: emailSubject,
        html: emailHtml,
        sentBy: currentUserName,
        replyTo: userProfile?.email || currentUserEmail || undefined,
        emailThreadId: row.email_thread_id,
        mode: emailMode,
        mailContentHash: hashMailContent(buildMailFields()),
      });
      // mode='update' → giữ nguyên dat_truoc_status, không ghi đè dat_truoc_sent_at
      if (emailMode !== "update") {
        await save({
          dat_truoc_status: "cho_xac_nhan",
          dat_truoc_sent_at: new Date().toISOString(),
          dat_truoc_sent_by: currentUserName,
        });
      }
      setEmailModalOpen(false);
      toast.success(emailMode === "update" ? "Đã gửi email cập nhật tàu" : "Đã gửi email đặt tàu");
    } catch (err: unknown) {
      toast.error("Lỗi gửi email: " + (errMsg(err) || "Vui lòng thử lại"));
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = () => {
    const ngayStr = fmtNgayTau(row.ngay_date, row.ngay_so);
    const buaStr = row.bua_an === "trua" ? "Bữa trưa" : "Bữa tối";
    const sm = setMenuOptions.find((s) => s.id === selectedSetMenu);
    const menuStr = sm ? sm.ten_set : "—";
    const soKhachStr = soKhach ? `${soKhach} khách` : "—";
    const userName = userProfile?.ho_ten || currentUserName;
    const userPhone = userProfile?.so_dien_thoai || "";
    const body = `Kính gửi ${row.nha_hang_ten},\n\nCông ty TNHH Du lịch S8 xin đặt tàu cho đoàn ${tenDoan}:\n- Ngày: ${ngayStr}\n- Bữa: ${buaStr}\n- Số khách: ${soKhachStr}\n- Set menu: ${menuStr}\n\nKính nhờ xác nhận trong 24 giờ.\n\n${userName}${userPhone ? `\n${userPhone}` : ""}\n\nCÔNG TY TNHH DU LỊCH S8\nMST: 0402021137\nEmail: s8travel.hddt@gmail.com`;
    window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`;
    setEmailModalOpen(false);
  };

  const overall = getOverallStatus(row);
  const ngayStr = fmtNgayTau(row.ngay_date, row.ngay_so);
  const datTruocConfirmed = row.dat_truoc_status === "xac_nhan";
  const isCancelled = row.final_status === "xac_nhan_huy";

  const buildMailFields = () => ({
    ngay_date: row.ngay_date,
    bua_an: row.bua_an,
    nha_hang_id: row.nha_hang_id,
    set_menu_id: selectedSetMenu,
    set_menu_ten: setMenuOptions.find((s) => s.id === selectedSetMenu)?.ten_set ?? null,
    so_khach: soKhach ?? null,
  });

  const isActive =
    !isCancelled &&
    (["cho_xac_nhan", "xac_nhan"].includes(row.dat_truoc_status) ||
      ["cho_xac_nhan", "xac_nhan_final"].includes(row.final_status));
  const isDirty = isActive && isMailDirty(row.dat_truoc_sent_at, row.mail_content_hash, buildMailFields());

  return (
    <>
      <div className={cn(
        "rounded-xl border bg-card overflow-hidden transition-colors",
        isCancelled ? "opacity-60 border-border" : "border-border"
      )}>
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border bg-muted/20 cursor-pointer select-none"
          onClick={() => setCollapsed((v) => !v)}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
            <span className="text-sm font-semibold truncate">{row.nha_hang_ten}</span>
            <BuaLabel bua={row.bua_an} />
            <span className="text-xs text-muted-foreground hidden sm:inline">{ngayStr}</span>
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", overall.cls)}>
              {overall.label}
            </span>
            {isDirty && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700 flex items-center gap-1" title="Nội dung đã thay đổi so với mail gần nhất — gửi cập nhật để đồng bộ">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                Có thay đổi
              </span>
            )}
          </div>
          {collapsed
            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
            : <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />}
        </div>

        {!collapsed && (
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-muted-foreground sm:hidden">{ngayStr}</p>

            {/* Set menu */}
            {setMenuOptions.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Set menu / Buffet</p>
                <select
                  value={selectedSetMenu ?? ""}
                  onChange={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    setSelectedSetMenu(v);
                    save({ set_menu_id: v });
                  }}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— Chưa chọn —</option>
                  {setMenuOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.ten_set}{s.gia ? ` – ${s.gia.toLocaleString("vi-VN")} ${s.don_vi}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Deadline */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Deadline xác nhận</p>
              <DatePicker
                value={deadline}
                onChange={(v) => { setDeadline(v); save({ deadline: v || null }); }}
                className="h-8 w-44 text-xs"
              />
            </div>

            {/* Two-phase booking sections */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <DatTruocSection
                row={row}
                onOpenEmail={handleOpenEmail}
                onResendEmail={() => openEmailModal("update")}
                onUpdateStatus={updateStatus}
              />
              <FinalSection
                row={row}
                datTruocConfirmed={datTruocConfirmed}
                onUpdateStatus={updateStatus}
              />
            </div>
          </div>
        )}
      </div>

      <EmailPreviewModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        title={emailMode === "update" ? "Gửi email cập nhật tàu (thread vào mail cũ)" : "Gửi email đặt tàu"}
        to={emailTo}
        onToChange={setEmailTo}
        subject={emailSubject}
        onSubjectChange={setEmailSubject}
        html={emailHtml}
        onHtmlChange={setEmailHtml}
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
  onOpenEmail,
  onResendEmail,
  onUpdateStatus,
}: {
  row: TauNgayDisplayRow;
  onOpenEmail: () => void;
  onResendEmail: () => void;
  onUpdateStatus: (fields: Partial<TauNgayDisplayRow>) => void;
}) {
  const status = row.dat_truoc_status;

  const BADGE: Record<string, { label: string; dot: string }> = {
    chua_gui:     { label: "Chưa gửi",         dot: "bg-muted-foreground/30" },
    cho_xac_nhan: { label: "Chờ tàu xác nhận", dot: "bg-amber-400" },
    xac_nhan:     { label: "Tàu đã xác nhận",  dot: "bg-teal-500" },
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

      {status === "chua_gui" && (
        <Button size="sm" variant="outline" className="h-8 text-xs w-full" onClick={onOpenEmail}>
          <Mail className="h-3.5 w-3.5 mr-1.5" /> Gửi email đặt tàu
        </Button>
      )}

      {status === "cho_xac_nhan" && (
        <div className="space-y-1.5">
          {row.dat_truoc_sent_at && (
            <p className="text-[10px] text-muted-foreground">
              Gửi lúc: {fmtDatetime(row.dat_truoc_sent_at)}
            </p>
          )}
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs text-teal-600 border-teal-300 w-full"
            onClick={() => onUpdateStatus({
              dat_truoc_status: "xac_nhan",
              dat_truoc_confirm_at: new Date().toISOString(),
            })}
          >
            <Check className="h-3 w-3 mr-1" /> Tàu xác nhận đặt trước
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-6 text-[10px] text-amber-700 border-amber-300 hover:bg-amber-50 w-full"
            onClick={onResendEmail}
            title="Gửi email cập nhật — sẽ thread vào mail booking cũ"
          >
            <Mail className="h-3 w-3 mr-1" /> Gửi cập nhật
          </Button>
        </div>
      )}

      {status === "xac_nhan" && (
        <div className="space-y-1.5">
          {row.dat_truoc_confirm_at && (
            <p className="text-[10px] text-teal-600">
              ✓ XN lúc: {fmtDatetime(row.dat_truoc_confirm_at)}
            </p>
          )}
          {row.dat_truoc_sent_at && (
            <Button
              size="sm" variant="outline"
              className="h-6 text-[10px] text-amber-700 border-amber-300 hover:bg-amber-50 w-full"
              onClick={onResendEmail}
              title="Gửi email cập nhật — sẽ thread vào mail booking cũ"
            >
              <Mail className="h-3 w-3 mr-1" /> Gửi cập nhật
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Final ─────────────────────────────────────────────────────────────────────
function FinalSection({
  row,
  datTruocConfirmed,
  onUpdateStatus,
}: {
  row: TauNgayDisplayRow;
  datTruocConfirmed: boolean;
  onUpdateStatus: (fields: Partial<TauNgayDisplayRow>) => void;
}) {
  const status = row.final_status;

  if (!datTruocConfirmed) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/10 p-3 flex items-center justify-center min-h-[80px]">
        <p className="text-xs text-muted-foreground italic">Chờ xác nhận đặt trước</p>
      </div>
    );
  }

  const BADGE: Record<string, { label: string; dot: string }> = {
    chua_gui:          { label: "Chờ xử lý",       dot: "bg-muted-foreground/30" },
    cho_xac_nhan:      { label: "Chờ tàu XN",      dot: "bg-amber-400" },
    xac_nhan_final:    { label: "Tàu đã XN Final", dot: "bg-purple-500" },
    cho_xac_nhan_huy:  { label: "Chờ XN hủy",      dot: "bg-orange-400" },
    xac_nhan_huy:      { label: "Đã hủy",           dot: "bg-red-400" },
  };
  const badge = BADGE[status] || BADGE.chua_gui;

  const handleHuy = () =>
    onUpdateStatus({ final_status: "cho_xac_nhan_huy" });

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
            size="sm" variant="outline"
            className="h-7 text-xs text-green-700 border-green-300 flex-1"
            onClick={() => onUpdateStatus({ final_status: "cho_xac_nhan" })}
          >
            <Check className="h-3 w-3 mr-1" /> Final
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-7 w-7 p-0 text-red-500 border-red-300 shrink-0"
            onClick={handleHuy} title="Hủy booking"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {status === "cho_xac_nhan" && (
        <div className="flex gap-1">
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs text-purple-600 border-purple-300 flex-1"
            onClick={() => onUpdateStatus({
              final_status: "xac_nhan_final",
              final_confirm_at: new Date().toISOString(),
            })}
          >
            <Check className="h-3 w-3 mr-1" /> Tàu xác nhận Final
          </Button>
          <Button
            size="sm" variant="outline"
            className="h-7 w-7 p-0 text-red-500 border-red-300 shrink-0"
            onClick={handleHuy} title="Hủy booking"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {status === "xac_nhan_final" && (
        <div className="space-y-1.5">
          {row.final_confirm_at && (
            <p className="text-[10px] text-purple-600">
              ✓ Final lúc: {fmtDatetime(row.final_confirm_at)}
            </p>
          )}
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs text-red-500 border-red-300 w-full"
            onClick={handleHuy}
          >
            <X className="h-3 w-3 mr-1" /> Hủy booking
          </Button>
        </div>
      )}

      {status === "cho_xac_nhan_huy" && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-orange-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Chờ tàu xác nhận hủy
          </p>
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs text-red-600 border-red-300 w-full"
            onClick={() => onUpdateStatus({
              final_status: "xac_nhan_huy",
              final_confirm_at: new Date().toISOString(),
            })}
          >
            <Check className="h-3 w-3 mr-1" /> Tàu xác nhận hủy
          </Button>
        </div>
      )}

      {status === "xac_nhan_huy" && (
        <p className="text-xs text-red-500">
          ✕ Đã hủy{row.final_confirm_at ? ` ${fmtDatetime(row.final_confirm_at)}` : ""}
        </p>
      )}
    </div>
  );
}
