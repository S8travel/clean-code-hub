import { useState, useEffect, useMemo, Fragment } from "react";
import { format } from "date-fns";
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
import { useSendNHBookingEmail, useUpsertBookingNH, type MenuDayData } from "@/hooks/use-booking-nh";
import { useCurrentUserProfile, useDoanChuThich } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { useHdvsByDoanId, formatHdvsForEmail } from "@/hooks/use-hdv";
import { hashMailContent } from "@/lib/mail-content-hash";
import { buildNhMailFields, buildNhEmailHtml } from "@/lib/booking-mail/nh-mail";
import { applyDefaultSignature } from "@/lib/email-signature";
import { sendSequential } from "@/lib/batch-send";
import { collectNhBatchItems, type NhBatchItem } from "./nh-batch-items";
import { t, useTranslate } from "@/lib/i18n";

type RowStatus = "idle" | "sending" | "sent" | "failed";

interface RowState extends NhBatchItem {
  include: boolean;
  status: RowStatus;
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  doanId: number;
  days: MenuDayData[];
  tenDoan?: string;
  soKhach?: number;
  soKhachLon?: number;
  soKhachEm1?: number;
  soKhachEm2?: number;
  soNoidBo?: number;
  currentUserName: string;
}

// Gửi booking NH hàng loạt — modal REVIEW bắt buộc trước khi bắn (mail dựng từ
// booking ĐÃ LƯU DB; OP soát danh sách + email, bỏ tick tùy ý). Gửi TUẦN TỰ có
// throttle (Resend ~2 req/s); lỗi 1 dòng không dừng batch, gửi lại được từng dòng.
// Executor = useSendNHBookingEmail (y hệt flow lẻ: edge fn + sent_at/hash/status).
export default function BatchSendNHModal({
  open, onClose, doanId, days, tenDoan,
  soKhach, soKhachLon, soKhachEm1, soKhachEm2, soNoidBo, currentUserName,
}: Props) {
  useTranslate();
  const sendEmailMut = useSendNHBookingEmail();
  const upsertMut = useUpsertBookingNH();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();
  const { data: doanHdvs = [] } = useHdvsByDoanId(doanId);
  const { data: chuThichKhach } = useDoanChuThich(doanId);

  const ctx = useMemo(() => ({
    tenDoan, soKhach, soKhachLon, soKhachEm1, soKhachEm2, soNoidBo,
    chuThichKhach,
    hdvText: formatHdvsForEmail(doanHdvs),
    senderName: userProfile?.ho_ten || currentUserName,
    senderPhone: userProfile?.so_dien_thoai ?? null,
  }), [tenDoan, soKhach, soKhachLon, soKhachEm1, soKhachEm2, soNoidBo,
       chuThichKhach, doanHdvs, userProfile, currentUserName]);

  const [rows, setRows] = useState<RowState[]>([]);
  const [updateNote, setUpdateNote] = useState("");
  const [sending, setSending] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  // Reset phần nhập tay khi MỞ modal
  useEffect(() => {
    if (!open) return;
    setUpdateNote("");
    setPreviewKey(null);
  }, [open]);

  // Dựng danh sách + REBUILD khi query async về muộn (HDV/chú thích khách/profile).
  // Nếu chỉ build 1 lần lúc mở: mở nhanh khi query chưa resolve → mail gửi đi
  // THIẾU dòng "⚠ Lưu ý khách" (dị ứng/ăn chay) + HDV "Bổ sung sau", preview cũng
  // thiếu y hệt nên review không bắt được (flow lẻ MealCard có đúng safeguard này).
  // Giữ nguyên chỉnh sửa của user (email/tick) + trạng thái gửi theo key; không
  // rebuild giữa lúc đang gửi (invalidate làm days đổi).
  useEffect(() => {
    if (!open || sending) return;
    const items = collectNhBatchItems(days, ctx);
    setRows((prev) => items.map((it) => {
      const old = prev.find((p) => p.key === it.key);
      return {
        ...it,
        email: old ? old.email : it.email,
        include: old ? old.include : (!it.skipReason && !it.warning), // cảnh báo → mặc định KHÔNG tick
        status: old?.status ?? ("idle" as RowStatus),
        error: old?.error,
      };
    }));
  }, [open, sending, days, ctx]);

  const selected = rows.filter((r) => r.include && !r.skipReason);
  const hasUpdateSelected = selected.some((r) => r.mode === "update");
  const failedCount = rows.filter((r) => r.status === "failed").length;

  const buildHtmlFor = (r: RowState) =>
    applyDefaultSignature(
      buildNhEmailHtml(r.input, r.mode, r.mode === "update" ? updateNote.trim() : ""),
    );

  const sendRows = async (targets: RowState[]) => {
    if (targets.length === 0) return;
    setSending(true);
    try {
      const result = await sendSequential(
        targets,
        async (r) => {
          // Slot đủ điều kiện luôn có bookingId (skipReason chặn từ collect) —
          // giữ guard cho chắc.
          let bookingId = r.bookingId;
          let threadId = r.emailThreadId;
          if (!bookingId) {
            const created = await upsertMut.mutateAsync({
              doan_id: doanId, doan_ngay_id: Number(r.key.split("_")[0]),
              bua_an: r.buaAn, nha_hang_id: r.input.nhaHangId,
              mon_an_snapshot: r.input.monList, ghi_chu: r.input.ghiChu ?? "",
              booking_status: "chua_gui",
            });
            bookingId = created?.id ?? null;
            threadId = created?.email_thread_id ?? null;
          }
          if (!bookingId) throw new Error("Chưa có booking ID");
          const fields = buildNhMailFields(r.input);
          await sendEmailMut.mutateAsync({
            bookingId,
            doanId,
            to: r.email,
            subject: r.subject,
            html: buildHtmlFor(r),
            sentBy: currentUserName,
            replyTo: userProfile?.email || currentUserEmail || undefined,
            emailThreadId: threadId,
            mode: r.mode,
            mailContentHash: hashMailContent(fields),
            mailSentSnapshot: fields,
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
        toast.success(`${t("Đã gửi")} ${result.ok} ${t("email booking")}`);
      } else {
        toast.warning(`${t("Đã gửi")} ${result.ok} — ${t("lỗi")} ${result.fail}. ${t("Bấm \"Gửi lại dòng lỗi\" để thử lại.")}`);
      }
    } finally {
      setSending(false);
    }
  };

  const fmtNgay = (d: string | null) => {
    if (!d) return "—";
    try { return format(new Date(d + "T00:00:00"), "dd/MM"); } catch { return d; }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">📧 {t("Gửi email booking hàng loạt — Nhà hàng")}</DialogTitle>
          <DialogDescription className="text-xs">
            {t("Nội dung dựng từ booking đã lưu. Soát danh sách + email, bỏ tick dòng chưa muốn gửi. Mail cập nhật gửi \"Re:\" vào thread cũ.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("Không có booking nào cần gửi — tất cả đã gửi và không có thay đổi.")}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#E6F1FB] sticky top-0">
                <tr>
                  <th className="py-1.5 px-2 w-8"></th>
                  <th className="py-1.5 px-2 text-left">{t("Bữa / Nhà hàng")}</th>
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
                      <button className="text-left hover:underline" onClick={() => setPreviewKey(previewKey === r.key ? null : r.key)}>
                        <span className="font-medium">
                          {t("Ngày")} {r.ngaySo} ({fmtNgay(r.ngayDate)}) · {r.buaAn === "trua" ? t("Trưa") : t("Tối")} · {r.nhaHangTen}
                        </span>
                      </button>
                      {r.skipReason && (
                        <p className="text-[11px] text-red-600 mt-0.5">✗ {t(r.skipReason)}</p>
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
                      {r.status === "sending" && <span className="flex items-center gap-1 text-blue-600"><Loader2 className="h-3 w-3 animate-spin" /> {t("Đang gửi")}</span>}
                      {r.status === "sent" && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> {t("Đã gửi")}</span>}
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
                          <p className="text-[11px] text-muted-foreground">Subject: <span className="font-medium text-foreground">{r.subject}</span></p>
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
              <p className="text-xs font-medium">{t("Ghi chú cập nhật (áp vào mọi mail \"Gửi cập nhật\" của lần này)")}</p>
              <Textarea
                value={updateNote}
                onChange={(e) => setUpdateNote(e.target.value)}
                placeholder={t("VD: Đổi lịch do thời tiết…")}
                className="text-xs min-h-[48px] resize-none"
                disabled={sending}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {failedCount > 0 && !sending && (
            <Button variant="outline" size="sm" className="text-xs"
              onClick={() => sendRows(rows.filter((r) => r.status === "failed"))}>
              <RotateCcw className="h-3 w-3 mr-1" /> {t("Gửi lại dòng lỗi")} ({failedCount})
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-xs" disabled={sending} onClick={onClose}>
            {t("Đóng")}
          </Button>
          <Button
            size="sm"
            className="text-xs"
            disabled={sending || selected.filter((r) => r.status !== "sent").length === 0}
            onClick={() => sendRows(selected.filter((r) => r.status !== "sent"))}
          >
            {sending
              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {t("Đang gửi...")}</>
              : <><Send className="h-3 w-3 mr-1" /> {t("Gửi")} {selected.filter((r) => r.status !== "sent").length} email</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
