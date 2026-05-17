import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { externalSupabase } from "@/lib/supabase-external";
import { useUserListForAssign } from "@/hooks/use-cong-viec";
import {
  defaultPhanViec, useDefaultAssignees, type PvKey,
} from "@/hooks/use-phan-viec";

export interface PhanViecInfo {
  code: string;
  agent: string;
  diaDiem: string;
  soKhach: number | null;
  ngayDi: string | null;
  ngayVe: string | null;
  loaiTour: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  info: PhanViecInfo | null;
  creatorId: string;
  submitting: boolean;
  onConfirm: (
    assignments: { key: PvKey; assignedTo: string | null }[],
    fileChuongTrinh: string | null,
  ) => Promise<void>;
}

interface RowState { key: PvKey; label: string; checked: boolean; assignedTo: string }

export function PhanViecModal({ open, onClose, info, creatorId, submitting, onConfirm }: Props) {
  const { data: users = [] } = useUserListForAssign();
  const { data: defaults } = useDefaultAssignees();
  const [rows, setRows] = useState<RowState[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open && info) {
      setRows(
        defaultPhanViec(info.loaiTour).map((d) => {
          let assignedTo = "";
          if (d.key === "pv_ks") assignedTo = creatorId;            // KS = người tạo
          else if (defaults?.[d.key]) assignedTo = defaults[d.key]!.user_id; // config
          return { key: d.key, label: d.label, checked: d.checked, assignedTo };
        }),
      );
      setFile(null);
    }
  }, [open, info, creatorId, defaults]);

  if (!info) return null;

  const setRow = (key: PvKey, patch: Partial<RowState>) =>
    setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = async () => {
    const assignments = rows
      .filter((r) => r.checked)
      .map((r) => ({ key: r.key, assignedTo: r.assignedTo || null }));
    if (assignments.length === 0) { toast.error("Chọn ít nhất 1 đầu việc"); return; }
    let fileUrl: string | null = null;
    if (file) {
      setUploading(true);
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${Date.now()}-${safe}`;
      const { error: upErr } = await externalSupabase.storage
        .from("doan-files").upload(path, file, { upsert: false });
      setUploading(false);
      if (upErr) { toast.error("Lỗi tải file: " + upErr.message); return; }
      fileUrl = externalSupabase.storage.from("doan-files").getPublicUrl(path).data.publicUrl;
    }
    await onConfirm(assignments, fileUrl);
  };

  const dateStr = info.ngayDi
    ? `${info.ngayDi}${info.ngayVe ? ` → ${info.ngayVe}` : ""}`
    : "—";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Phân việc đoàn
          </DialogTitle>
        </DialogHeader>

        {/* Thông tin cơ bản đoàn */}
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Code</span>
            <span className="font-semibold">{info.code}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Agent</span><span>{info.agent}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Địa điểm</span><span>{info.diaDiem}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Số khách</span>
            <span>{info.soKhach ?? "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Ngày đi → về</span>
            <span className="tabular-nums">{dateStr}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Người được chọn nhận thông báo (giao bởi Hệ thống). Mục để trống →
          Admin phụ trách. Giám đốc nhận thông tin đoàn.
        </p>

        <div className="space-y-2 py-1">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2">
              <Checkbox
                checked={r.checked}
                onCheckedChange={(v) => setRow(r.key, { checked: !!v })}
                className="shrink-0"
              />
              <Label className="text-sm w-32 shrink-0">{r.label}</Label>
              <Select
                value={r.assignedTo || "_none"}
                onValueChange={(v) => setRow(r.key, { assignedTo: v === "_none" ? "" : v })}
                disabled={!r.checked}
              >
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="— Admin phụ trách —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none" className="text-xs">— Admin phụ trách —</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id} className="text-xs">
                      {u.ho_ten}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {/* File chương trình (tuỳ chọn) */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            File chương trình (tuỳ chọn — doc / pdf / ảnh)
          </Label>
          {file ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
              <span className="truncate">{file.name}</span>
              <button type="button" className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => setFile(null)}>✕</button>
            </div>
          ) : (
            <input
              type="file"
              accept=".doc,.docx,.pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-muted/70"
            />
          )}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={submit} disabled={submitting || uploading}>
            {uploading ? "Đang tải file..." : submitting ? "Đang tạo đoàn..." : "Xác nhận phân việc & tạo đoàn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
