import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Send, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useLead } from "@/hooks/use-leads";
import {
  useTemplates, useSendLeadEmail, useBumpTemplateUse, type LeadTemplate,
} from "@/hooks/use-lead-template";
import { useCompleteAction } from "@/hooks/use-lead-next-action";
import { fillTemplate, templateChannelOf } from "@/lib/lead-template";
import { OUTCOME_OPTS, CHANNEL_LABEL, type LnaOutcome } from "@/lib/lead-next-action";

interface Props {
  open: boolean;
  onClose: () => void;
  leadId: number;
  actionId: number;
  actionChannel: string; // call | zalo | email
}

export function LeadTemplateModal({ open, onClose, leadId, actionId, actionChannel }: Props) {
  const { user } = useAuth();
  const { data: lead } = useLead(open ? leadId : null);
  const tplChannel = templateChannelOf(actionChannel);
  const { data: templates = [] } = useTemplates(open ? tplChannel : null, lead?.trang_thai);
  const sendEmail = useSendLeadEmail();
  const bumpUse = useBumpTemplateUse();
  const complete = useCompleteAction();

  const [picked, setPicked] = useState<LeadTemplate | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState<LnaOutcome>("no_response");

  const ctx = useMemo(() => {
    const diemDen = (lead?.diem_den ?? []).map((d) => d.diem_den).join(", ");
    const soKhach = (lead?.so_nguoi_lon ?? 0) + (lead?.so_nguoi_em ?? 0);
    return {
      ten_khach: lead?.ho_ten,
      sales_name: user?.ho_ten,
      diem_den: diemDen,
      so_khach: soKhach || null,
      ngay_di: lead?.ngay_di_du_kien || lead?.thang_du_kien || "",
      ngan_sach: lead?.ngan_sach_per_khach ?? null,
      quote_link: "",
    };
  }, [lead, user]);

  // reset khi mở / đổi lead
  useEffect(() => {
    if (open) { setPicked(null); setSubject(""); setBody(""); setOutcome("no_response"); }
  }, [open, leadId]);

  const choose = (t: LeadTemplate) => {
    setPicked(t);
    setSubject(fillTemplate(t.subject, ctx));
    setBody(fillTemplate(t.body, ctx));
  };

  const isEmail = tplChannel === "email";

  const doSend = () => {
    if (!lead?.email) { toast.error("Lead chưa có email"); return; }
    if (!subject.trim() || !body.trim()) { toast.error("Thiếu tiêu đề hoặc nội dung"); return; }
    sendEmail.mutate(
      { to: lead.email, subject: subject.trim(), bodyText: body, templateId: picked?.id ?? null },
      {
        onSuccess: () => {
          // Gửi email = 1 touch outbound → hoàn tất action hiện tại
          complete.mutate({
            actionId, leadId, channel: actionChannel,
            outcome, note: `Đã gửi email: ${subject.trim()}`,
            createdBy: user?.user_id ?? null,
          }, {
            onSuccess: () => {
              toast.success("Đã gửi email & cập nhật việc tiếp theo.");
              onClose();
            },
            onError: (e: any) => toast.error(e?.message ?? "Gửi xong nhưng lỗi cập nhật việc"),
          });
        },
        onError: (e: any) => toast.error(e?.message ?? "Lỗi gửi email"),
      },
    );
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      if (picked) bumpUse.mutate(picked.id);
      toast.success("Đã copy nội dung. Dán vào Zalo/khi gọi, xong bấm \"Đã làm\" để ghi kết quả.");
      if (actionChannel === "zalo" && lead?.so_dien_thoai) {
        window.open(`https://zalo.me/${lead.so_dien_thoai}`, "_blank", "noopener");
      }
      onClose();
    } catch {
      toast.error("Trình duyệt chặn copy — chọn & copy tay nội dung bên dưới");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Mẫu {CHANNEL_LABEL[actionChannel] ?? actionChannel} — {lead?.ho_ten ?? ""}
          </DialogTitle>
        </DialogHeader>

        {!picked ? (
          <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
            {templates.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                Chưa có mẫu cho kênh này.
              </p>
            ) : templates.map((t) => (
              <button key={t.id} onClick={() => choose(t)}
                className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t.ten}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {t.stage ?? "mọi giai đoạn"} · đã dùng {t.used_count}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                  {t.body}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {isEmail && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tiêu đề</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9 text-sm" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nội dung (sửa được trước khi gửi)</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)}
                rows={9} className="text-sm resize-y font-mono" />
            </div>
            {isEmail && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Kết quả ghi nhận sau khi gửi</Label>
                <Select value={outcome} onValueChange={(v) => setOutcome(v as LnaOutcome)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUTCOME_OPTS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {lead && !lead.email && (
                  <p className="text-[11px] text-destructive">Lead chưa có email — không gửi được.</p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {picked && (
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>← Chọn mẫu khác</Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose}>Đóng</Button>
          {picked && (
            isEmail ? (
              <Button size="sm" className="gap-1.5" onClick={doSend}
                disabled={sendEmail.isPending || complete.isPending || !lead?.email}>
                <Send className="h-3.5 w-3.5" />
                {sendEmail.isPending ? "Đang gửi..." : "Gửi email"}
              </Button>
            ) : (
              <Button size="sm" className="gap-1.5" onClick={doCopy}>
                <Copy className="h-3.5 w-3.5" /> Copy nội dung
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
