import { useState, useEffect } from "react";
import { normalizeEmails } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail, Check, X, ChevronDown, ChevronUp } from "lucide-react";
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

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  chua_gui:    { label: "Chưa gửi",    cls: "bg-muted text-muted-foreground" },
  da_gui:      { label: "Đã gửi",      cls: "bg-amber-100 text-amber-700" },
  da_xac_nhan: { label: "Đã xác nhận", cls: "bg-emerald-100 text-emerald-700" },
  da_huy:      { label: "Đã hủy",      cls: "bg-red-100 text-red-700" },
};

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
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setSelectedSetMenu(row.set_menu_id);
    setDeadline(row.deadline || "");
  }, [row.booking_id]);

  const save = async (fields: Record<string, any>) => {
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

  const buildEmailHtml = (smId: number | null) => {
    const sm = setMenuOptions.find((s) => s.id === smId);
    const ngayStr = fmtNgayTau(row.ngay_date, row.ngay_so);
    const buaStr = row.bua_an === "trua" ? "Bữa trưa" : "Bữa tối";
    const soKhachStr = soKhach ? `${soKhach} khách` : "—";
    const menuStr = sm ? `${sm.ten_set}${sm.gia ? ` – ${sm.gia.toLocaleString("vi-VN")} ${sm.don_vi}` : ""}` : "—";

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
      <p style="margin-top:24px;color:#64748b;font-size:13px">Kính nhờ quý đơn vị xác nhận booking trong vòng <strong>24 giờ</strong>.<br>Trân trọng cảm ơn!</p>
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
    const ngayStr = fmtNgayTau(row.ngay_date, row.ngay_so);
    const buaStr = row.bua_an === "trua" ? "Trưa" : "Tối";
    setEmailTo(normalizeEmails(row.nha_hang_email));
    setEmailSubject(`[S8 Travel] Đặt tàu – ${tenDoan} – ${ngayStr} – ${buaStr}`);
    setEmailHtml(buildEmailHtml(selectedSetMenu));
    setEmailModalOpen(true);
  };

  const handleSendViaServer = async () => {
    if (!row.booking_id) {
      toast.error("Cần lưu booking trước khi gửi email");
      return;
    }
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
      });
      setEmailModalOpen(false);
      toast.success("Đã gửi email đặt tàu");
    } catch (err: any) {
      toast.error("Lỗi gửi email: " + (err?.message || "Vui lòng thử lại"));
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

  const handleConfirm = async () => {
    if (!row.booking_id) return;
    try {
      await save({ booking_status: "da_xac_nhan" });
      toast.success("Đã xác nhận tàu");
    } catch {
      toast.error("Lỗi cập nhật");
    }
  };

  const handleHuy = async () => {
    try {
      await save({ booking_status: "da_huy" });
      toast.success("Đã hủy booking tàu");
    } catch {
      toast.error("Lỗi cập nhật");
    }
  };

  const statusCfg = STATUS_CFG[row.booking_status] || STATUS_CFG.chua_gui;
  const ngayStr = fmtNgayTau(row.ngay_date, row.ngay_so);

  // Need a booking_id to send email — auto-create one by saving set_menu first if needed
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
      });
      toast.info("Đã tạo booking — vui lòng thử gửi lại");
      return false;
    } catch {
      toast.error("Lỗi tạo booking");
      return false;
    }
  };

  const handleOpenEmail = async () => {
    const ok = await ensureBookingExists();
    if (ok) openEmailModal();
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div
          className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border bg-muted/20 cursor-pointer select-none"
          onClick={() => setCollapsed((v) => !v)}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-semibold truncate">{row.nha_hang_ten}</span>
            <BuaLabel bua={row.bua_an} />
            <span className="text-xs text-muted-foreground hidden sm:inline">{ngayStr}</span>
            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", statusCfg.cls)}>
              {statusCfg.label}
            </span>
          </div>
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />}
        </div>

        {!collapsed && (
          <div className="px-4 py-3 space-y-3">
            <p className="text-xs text-muted-foreground sm:hidden">{ngayStr}</p>

            {/* Set menu selector */}
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
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                onBlur={() => save({ deadline: deadline || null })}
                className="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Email button */}
            {row.booking_status === "chua_gui" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs w-full"
                onClick={handleOpenEmail}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" /> Gửi email đặt tàu
              </Button>
            )}

            {/* Status flow */}
            {row.booking_status === "da_gui" && (
              <div className="rounded-lg border border-amber-200/60 bg-amber-50/30 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-amber-700">Chờ xác nhận</p>
                  {row.sent_at && (
                    <p className="text-[10px] text-muted-foreground">Gửi: {fmtDatetime(row.sent_at)}</p>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-emerald-700 border-emerald-300 flex-1"
                    onClick={handleConfirm}
                  >
                    <Check className="h-3 w-3 mr-1" /> Đã xác nhận
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
                {/* Resend option */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground w-full"
                  onClick={openEmailModal}
                >
                  <Mail className="h-3 w-3 mr-1" /> Gửi lại email
                </Button>
              </div>
            )}

            {row.booking_status === "da_xac_nhan" && (
              <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/30 p-3 flex items-center justify-between gap-2">
                <p className="text-xs text-emerald-700 font-medium">✓ Đã xác nhận</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] text-red-400"
                  onClick={handleHuy}
                >
                  <X className="h-3 w-3 mr-0.5" /> Hủy
                </Button>
              </div>
            )}

            {row.booking_status === "da_huy" && (
              <div className="rounded-lg border border-red-200/60 bg-red-50/30 p-3">
                <p className="text-xs text-red-600">✕ Đã hủy</p>
              </div>
            )}
          </div>
        )}
      </div>

      <EmailPreviewModal
        open={emailModalOpen}
        onOpenChange={setEmailModalOpen}
        title="Gửi email đặt tàu"
        to={emailTo}
        onToChange={setEmailTo}
        subject={emailSubject}
        onSubjectChange={setEmailSubject}
        html={emailHtml}
        onHtmlChange={setEmailHtml}
        onSendViaServer={handleSendViaServer}
        onMailtoFallback={handleMailtoFallback}
        sending={sending}
      />
    </>
  );
}
