import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { Loader2, Send, RotateCcw, CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { externalSupabase } from "@/lib/supabase-external";
import { useQueryClient } from "@tanstack/react-query";
import { callSendBookingEmail } from "@/hooks/use-booking-dv";
import { BOOKING_CC } from "@/lib/booking-cc";
import { useCurrentUserName, useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { sendSequential } from "@/lib/batch-send";
import { useHuyMailData } from "@/hooks/use-huy-mail-data";
import { collectHuyItems, buildHuyDraft, type HuyItem, type HuyKind } from "@/lib/booking-mail/huy-collect";
import { t, useTranslate } from "@/lib/i18n";

type RowStatus = "idle" | "sending" | "sent" | "failed";

interface RowState extends HuyItem {
  include: boolean;
  status: RowStatus;
  error?: string;
  /** Mail đã bay — retry KHÔNG gửi lại (chỉ chạy lại bước flip). Chống double-notify. */
  mailSent: boolean;
}

interface Props {
  open: boolean;
  doanId: number;
  tenDoan: string;
  soKhach?: number | null;
  ngayDi?: string | null;
  onClose: () => void;
  /** Chạy sau khi gửi xong (Index refetch blockers → mở khoá nút Hủy đoàn). */
  onAllSent: () => void;
}

const CC: Record<HuyKind, readonly string[]> = {
  ks: BOOKING_CC.ks, nh: BOOKING_CC.nh, tau: BOOKING_CC.nh,
  dv: BOOKING_CC.dv, xe: BOOKING_CC.xe, visa: BOOKING_CC.visa,
};

const KIND_LABEL: Record<HuyKind, string> = {
  ks: "Khách sạn", nh: "Nhà hàng", tau: "Du thuyền", dv: "Dịch vụ", xe: "Nhà xe", visa: "Visa",
};
const KIND_CLS: Record<HuyKind, string> = {
  ks: "bg-sky-100 text-sky-700", nh: "bg-emerald-100 text-emerald-700", tau: "bg-cyan-100 text-cyan-700",
  dv: "bg-violet-100 text-violet-700", xe: "bg-amber-100 text-amber-700", visa: "bg-rose-100 text-rose-700",
};

// Soạn + gửi tuần tự mail hủy cho MỌI NCC còn dính booking của đoàn (Đợt C). Bảng
// review bắt buộc: OP soát danh sách + email + preview, bỏ tick tùy ý → gửi tuần
// tự (throttle 600ms). Không auto-bắn. Mỗi dòng: gửi mail TRƯỚC (cờ mailSent chống
// gửi 2 lần khi retry) → flip trạng thái SAU để booking thoát blocker.
export default function HuyDoanBatchModal({
  open, doanId, tenDoan, soKhach, ngayDi, onClose, onAllSent,
}: Props) {
  useTranslate();
  const qc = useQueryClient();
  const { data: currentUserName = "" } = useCurrentUserName();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();

  const data = useHuyMailData(doanId, open);
  const sender = useMemo(
    () => ({ name: userProfile?.ho_ten || currentUserName, phone: userProfile?.so_dien_thoai ?? null }),
    [userProfile, currentUserName],
  );

  const items = useMemo(
    () => collectHuyItems(
      { ks: data.ks, nhDays: data.nhDays, dv: data.dv, tau: data.tau, xe: data.xe, visa: data.visa },
      { tenDoan, soKhach, ngayDi, lyDo: null },
    ),
    [data.ks, data.nhDays, data.dv, data.tau, data.xe, data.visa, tenDoan, soKhach, ngayDi],
  );

  const [rows, setRows] = useState<RowState[]>([]);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Khóa ĐỒNG BỘ chống double-click: `disabled={sending}` chỉ áp sau re-render nên
  // hai cú bấm nhanh có thể vào sendRows 2 lần với cùng snapshot mailSent=false →
  // NCC nhận mail hủy 2 lần. Ref kiểm ngay, không đợi state.
  const sendingRef = useRef(false);

  useEffect(() => { if (open) setPreviewKey(null); }, [open]);

  // Rebuild khi data async về muộn; giữ tick/email/status/mailSent theo key. Không
  // rebuild giữa lúc đang gửi (flip → invalidate → data đổi).
  useEffect(() => {
    if (!open || sending) return;
    setRows((prev) => items.map((it) => {
      const old = prev.find((p) => p.key === it.key);
      return {
        ...it,
        email: old ? old.email : it.email,
        include: old ? old.include : !it.skipReason,
        status: old?.status ?? "idle",
        error: old?.error,
        mailSent: old?.mailSent ?? false,
      };
    }));
  }, [open, sending, items]);

  const selectable = rows.filter((r) => r.include && !r.skipReason);
  const pending = selectable.filter((r) => r.status !== "sent");
  // Retry CHỈ dòng lỗi CÒN tick + có email (opt-in) — không gửi dòng OP đã bỏ tick.
  const retryTargets = rows.filter((r) => r.status === "failed" && r.include && !r.skipReason);

  const handleRetry = () => {
    // Client không phân biệt được "timeout sau khi mail đã bay" với "chưa gửi" →
    // cảnh báo OP trước khi gửi lại (tránh double-notify NCC âm thầm).
    if (!window.confirm(t("Gửi lại có thể gửi TRÙNG mail nếu lần trước lỗi do mạng (mail có thể đã bay). Chỉ gửi lại nếu chắc NCC chưa nhận. Tiếp tục?"))) return;
    sendRows(retryTargets);
  };

  const flipHuyStatus = async (item: HuyItem) => {
    const ids = item.bookingIds;
    const thr = (error: { message: string } | null) => { if (error) throw error; };
    switch (item.kind) {
      case "ks":
        return thr((await externalSupabase.from("doan_booking_ks").update({ ks_final_status: "cho_ks_xac_nhan_huy" }).in("id", ids)).error);
      case "nh":
        return thr((await externalSupabase.from("doan_booking_nh").update({ booking_status: "cho_xac_nhan_huy" }).in("id", ids)).error);
      case "tau":
        return thr((await externalSupabase.from("doan_booking_nh").update({ final_status: "cho_xac_nhan_huy" }).in("id", ids)).error);
      case "dv":
        return thr((await externalSupabase.from("doan_booking_dv").update({ booking_status: "cho_xac_nhan_huy" }).in("id", ids)).error);
      case "xe":
        return thr((await externalSupabase.from("doan_booking_xe").update({ booking_status: "da_huy" }).in("id", ids)).error);
      case "visa":
        return thr((await externalSupabase.from("doan_booking_visa").update({ booking_status: "da_huy" }).in("id", ids)).error);
    }
  };

  const sendRows = async (targets: RowState[]) => {
    if (targets.length === 0 || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const result = await sendSequential(
        targets,
        async (r) => {
          const draft = buildHuyDraft(r, sender);
          // Bước 1 — gửi mail (bỏ qua nếu lần trước đã gửi: chống double-notify NCC).
          if (!r.mailSent) {
            await callSendBookingEmail({
              to: r.email, cc: CC[r.kind], subject: draft.subject, html: draft.html,
              replyTo: userProfile?.email || currentUserEmail || undefined,
            });
            setRows((prev) => prev.map((p) => (p.key === r.key ? { ...p, mailSent: true } : p)));
          }
          // Bước 2 — flip trạng thái (idempotent). Lỗi ở đây → dòng "failed" nhưng
          // mail đã bay; retry chỉ chạy lại flip (nhờ mailSent).
          await flipHuyStatus(r);
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
        toast.success(`${t("Đã gửi")} ${result.ok} ${t("mail hủy")}`);
      } else {
        toast.warning(`${t("Đã gửi")} ${result.ok} — ${t("lỗi")} ${result.fail}. ${t("Bấm \"Gửi lại dòng lỗi\" để thử lại.")}`);
      }
      // Booking đã flip → refetch mọi nguồn + báo Index cập nhật blockers.
      ["doan_booking_ks", "doan_booking_nh", "doan_booking_dv", "doan_booking_tau", "huy_xe_data", "huy_visa_data"]
        .forEach((k) => qc.invalidateQueries({ queryKey: [k, doanId] }));
      onAllSent();
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">📧 {t("Soạn mail hủy tất cả NCC")} — {tenDoan}</DialogTitle>
          <DialogDescription className="text-xs">
            {t("Mỗi NCC còn dính booking = 1 dòng. Soát danh sách + email + nội dung, bỏ tick dòng chưa muốn gửi, rồi gửi tuần tự. Không tự gửi khi bạn chưa bấm.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {data.isLoading && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Đang tải booking…")}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("Không có booking nào cần gửi mail hủy.")}
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#E6F1FB] sticky top-0">
                <tr>
                  <th className="py-1.5 px-2 w-8"></th>
                  <th className="py-1.5 px-2 text-left">{t("Kênh / NCC")}</th>
                  <th className="py-1.5 px-2 text-left w-[220px]">Email</th>
                  <th className="py-1.5 px-2 text-left w-[110px]">{t("Kết quả")}</th>
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
                        <button className="text-left hover:underline flex items-center gap-1.5"
                          onClick={() => setPreviewKey(previewKey === r.key ? null : r.key)}>
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap", KIND_CLS[r.kind])}>
                            {t(KIND_LABEL[r.kind])}
                          </span>
                          <span className="font-medium break-words min-w-0">{r.nccTen}</span>
                        </button>
                        {r.skipReason && <p className="text-[11px] text-red-600 mt-0.5">✗ {t(r.skipReason)}</p>}
                        {!r.isBlocker && !r.skipReason && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{t("(thông báo — không chặn hủy đoàn)")}</p>
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
                        <td colSpan={4} className="px-2 pb-2">
                          <div className="border border-border rounded bg-muted/20 p-2 space-y-1">
                            <p className="text-[11px] text-muted-foreground">Subject: <span className="font-medium text-foreground">{buildHuyDraft(r, sender).subject}</span></p>
                            <iframe
                              title={`preview-${r.key}`}
                              srcDoc={buildHuyDraft(r, sender).html}
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
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {retryTargets.length > 0 && !sending && (
            <Button variant="outline" size="sm" className="text-xs" onClick={handleRetry}>
              <RotateCcw className="h-3 w-3 mr-1" /> {t("Gửi lại dòng lỗi")} ({retryTargets.length})
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-xs" disabled={sending} onClick={onClose}>
            {t("Đóng")}
          </Button>
          <Button
            size="sm" className="text-xs"
            disabled={sending || pending.length === 0}
            onClick={() => sendRows(pending)}
          >
            {sending
              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {t("Đang gửi...")}</>
              : <><Send className="h-3 w-3 mr-1" /> {t("Gửi")} {pending.length} {t("mail hủy")}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
