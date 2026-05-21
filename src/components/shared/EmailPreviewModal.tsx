import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mail, Send, Pencil, Plus, Trash2, Star,
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  Palette, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useEmailSignatures, type EmailSignature } from "@/hooks/use-email-signatures";
import { uploadInlineImage } from "@/lib/email-inline-images";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  mode?: "first" | "update";
  updateNote?: string;
  onUpdateNoteChange?: (v: string) => void;
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
  mode = "first",
  updateNote = "",
  onUpdateNoteChange,
}: Props) {
  const editRef = useRef<HTMLDivElement | null>(null);
  const htmlRef = useRef(html);
  htmlRef.current = html; // always latest, no stale closure

  const sigEditorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange();
  };

  const restoreAndExec = (cmd: string, val?: string) => {
    if (sigEditorRef.current) {
      sigEditorRef.current.focus();
      const sel = window.getSelection();
      if (sel && savedRangeRef.current) {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      }
    }
    document.execCommand(cmd, false, val);
    if (sigEditorRef.current) setEditHtml(sigEditorRef.current.innerHTML);
  };

  const handleCmd = (e: React.MouseEvent, cmd: string, val?: string) => {
    e.preventDefault();
    restoreAndExec(cmd, val);
  };

  // Callback ref fires when the editor div mounts (after Radix Portal's 2-phase mount).
  // This is more reliable than useLayoutEffect([open]) which fires before the portal
  // renders its content (Radix Portal uses an internal useLayoutEffect to set mounted=true).
  const editorCallbackRef = useCallback((node: HTMLDivElement | null) => {
    editRef.current = node;
    if (node) node.innerHTML = extractBody(htmlRef.current);
  }, []);

  // Sync html prop → editor.innerHTML khi parent set giá trị mới (vd: useEffect
  // build body sau khi async data load xong, hoặc reset). KHÔNG sync khi user
  // đang focus (đang gõ): innerHTML qua typing đã được parent capture qua
  // onInput → html prop = editor.innerHTML → check equality cũng skip.
  useEffect(() => {
    const node = editRef.current;
    if (!node) return;
    const externalBody = extractBody(html);
    if (node.innerHTML === externalBody) return;
    if (document.activeElement === node) return;
    node.innerHTML = externalBody;
  }, [html]);

  const { sigs, defaultId, upsert, remove, setDefault } = useEmailSignatures();

  const [selectedSigId, setSelectedSigId] = useState<string | null>(null);
  const [sigEditing, setSigEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHtml, setEditHtml] = useState("");

  const editHtmlRef = useRef(editHtml);
  editHtmlRef.current = editHtml; // always latest, no stale closure

  // Stable callback ref — fires only on mount/unmount, never on re-render
  // (inline arrow refs fire on every render, resetting innerHTML + cursor)
  const sigEditorCallbackRef = useCallback((node: HTMLDivElement | null) => {
    sigEditorRef.current = node;
    if (node) node.innerHTML = editHtmlRef.current;
  }, []);

  // Reset sig state when modal closes
  useEffect(() => {
    if (!open) { setSigEditing(false); setEditingId(null); }
  }, [open]);

  // Apply chữ ký mặc định khi mở modal (nếu user đã đặt default)
  useEffect(() => {
    if (!open) return;
    if (!defaultId) return;
    const sig = sigs.find((s) => s.id === defaultId);
    if (!sig) return;
    setSelectedSigId(defaultId);
    // Đợi editor mount xong (callback ref) rồi mới thay đổi nội dung
    requestAnimationFrame(() => {
      if (!editRef.current) return;
      const body = stripSig(editRef.current.innerHTML || "");
      const next = body + SIG_HR + sig.html;
      editRef.current.innerHTML = next;
      onHtmlChange(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultId]);

  const selectedSig = sigs.find((s) => s.id === selectedSigId) ?? null;

  // Sig appears IN the editor. helpers always strip old sig first to avoid duplication.
  const setEditorContent = (finalHtml: string) => {
    if (editRef.current) editRef.current.innerHTML = finalHtml;
    onHtmlChange(finalHtml);
  };

  const handleInput = () => {
    if (editRef.current) onHtmlChange(editRef.current.innerHTML);
  };

  // Ảnh dán/thả vào body: upload Storage → chèn <img src=https> NGAY → state
  // mail không bao giờ chứa data:/blob: (Gmail/Outlook chặn ảnh inline đó).
  const [imgUploading, setImgUploading] = useState(false);
  const insertImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setImgUploading(true);
    try {
      const url = await uploadInlineImage(file);
      const node = editRef.current;
      if (node) {
        node.focus();
        document.execCommand(
          "insertHTML", false,
          `<img src="${url}" alt="" style="max-width:100%;height:auto" />`,
        );
        onHtmlChange(node.innerHTML);
      }
    } catch (e: any) {
      toast.error("Tải ảnh thất bại: " + (e?.message || ""));
    } finally {
      setImgUploading(false);
    }
  }, [onHtmlChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    for (const it of Array.from(e.clipboardData?.items ?? [])) {
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) { e.preventDefault(); void insertImageFile(f); return; }
      }
    }
  }, [insertImageFile]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    for (const f of Array.from(e.dataTransfer?.files ?? [])) {
      if (f.type.startsWith("image/")) { e.preventDefault(); void insertImageFile(f); return; }
    }
  }, [insertImageFile]);

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
    const finalHtml = sigEditorRef.current?.innerHTML ?? editHtml;
    const newSig: EmailSignature = { id, name: editName.trim() || "Chữ ký", html: finalHtml };
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

          {/* Lời nhắn cập nhật — chỉ hiện ở mode update */}
          {mode === "update" && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Lời nhắn cập nhật{" "}
                <span className="text-muted-foreground/60 font-normal">(optional — hiện callout vàng đầu mail)</span>
              </p>
              <Input
                value={updateNote}
                onChange={(e) => onUpdateNoteChange?.(e.target.value)}
                placeholder="VD: Số khách tăng từ 16 → 18, đổi set menu sang 200k..."
                className="text-sm h-8"
              />
            </div>
          )}

          {/* Editor */}
          <p className="text-xs text-muted-foreground font-medium">Nội dung email</p>
          <div
            ref={editorCallbackRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onPaste={handlePaste}
            onDrop={handleDrop}
            className="w-full min-h-[300px] max-h-[360px] overflow-y-auto border border-border rounded-md p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-white"
          />

          {/* Signature section */}
          <div className="space-y-2 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">Chữ ký:</span>
              <Select value={selectedSigId ?? "none"} onValueChange={handleSigChange}>
                <SelectTrigger className="h-7 text-xs flex-1 max-w-[260px]">
                  <span className="inline-flex items-center gap-1">
                    {!selectedSigId
                      ? "Không có chữ ký"
                      : (
                        <>
                          {sigs.find((s) => s.id === selectedSigId)?.name ?? "Không có chữ ký"}
                          {defaultId === selectedSigId && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                        </>
                      )}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không có chữ ký</SelectItem>
                  {sigs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="inline-flex items-center gap-1">
                        {s.name}
                        {defaultId === s.id && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSig && !sigEditing && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  title={defaultId === selectedSig.id ? "Bỏ mặc định" : "Đặt làm mặc định"}
                  onClick={() => setDefault(defaultId === selectedSig.id ? null : selectedSig.id)}
                >
                  <Star className={cn(
                    "h-3.5 w-3.5",
                    defaultId === selectedSig.id
                      ? "text-amber-500 fill-amber-400"
                      : "text-muted-foreground",
                  )} />
                </Button>
              )}
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
                {/* Format toolbar */}
                <div className="flex items-center gap-0.5 flex-wrap p-1 border border-border rounded-md bg-background">
                  {([
                    { title: "Bold", cmd: "bold", icon: <Bold className="h-3.5 w-3.5" /> },
                    { title: "Italic", cmd: "italic", icon: <Italic className="h-3.5 w-3.5" /> },
                    { title: "Underline", cmd: "underline", icon: <Underline className="h-3.5 w-3.5" /> },
                    { title: "Strikethrough", cmd: "strikeThrough", icon: <Strikethrough className="h-3.5 w-3.5" /> },
                  ] as const).map(({ title, cmd, icon }) => (
                    <button
                      key={cmd}
                      type="button"
                      title={title}
                      onMouseDown={(e) => handleCmd(e, cmd)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      {icon}
                    </button>
                  ))}
                  <div className="w-px h-4 bg-border mx-0.5" />
                  {([
                    { title: "Căn trái", cmd: "justifyLeft", icon: <AlignLeft className="h-3.5 w-3.5" /> },
                    { title: "Căn giữa", cmd: "justifyCenter", icon: <AlignCenter className="h-3.5 w-3.5" /> },
                    { title: "Căn phải", cmd: "justifyRight", icon: <AlignRight className="h-3.5 w-3.5" /> },
                  ] as const).map(({ title, cmd, icon }) => (
                    <button
                      key={cmd}
                      type="button"
                      title={title}
                      onMouseDown={(e) => handleCmd(e, cmd)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      {icon}
                    </button>
                  ))}
                  <div className="w-px h-4 bg-border mx-0.5" />
                  {/* Font size */}
                  <select
                    className="h-6 text-[11px] border border-border rounded px-1 bg-background text-muted-foreground cursor-pointer"
                    defaultValue="3"
                    onMouseDown={saveSelection}
                    onChange={(e) => restoreAndExec("fontSize", e.target.value)}
                  >
                    {[["1","Nhỏ"],["2","Vừa-"],["3","Vừa"],["4","To"],["5","To+"],["6","Lớn"],["7","Lớn+"]].map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  {/* Text color */}
                  <label
                    title="Màu chữ"
                    className="relative h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    onMouseDown={saveSelection}
                  >
                    <Palette className="h-3.5 w-3.5 pointer-events-none" />
                    <input
                      type="color"
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      onInput={(e) => restoreAndExec("foreColor", (e.target as HTMLInputElement).value)}
                    />
                  </label>
                  <div className="w-px h-4 bg-border mx-0.5" />
                  {/* Insert link */}
                  <button
                    type="button"
                    title="Chèn link"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      saveSelection();
                      const url = prompt("Nhập URL:");
                      if (url) restoreAndExec("createLink", url);
                    }}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div
                  ref={sigEditorCallbackRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setEditHtml((e.target as HTMLDivElement).innerHTML)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      document.execCommand("insertLineBreak");
                    }
                  }}
                  className="w-full min-h-[112px] text-xs border border-border rounded p-2 focus:outline-none focus:ring-2 focus:ring-ring bg-white empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground"
                  data-placeholder="Nhập nội dung chữ ký..."
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
          <Button onClick={onSendViaServer} disabled={sending || !to || imgUploading}>
            <Send className="h-4 w-4 mr-1.5" />
            {imgUploading ? "Đang tải ảnh..." : sending ? "Đang gửi..." : "Gửi qua server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
