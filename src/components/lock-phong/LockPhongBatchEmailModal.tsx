import { useState, useEffect } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { normalizeEmails } from "@/lib/utils";
import EmailPreviewModal from "@/components/shared/EmailPreviewModal";
import {
  useSendLockPhongBatchEmail,
  type LockPhongDisplay,
  type LockPhongKSDisplay,
} from "@/hooks/use-lock-phong";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";

function fmtDate(d: string) {
  try {
    return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return d;
  }
}

function EmailStatusBadge({ status }: { status: string }) {
  if (status === "da_xac_nhan")
    return <Badge className="text-[10px] bg-teal-100 text-teal-700 border-0">Đã XN</Badge>;
  if (status === "cho_xac_nhan")
    return <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">Chờ XN</Badge>;
  if (status === "da_huy")
    return <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Đã hủy</Badge>;
  return <Badge className="text-[10px] bg-muted text-muted-foreground border-0">Chưa gửi</Badge>;
}

export interface KSGroupEntry {
  lockPhong: LockPhongDisplay;
  ksRow: LockPhongKSDisplay;
}

export interface KSGroupForBatch {
  khach_san_id: number;
  khach_san_ten: string;
  khach_san_email: string | null;
  entries: KSGroupEntry[];
}

function buildBatchHtml(
  group: KSGroupForBatch,
  entries: KSGroupEntry[],
  userName: string,
  userPhone: string | null
): string {
  const rows = entries
    .map(
      ({ lockPhong, ksRow }) => `
      <tr>
        <td style="border:1px solid #e2e8f0;padding:8px 12px">${lockPhong.ten_doan}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b">${lockPhong.ten_seri}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 12px">${fmtDate(lockPhong.ngay_xuat_phat)}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 12px">${fmtDate(ksRow.check_in)}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 12px">${fmtDate(ksRow.check_out)}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 12px;text-align:center"><strong>${ksRow.so_dem}</strong></td>
        <td style="border:1px solid #e2e8f0;padding:8px 12px">${ksRow.so_phong || "—"}</td>
        <td style="border:1px solid #e2e8f0;padding:8px 12px;color:#64748b">${ksRow.ghi_chu || lockPhong.ghi_chu || ""}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b">
  <div style="max-width:780px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
    <div style="background:#0f172a;padding:24px 32px;text-align:center">
      <h2 style="margin:0;color:#fff;font-size:18px">CÔNG TY TNHH DU LỊCH S8</h2>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:12px">S8 TRAVEL COMPANY | MST: 0402021137</p>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 8px;font-size:15px">Kính gửi <strong>${group.khach_san_ten}</strong>,</p>
      <p style="margin:0 0 20px;color:#475569">Công ty TNHH Du lịch S8 xin lock phòng trước cho các đoàn sau:</p>
      <div style="overflow-x:auto">
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <tr style="background:#f1f5f9">
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Tên đoàn</th>
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Seri</th>
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Ngày xuất phát</th>
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Check-in</th>
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Check-out</th>
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:center">Đêm</th>
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Yêu cầu phòng</th>
            <th style="border:1px solid #e2e8f0;padding:8px 12px;text-align:left">Ghi chú</th>
          </tr>
          ${rows}
        </table>
      </div>
      <p style="margin-top:24px;color:#64748b;font-size:13px">Kính nhờ quý khách sạn xác nhận lock phòng trong vòng <strong>24 giờ</strong>.<br>Trân trọng cảm ơn!</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.8">
        <strong>${userName}</strong>${userPhone ? `<br>${userPhone}` : ""}<br><br>
        <strong style="color:#0f172a">CÔNG TY TNHH DU LỊCH S8</strong><br>
        MST: 0402021137<br>
        Đ/C: Tầng 2, Tòa nhà Kim Sơn, Số 18 Phan Thành Tài, Phường Hòa Cường, Thành Phố Đà Nẵng, Việt Nam<br>
        Email: s8travel.hddt@gmail.com
      </p>
    </div>
  </div>
</body></html>`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: KSGroupForBatch;
}

export default function LockPhongBatchEmailModal({ open, onOpenChange, group }: Props) {
  const { data: currentUserName = "" } = useCurrentUserName();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();
  const sendMut = useSendLockPhongBatchEmail();

  // Pre-select unsent entries
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(group.entries.filter((e) => e.ksRow.email_status === "chua_gui").map((e) => e.ksRow.id))
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(() => normalizeEmails(group.khach_san_email));
  const [emailSubject, setEmailSubject] = useState(
    () => `[S8 Travel] Lock Phòng – ${group.khach_san_ten}`
  );
  const [emailHtml, setEmailHtml] = useState("");
  const [sending, setSending] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setSelectedIds(
        new Set(group.entries.filter((e) => e.ksRow.email_status === "chua_gui").map((e) => e.ksRow.id))
      );
      setEmailTo(normalizeEmails(group.khach_san_email));
      setEmailSubject(`[S8 Travel] Lock Phòng – ${group.khach_san_ten}`);
      setPreviewOpen(false);
    }
  }, [open, group]);

  const selectedEntries = group.entries.filter((e) => selectedIds.has(e.ksRow.id));

  const toggleEntry = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenPreview = () => {
    if (selectedEntries.length === 0) {
      toast.error("Chọn ít nhất 1 đoàn để gửi");
      return;
    }
    const name = userProfile?.ho_ten || currentUserName;
    const html = buildBatchHtml(group, selectedEntries, name, userProfile?.so_dien_thoai ?? null);
    setEmailHtml(html);
    setPreviewOpen(true);
  };

  const handleSendViaServer = async () => {
    setSending(true);
    try {
      const sentBy = userProfile?.ho_ten || currentUserName;
      const replyTo = userProfile?.email || currentUserEmail || undefined;
      // Only update status for rows that were chua_gui
      const idsToMark = selectedEntries
        .filter((e) => e.ksRow.email_status === "chua_gui")
        .map((e) => e.ksRow.id);
      await sendMut.mutateAsync({
        ksIds: idsToMark,
        to: emailTo,
        subject: emailSubject,
        html: emailHtml,
        sentBy,
        replyTo,
      });
      toast.success("Đã gửi email gộp");
      setPreviewOpen(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Lỗi gửi email: " + (err?.message || "Vui lòng thử lại"));
    } finally {
      setSending(false);
    }
  };

  const handleMailtoFallback = () => {
    const name = userProfile?.ho_ten || currentUserName;
    const phone = userProfile?.so_dien_thoai || "";
    const lines = selectedEntries.map(
      ({ lockPhong, ksRow }) =>
        `- ${lockPhong.ten_doan} (${lockPhong.ten_seri}): ${fmtDate(ksRow.check_in)} → ${fmtDate(ksRow.check_out)} (${ksRow.so_dem} đêm)${ksRow.so_phong ? ", " + ksRow.so_phong : ""}`
    );
    const body =
      `Kính gửi ${group.khach_san_ten},\n\n` +
      `Công ty TNHH Du lịch S8 xin lock phòng trước cho các đoàn:\n\n` +
      lines.join("\n") +
      `\n\nKính nhờ xác nhận trong 24 giờ.\n\n` +
      `${name}${phone ? `\n${phone}` : ""}\n\nCÔNG TY TNHH DU LỊCH S8\nMST: 0402021137\nEmail: s8travel.hddt@gmail.com`;
    window.location.href = `mailto:${emailTo}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`;
    setPreviewOpen(false);
    onOpenChange(false);
    toast.success("Đã mở email client");
  };

  return (
    <>
      {/* Step 1: Select entries */}
      <Dialog open={open && !previewOpen} onOpenChange={(v) => { if (!v) onOpenChange(false); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Gửi email gộp — {group.khach_san_ten}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 py-1">
            <p className="text-xs text-muted-foreground">
              Chọn các đoàn muốn đưa vào email. Mặc định chọn các đoàn chưa gửi.
            </p>
            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
              {group.entries.map(({ lockPhong, ksRow }) => (
                <label
                  key={ksRow.id}
                  className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/20 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedIds.has(ksRow.id)}
                    onCheckedChange={() => toggleEntry(ksRow.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{lockPhong.ten_doan}</span>
                      <span className="text-xs text-muted-foreground">({lockPhong.ten_seri})</span>
                      <EmailStatusBadge status={ksRow.email_status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(ksRow.check_in)} → {fmtDate(ksRow.check_out)} · {ksRow.so_dem} đêm
                      {ksRow.so_phong ? ` · ${ksRow.so_phong}` : ""}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {selectedEntries.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Đã chọn <span className="font-medium text-foreground">{selectedEntries.length}</span> đoàn
                {selectedEntries.filter((e) => e.ksRow.email_status !== "chua_gui").length > 0 && (
                  <span className="text-amber-600">
                    {" "}(bao gồm{" "}
                    {selectedEntries.filter((e) => e.ksRow.email_status !== "chua_gui").length} đoàn đã gửi — chỉ đoàn "Chưa gửi" mới cập nhật trạng thái)
                  </span>
                )}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button
              size="sm"
              onClick={handleOpenPreview}
              disabled={selectedEntries.length === 0}
            >
              Xem trước & Gửi →
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 2: Email preview */}
      {previewOpen && (
        <EmailPreviewModal
          open={previewOpen}
          onOpenChange={(v) => { if (!v) setPreviewOpen(false); }}
          title={`Gửi email gộp — ${group.khach_san_ten} (${selectedEntries.length} đoàn)`}
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
      )}
    </>
  );
}
