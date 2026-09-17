import { useState, useEffect, useMemo, Fragment } from "react";
import { Loader2, Send, RotateCcw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSendLockPhongEmail } from "@/hooks/use-lock-phong";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { hashMailContent } from "@/lib/mail-content-hash";
import { buildLockPhongEmailHtml, fmtLockPhongDate } from "@/lib/booking-mail/lock-phong-mail";
import { applyDefaultSignature } from "@/lib/email-signature";
import { sendSequential } from "@/lib/batch-send";
import { collectLockPhongBatchItems, type LockPhongBatchItem } from "./lock-phong-batch-items";
import type { KSGroupForBatch } from "./LockPhongBatchEmailModal";
import { t, useTranslate } from "@/lib/i18n";

type RowStatus = "idle" | "sending" | "sent" | "failed";

interface RowState extends LockPhongBatchItem {
  include: boolean;
  status: RowStatus;
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  group: KSGroupForBatch;
}

// Gửi lock phòng RIÊNG TỪNG ĐOÀN — mỗi đoàn 1 mail, 1 thread. Modal review bắt
// buộc trước khi bắn: OP soát danh sách + email, bỏ tick tùy ý, bấm tên đoàn để
// xem trước đúng mail sắp gửi. Gửi TUẦN TỰ có throttle (Resend ~2 req/s); lỗi 1
// dòng không dừng batch, gửi lại được riêng dòng lỗi. Executor =
// useSendLockPhongEmail — y hệt flow lẻ (edge fn + sent_at / thread / hash /
// status), nên hai đường không cho ra kết quả lệch nhau.
export default function LockPhongBatchSeparateModal({ open, onClose, group }: Props) {
  useTranslate();
  const sendEmailMut = useSendLockPhongEmail();
  const { data: currentUserName = "" } = useCurrentUserName();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();

  const ctx = useMemo(() => ({
    khachSanEmail: group.khach_san_email,
    senderName: userProfile?.ho_ten || currentUserName,
    senderPhone: userProfile?.so_dien_thoai ?? null,
  }), [group.khach_san_email, userProfile, currentUserName]);

  const [rows, setRows] = useState<RowState[]>([]);
  const [updateNote, setUpdateNote] = useState("");
  const [sending, setSending] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUpdateNote("");
    setPreviewKey(null);
  }, [open]);

  // Rebuild khi profile (tên / SĐT người gửi) về muộn — mở nhanh lúc query chưa
  // resolve thì chữ ký trong mail rỗng, preview cũng rỗng nên review không bắt
  // được. Giữ nguyên tick / email đã sửa tay + trạng thái gửi theo key; KHÔNG
  // rebuild giữa lúc đang gửi (invalidate làm danh sách đổi dưới chân).
  useEffect(() => {
    if (!open || sending) return;
    const items = collectLockPhongBatchItems(group.entries, ctx);
    setRows((prev) => items.map((it) => {
      const old = prev.find((p) => p.key === it.key);
      return {
        ...it,
        email: old ? old.email : it.email,
        include: old ? old.include : it.defaultInclude,
        status: old?.status ?? ("idle" as RowStatus),
        error: old?.error,
      };
    }));
  }, [open, sending, group.entries, ctx]);

  const selected = rows.filter((r) => r.include && !r.skipReason);
  const hasUpdateSelected = selected.some((r) => r.mode === "update");
  const failedCount = rows.filter((r) => r.status === "failed").length;
  const pending = selected.filter((r) => r.status !== "sent");

  const buildHtmlFor = (r: RowState) =>
    applyDefaultSignature(
      buildLockPhongEmailHtml(r.input, r.mode, r.mode === "update" ? updateNote.trim() : ""),
    );

  const sendRows = async (targets: RowState[]) => {
    if (targets.length === 0) return;
    setSending(true);
    try {
      const result = await sendSequential(
        targets,
        async (r) => {
          await sendEmailMut.mutateAsync({
            lockPhongKsId: r.ksId,
            to: r.email,
            subject: r.mode === "update" ? `Re: ${r.subject}` : r.subject,
            html: buildHtmlFor(r),
            sentBy: userProfile?.ho_ten || currentUserName,
            replyTo: userProfile?.email || currentUserEmail || undefined,
            emailThreadId: r.emailThreadId,
            mode: r.mode,
            mailContentHash: hashMailContent({
              khach_san_id: group.khach_san_id,
              check_in: r.checkIn,
              check_out: r.checkOut,
              so_phong: r.input.soPhong ?? "",
              ghi_chu: r.input.ghiChu ?? "",
            }),
          });
        },
        {
          delayMs: 600,
          onStart: (i) => setRows((prev) => prev.map((p) =>
            p.key === targets[i].key ? { ...p, status: "sending", error: undefined } : p)),
          onResult: (i, ok, error) => setRows((prev) => prev.map((p) =>
            p.key === targets[i].key ? { ...p, status: ok ? "sent" : "failed", error } : p)),
        },
      );
      if (result.fail === 0) {
        toast.success(`${t("Đã gửi")} ${result.ok} ${t("email lock phòng")}`);
      } else {
        toast.warning(`${t("Đã gửi")} ${result.ok} — ${t("lỗi")} ${result.fail}. ${t("Bấm \"Gửi lại dòng lỗi\" để thử lại.")}`);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t("Gửi riêng từng đoàn")} — {group.khach_san_ten}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {t("Mỗi đoàn một email riêng, tiêu đề riêng — khách sạn trả lời vào đúng đoàn đó. Bỏ tick dòng chưa muốn gửi; bấm tên đoàn để xem trước.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("Khách sạn này chưa có đoàn nào để gửi.")}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#E6F1FB] sticky top-0">
                <tr>
                  <th className="py-1.5 px-2 w-8"></th>
                  <th className="py-1.5 px-2 text-left">{t("Đoàn / Ngày ở")}</th>
                  <th className="py-1.5 px-2 text-left w-[220px]">Email</th>
                  <th className="py-1.5 px-2 text-left w-[90px]">{t("Loại")}</th>
                  <th className="py-1.5 px-2 text-left w-[120px]">{t("Kết quả")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.key}>
                    <tr className={cn("border-b border-border/40", r.skipReason && "opacity-60")}>
                      <td className="py-1.5 px-2">
                        <Checkbox
                          checked={r.include}
                          disabled={!!r.skipReason || sending}
                          onCheckedChange={(v) => setRows((prev) => prev.map((p) =>
                            p.key === r.key ? { ...p, include: !!v } : p))}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={() => setPreviewKey(previewKey === r.key ? null : r.key)}
                        >
                          <span className="font-medium">{r.tenDoan}</span>
                          <span className="text-muted-foreground">
                            {" · "}{fmtLockPhongDate(r.checkIn)} → {fmtLockPhongDate(r.checkOut)}
                            {" · "}{r.soDem} {t("đêm")}
                            {r.input.soPhong ? ` · ${r.input.soPhong}` : ""}
                          </span>
                        </button>
                        {r.skipReason && (
                          <p className="text-[11px] text-red-600 mt-0.5">{t(r.skipReason)}</p>
                        )}
                        {!r.skipReason && r.warning && (
                          <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {t(r.warning)}
                          </p>
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        <Input
                          value={r.email}
                          disabled={!!r.skipReason || sending}
                          placeholder="email@..."
                          onChange={(e) => setRows((prev) => prev.map((p) =>
                            p.key === r.key ? { ...p, email: e.target.value } : p))}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap",
                          r.mode === "update" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700",
                        )}>
                          {r.mode === "update" ? t("Gửi cập nhật") : t("Gửi mới")}
                        </span>
                      </td>
                      <td className="py-1.5 px-2">
                        {r.status === "sending" && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Loader2 className="h-3 w-3 animate-spin" /> {t("Đang gửi")}
                          </span>
                        )}
                        {r.status === "sent" && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> {t("Đã gửi")}
                          </span>
                        )}
                        {r.status === "failed" && (
                          <span className="flex items-center gap-1 text-red-600" title={r.error}>
                            <XCircle className="h-3 w-3" /> {t("Lỗi")}
                          </span>
                        )}
                      </td>
                    </tr>
                    {previewKey === r.key && (
                      <tr>
                        <td colSpan={5} className="px-2 pb-2">
                          <div className="border border-border rounded bg-muted/20 p-2 space-y-1">
                            <p className="text-[11px] text-muted-foreground">
                              Subject:{" "}
                              <span className="font-medium text-foreground">
                                {r.mode === "update" ? `Re: ${r.subject}` : r.subject}
                              </span>
                            </p>
                            <iframe
                              title={`preview-${r.key}`}
                              srcDoc={buildHtmlFor(r)}
                              className="w-full h-[300px] bg-white rounded border border-border"
                              sandbox=""
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}

          {hasUpdateSelected && (
            <div className="space-y-1">
              <p className="text-xs font-medium">
                {t("Ghi chú cập nhật (áp vào mọi mail \"Gửi cập nhật\" của lần này)")}
              </p>
              <Textarea
                value={updateNote}
                onChange={(e) => setUpdateNote(e.target.value)}
                placeholder={t("VD: Đổi số phòng, đổi ngày ở…")}
                className="text-xs min-h-[48px] resize-none"
                disabled={sending}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {failedCount > 0 && !sending && (
            <Button
              variant="outline" size="sm" className="text-xs"
              onClick={() => sendRows(rows.filter((r) => r.status === "failed"))}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> {t("Gửi lại dòng lỗi")} ({failedCount})
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-xs" disabled={sending} onClick={onClose}>
            {t("Đóng")}
          </Button>
          <Button
            size="sm"
            className="text-xs"
            disabled={sending || pending.length === 0}
            onClick={() => sendRows(pending)}
          >
            {sending
              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {t("Đang gửi...")}</>
              : <><Send className="h-3 w-3 mr-1" /> {t("Gửi")} {pending.length} email</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
