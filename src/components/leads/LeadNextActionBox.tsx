import { useState, useEffect } from "react";
import { format, isBefore, isToday, startOfDay, formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { Target, Phone, MessageCircle, Mail, Check, Clock, SkipForward, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  useNextAction, useEnsureNextAction, useCompleteAction,
  useSnoozeAction, useSkipAction, useSetManualAction,
} from "@/hooks/use-lead-next-action";
import {
  CHANNEL_LABEL, CHANNEL_ICON, PRIORITY_LABEL, OUTCOME_OPTS, TERMINAL_STAGES,
  type LnaOutcome,
} from "@/lib/lead-next-action";
import { templateChannelOf } from "@/lib/lead-template";
import { LeadTemplateModal } from "@/components/leads/LeadTemplateModal";

interface Props {
  lead: {
    id: number; ho_ten: string;
    so_dien_thoai: string | null; email: string | null;
    trang_thai: string; do_not_contact?: boolean | null;
  };
  currentUserId?: string | null;
}

const CHANNELS = ["call", "zalo", "email", "meeting", "note"];

export function LeadNextActionBox({ lead, currentUserId }: Props) {
  const { data: action, isLoading } = useNextAction(lead.id);
  const ensure = useEnsureNextAction();
  const complete = useCompleteAction();
  const snooze = useSnoozeAction();
  const skip = useSkipAction();
  const setManual = useSetManualAction();

  const eligible = !lead.do_not_contact && !TERMINAL_STAGES.includes(lead.trang_thai);

  // Lazy backfill: lead đủ điều kiện nhưng chưa có action → tạo 1 lần
  useEffect(() => {
    if (!isLoading && !action && eligible && !ensure.isPending) {
      ensure.mutate(lead.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, action, eligible, lead.id]);

  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [outcome, setOutcome] = useState<LnaOutcome>("rep_interested");
  const [note, setNote] = useState("");
  const [durationMin, setDurationMin] = useState("");

  if (!eligible) {
    return (
      <div className="mx-5 mt-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        {lead.do_not_contact
          ? "🔇 Lead đánh dấu Không liên hệ — không có việc cần làm."
          : "Lead đã ở trạng thái kết thúc — không có việc cần làm tiếp."}
      </div>
    );
  }

  if (isLoading || (!action && ensure.isPending)) {
    return <div className="mx-5 mt-4 h-24 rounded-lg border border-border bg-muted/20 animate-pulse" />;
  }

  if (!action) {
    return (
      <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-800">
        ⚠️ Đã hết nhịp touch cho giai đoạn này. Cân nhắc chuyển trạng thái hoặc tạm dừng lead.
      </div>
    );
  }

  const due = new Date(action.due_at);
  const overdue = isBefore(due, startOfDay(new Date())) || (isBefore(due, new Date()) && isToday(due));
  const dueToday = isToday(due);
  const pri = action.priority;

  const priCls =
    pri === "gap" ? "bg-destructive/10 text-destructive border-destructive/30"
    : pri === "khong_gap" ? "bg-muted text-muted-foreground border-border"
    : "bg-warning/10 text-foreground border-warning/40";

  const channelLink =
    action.channel === "call" && lead.so_dien_thoai ? `tel:${lead.so_dien_thoai}`
    : action.channel === "zalo" && lead.so_dien_thoai ? `https://zalo.me/${lead.so_dien_thoai}`
    : action.channel === "email" && lead.email ? `mailto:${lead.email}`
    : null;

  const doComplete = () => {
    complete.mutate({
      actionId: action.id, leadId: lead.id, channel: action.channel,
      outcome, note: note.trim() || null,
      durationSeconds: durationMin ? Math.round(parseFloat(durationMin) * 60) : null,
      createdBy: currentUserId ?? null,
    }, {
      onSuccess: () => {
        setOutcomeOpen(false); setNote(""); setDurationMin("");
        if (outcome === "refused") {
          toast.warning("Khách từ chối — cân nhắc chuyển trạng thái sang \"Mất khách\".", { duration: 6000 });
        } else {
          toast.success("Đã ghi nhận. Việc tiếp theo đã được cập nhật.");
        }
        setOutcome("rep_interested");
      },
      onError: (e: unknown) => toast.error(errMsg(e) || "Lỗi khi lưu"),
    });
  };

  return (
    <>
      <div className={cn(
        "mx-5 mt-4 rounded-xl border p-4",
        overdue ? "border-destructive/30 bg-destructive/5"
        : dueToday ? "border-warning/40 bg-warning/10"
        : "border-border bg-card",
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Việc tiếp theo
            </span>
          </div>
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0", priCls)}>
            {PRIORITY_LABEL[pri] ?? pri}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-lg leading-none">{CHANNEL_ICON[action.channel] ?? "📌"}</span>
          <p className="text-sm font-semibold">{CHANNEL_LABEL[action.channel] ?? action.channel}</p>
        </div>

        {action.reason && (
          <p className="text-xs text-muted-foreground mt-1">{action.reason}</p>
        )}

        <p className={cn("text-xs mt-1.5 font-medium",
          overdue ? "text-destructive" : dueToday ? "text-foreground" : "text-muted-foreground")}>
          Hạn: {format(due, "HH:mm · dd/MM/yyyy", { locale: vi })}
          {" "}({formatDistanceToNow(due, { addSuffix: true, locale: vi })})
          {action.source === "manual" && <span className="ml-1 text-muted-foreground">· tự đặt</span>}
        </p>

        {action.suggested_script && (
          <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-foreground/80 italic">
            💡 {action.suggested_script}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {channelLink && (
            <a href={channelLink} target={action.channel === "call" ? undefined : "_blank"} rel="noopener noreferrer"
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity">
              {action.channel === "call" ? <Phone className="h-3.5 w-3.5" />
                : action.channel === "zalo" ? <MessageCircle className="h-3.5 w-3.5" />
                : <Mail className="h-3.5 w-3.5" />}
              Mở {CHANNEL_LABEL[action.channel]}
            </a>
          )}
          {templateChannelOf(action.channel) && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
              onClick={() => setTplOpen(true)}>
              <FileText className="h-3.5 w-3.5" /> Soạn từ mẫu
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => setOutcomeOpen(true)}>
            <Check className="h-3.5 w-3.5" /> Đã làm
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
            disabled={snooze.isPending}
            onClick={() => snooze.mutate({ actionId: action.id, leadId: lead.id, days: 1, dueAt: action.due_at })}>
            <Clock className="h-3.5 w-3.5" /> +1n
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs"
            disabled={snooze.isPending}
            onClick={() => snooze.mutate({ actionId: action.id, leadId: lead.id, days: 3, dueAt: action.due_at })}>
            +3n
          </Button>
          <Select
            value={action.channel}
            onValueChange={(v) => setManual.mutate({
              leadId: lead.id, existingId: action.id, channel: v,
              due_at: action.due_at, priority: action.priority,
              reason: action.reason ?? "Sale đổi kênh",
            })}>
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue placeholder="Đổi kênh" />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">
                  {CHANNEL_ICON[c]} {CHANNEL_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
            disabled={skip.isPending}
            onClick={() => skip.mutate({ actionId: action.id, leadId: lead.id })}>
            <SkipForward className="h-3.5 w-3.5" /> Bỏ qua
          </Button>
        </div>
      </div>

      {/* Modal outcome */}
      <Dialog open={outcomeOpen} onOpenChange={setOutcomeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Kết quả: {CHANNEL_LABEL[action.channel]} — {lead.ho_ten}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Kết quả</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as LnaOutcome)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOME_OPTS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {action.channel === "call" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Thời lượng gọi (phút)</Label>
                <Input type="number" min={0} step={0.5} value={durationMin}
                  onChange={(e) => setDurationMin(e.target.value)}
                  className="h-9 text-sm tabular-nums" placeholder="VD: 4" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Ghi chú (tuỳ chọn)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)}
                rows={3} className="text-sm resize-none"
                placeholder="VD: Khách quan tâm option 2, hẹn gọi lại thứ 2..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOutcomeOpen(false)}>Huỷ</Button>
            <Button size="sm" onClick={doComplete} disabled={complete.isPending}>
              {complete.isPending ? "Đang lưu..." : "Lưu kết quả"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeadTemplateModal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        leadId={lead.id}
        actionId={action.id}
        actionChannel={action.channel}
      />
    </>
  );
}
