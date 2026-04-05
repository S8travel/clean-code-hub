import { useState } from "react";
import { Mail, Send, Eye, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  to: string;
  onToChange: (v: string) => void;
  subject: string;
  onSubjectChange: (v: string) => void;
  html: string;
  onHtmlChange: (v: string) => void;
  onSendViaServer: () => Promise<void>;
  onMailtoFallback: () => void;
  sending: boolean;
}

export default function EmailPreviewModal({
  open,
  onOpenChange,
  title = "Gửi email",
  to,
  onToChange,
  subject,
  onSubjectChange,
  html,
  onHtmlChange,
  onSendViaServer,
  onMailtoFallback,
  sending,
}: Props) {
  const [tab, setTab] = useState<"preview" | "edit">("preview");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          {/* To + Subject */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Đến{" "}
                <span className="text-muted-foreground/60 font-normal">
                  (nhiều email cách nhau bằng dấu phẩy)
                </span>
              </p>
              <Input
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                placeholder="a@hotel.com, b@hotel.com"
                className="text-sm h-8"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tiêu đề</p>
              <Input
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                className="text-sm h-8"
              />
            </div>
          </div>

          {/* Tab toggle */}
          <div className="flex items-center gap-1 border-b border-border pb-1">
            <button
              onClick={() => setTab("preview")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                tab === "preview"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="h-3 w-3" />
              Xem trước
            </button>
            <button
              onClick={() => setTab("edit")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                tab === "edit"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code className="h-3 w-3" />
              Chỉnh sửa HTML
            </button>
          </div>

          {/* Content */}
          {tab === "preview" ? (
            <iframe
              srcDoc={html}
              sandbox="allow-same-origin"
              className="w-full h-[380px] rounded border border-border bg-white"
              title="Email preview"
            />
          ) : (
            <Textarea
              value={html}
              onChange={(e) => onHtmlChange(e.target.value)}
              rows={16}
              className="text-xs font-mono resize-none"
            />
          )}

          <p className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            <strong>Gửi qua server</strong> dùng Supabase Edge Function (cần cấu hình{" "}
            <code className="text-[11px]">RESEND_API_KEY</code>).{" "}
            <strong>Mở email client</strong> dùng ứng dụng mail mặc định, không cần cấu hình.
          </p>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
          <Button variant="outline" onClick={onMailtoFallback} type="button">
            <Mail className="h-4 w-4 mr-1.5" />
            Mở email client
          </Button>
          <Button onClick={onSendViaServer} disabled={sending || !to}>
            <Send className="h-4 w-4 mr-1.5" />
            {sending ? "Đang gửi..." : "Gửi qua server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
