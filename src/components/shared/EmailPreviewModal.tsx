import { useState, useRef, useEffect, useCallback } from "react";
import { Mail, Send, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useEmailSignatures, type EmailSignature } from "@/hooks/use-email-signatures";

const SIG_HR = `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">`;

function extractBody(fullHtml: string): string {
  const match = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1] : fullHtml;
}

// Strip custom sig (everything from SIG_HR onward) to get clean body
function stripSig(html: string): string {
  const idx = html.indexOf(SIG_HR);
  return idx >= 0 ? html.slice(0, idx) : html;
}

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
  title = "Gửi email",
  to,
  onToChange,
  subject,
  onSubjectChange,
  html,
  onHtmlChange,
  textBody: _textBody = "",
  onSendViaServer,
  onMailtoFallback,
  sending,
}: Props) {
  const editRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef(html);
  htmlRef.current = html; // always latest, no stale closure

  // Callback ref fires when the editor div mounts (after Radix Portal's 2-phase mount).
  // This is more reliable than useLayoutEffect([open]) which fires before the portal
  // renders its content (Radix Portal uses an internal useLayoutEffect to set mounted=true).
  const editorCallbackRef = useCallback((node: HTMLDivElement | null) => {
    editRef.current = node;
    if (node) node.innerHTML = extractBody(htmlRef.current);
  }, []);

  const { sigs, upsert, remove } = useEmailSignatures();

  const [selectedSigId, setSelectedSigId] = useState<string | null>(null);
  const [sigEditing, setSigEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHtml, setEditHtml] = useState("");

  // Reset sig state when modal closes
  useEffect(() => {
    if (!open) { setSigEditing(false); setEditingId(null); }
  }, [open]);

  const selectedSig = sigs.find((s) => s.id === selectedSigId) ?? null;

  // Sig appears IN the editor. helpers always strip old sig first to avoid duplication.
  const setEditorContent = (finalHtml: string) => {
    if (editRef.current) editRef.current.innerHTML = finalHtml;
    onHtmlChange(finalHtml);
  };

  const handleInput = () => {
    if (editRef.current) onHtmlChange(editRef.current.innerHTML);
  };

  const handleSigChange = (val: string) => {
    const id = val === "none" ? null : val;
    setSelectedSigId(id);
    const sig = sigs.find((s) => s.id === id) ?? null;
    const body = stripSig(editRef.current?.innerHTML || "");
    setEditorContent(sig ? body + SIG_HR + sig.html : body);
  };

  const startNewSig = () => {
    setEditingId(null);
    setEditName("");
    setEditHtml("");
    setSigEditing(true);
  };

  const startEditSig = (sig: EmailSignature) => {
    setEditingId(sig.id);
    setEditName(sig.name);
    setEditHtml(sig.html);
    setSigEditing(true);
  };

  const saveSig = () => {
    const id = editingId || crypto.randomUUID();
    const newSig: EmailSignature = { id, name: editName.trim() || "Chữ ký", html: editHtml };
    upsert(newSig);
    setSelectedSigId(id);
    setSigEditing(false);
    const body = stripSig(editRef.current?.innerHTML || "");
    setEditorContent(body + SIG_HR + newSig.html);
  };

  const deleteSig = () => {
    if (editingId) {
      remove(editingId);
      if (selectedSigId === editingId) {
        setSelectedSigId(null);
        setEditorContent(stripSig(editRef.current?.innerHTML || ""));
      }
    }
    setSigEditing(false);
  };

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
          {/* To / Subject */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Đến{" "}
                <span className="text-muted-foreground/60 font-normal">(nhiều email cách nhau bằng dấu phẩy)</span>
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

          {/* Editor */}
          <p className="text-xs text-muted-foreground font-medium">Nội dung email</p>
          <div
            ref={editorCallbackRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            className="w-full min-h-[300px] max-h-[360px] overflow-y-auto border border-border rounded-md p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
          />

          {/* Signature section */}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Chữ ký:</span>
              <Select value={selectedSigId ?? "none"} onValueChange={handleSigChange}>
                <SelectTrigger className="h-7 text-xs flex-1 max-w-[220px]">
                  <SelectValue placeholder="Không có chữ ký" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không có chữ ký</SelectItem>
                  {sigs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSig && !sigEditing && (
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEditSig(selectedSig)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {!sigEditing && (
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={startNewSig} title="Thêm chữ ký mới">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Sig editor form */}
            {sigEditing && (
              <div className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Tên chữ ký (vd: Chữ ký công ty)"
                  className="h-7 text-xs"
                />
                <textarea
                  value={editHtml}
                  onChange={(e) => setEditHtml(e.target.value)}
                  className="w-full h-28 text-xs border border-border rounded p-2 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring bg-white"
                  placeholder="Nội dung HTML chữ ký..."
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveSig} disabled={!editName.trim() && !editHtml.trim()}>Lưu</Button>
                  {editingId && (
                    <Button size="sm" variant="destructive" onClick={deleteSig}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />Xóa
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSigEditing(false)}>Hủy</Button>
                </div>
              </div>
            )}

          </div>

          <p className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            <strong>Gửi qua server</strong> dùng HTML đúng như nội dung trên.{" "}
            <strong>Mở email client</strong> dùng <code className="text-[11px]">mailto:</code>, Outlook chỉ nhận text thuần và sẽ khác bố cục.
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
