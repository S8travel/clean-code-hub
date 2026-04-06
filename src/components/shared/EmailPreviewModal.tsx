import { useState, useRef, useEffect } from "react";
import { Mail, Send, Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  textBody?: string;
  onSendViaServer: () => Promise<void>;
  onMailtoFallback: () => void;
  sending: boolean;
}

export default function EmailPreviewModal({
  open,
  onOpenChange,
  title = "Gui email",
  to,
  onToChange,
  subject,
  onSubjectChange,
  html,
  onHtmlChange,
  textBody = "",
  onSendViaServer,
  onMailtoFallback,
  sending,
}: Props) {
  const [tab, setTab] = useState<"preview" | "client" | "edit">("preview");
  const editRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab === "edit" && editRef.current) {
      editRef.current.innerHTML = html;
    }
  }, [tab, html]);

  useEffect(() => {
    if (!open) setTab("preview");
  }, [open]);

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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Den{" "}
                <span className="text-muted-foreground/60 font-normal">
                  (nhieu email cach nhau bang dau phay)
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
              <p className="text-xs text-muted-foreground mb-1">Tieu de</p>
              <Input
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                className="text-sm h-8"
              />
            </div>
          </div>

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
              Xem truoc HTML
            </button>
            <button
              onClick={() => setTab("client")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                tab === "client"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mail className="h-3 w-3" />
              Mail client
            </button>
            <button
              onClick={() => setTab("edit")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                tab === "edit"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Pencil className="h-3 w-3" />
              Chinh sua HTML
            </button>
          </div>

          {tab === "preview" ? (
            <iframe
              srcDoc={html}
              sandbox="allow-same-origin"
              className="w-full h-[380px] rounded border border-border bg-white"
              title="Email preview"
            />
          ) : tab === "client" ? (
            <div className="w-full h-[380px] rounded border border-border bg-white overflow-auto p-4">
              <pre className="text-sm whitespace-pre-wrap break-words font-sans text-slate-800">
                {textBody || "Mail client se nhan noi dung text thuan qua mailto:."}
              </pre>
            </div>
          ) : (
            <div
              ref={editRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => {
                if (editRef.current) onHtmlChange(editRef.current.innerHTML);
              }}
              className="w-full min-h-[380px] overflow-y-auto border border-border rounded-md p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
            />
          )}

          <p className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            <strong>Gui qua server</strong> dung HTML dung nhu tab xem truoc.{" "}
            <strong>Mo email client</strong> dung <code className="text-[11px]">mailto:</code>,
            nen da so app mail, dac biet Outlook, chi nhan ban text thuan va se khac bo cuc HTML.
          </p>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0 gap-2">
          <Button variant="outline" onClick={onMailtoFallback} type="button">
            <Mail className="h-4 w-4 mr-1.5" />
            Mo email client
          </Button>
          <Button onClick={onSendViaServer} disabled={sending || !to}>
            <Send className="h-4 w-4 mr-1.5" />
            {sending ? "Dang gui..." : "Gui qua server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
