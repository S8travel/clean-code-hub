import { useMemo, useRef, useState } from "react";
import { Upload, X, FileCheck, AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useBatchUploadUNC, type HoaDonUNCRow } from "@/hooks/use-hoa-don-unc";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Trích các số "ứng viên" từ tên file: cả run [0-9.,] (gộp ngăn cách nghìn)
// lẫn run [0-9] thuần → so khớp với so_tien của ĐNTT.
function amountCandidates(name: string): Set<number> {
  const set = new Set<number>();
  const base = name.replace(/\.[a-z0-9]+$/i, ""); // bỏ đuôi file
  for (const m of base.matchAll(/[0-9][0-9.,]*[0-9]|[0-9]/g)) {
    const raw = m[0];
    const noSep = Number(raw.replace(/[.,]/g, ""));
    if (Number.isFinite(noSep) && noSep > 0) set.add(noSep);
    const plain = Number(raw.replace(/[^0-9]/g, ""));
    if (Number.isFinite(plain) && plain > 0) set.add(plain);
  }
  return set;
}

interface Props {
  open: boolean;
  onClose: () => void;
  doanLabel: string;
  rows: HoaDonUNCRow[]; // ĐNTT của đoàn đang thiếu UNC (trang_thai_unc='chua_co')
}

export default function BatchUncDialog({ open, onClose, doanLabel, rows }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const batchMut = useBatchUploadUNC();
  const [files, setFiles] = useState<File[]>([]);
  // map: rowId -> file index (trong `files`); 1 file chỉ gắn 1 row.
  const [assign, setAssign] = useState<Record<number, number | undefined>>({});

  const autoPair = (fs: File[]) => {
    const next: Record<number, number | undefined> = {};
    const used = new Set<number>();
    const cands = fs.map((f) => amountCandidates(f.name));
    for (const r of rows) {
      const target = Math.round(r.so_tien);
      const fi = cands.findIndex(
        (c, i) => !used.has(i) && c.has(target),
      );
      if (fi >= 0) { next[r.id] = fi; used.add(fi); }
    }
    setAssign(next);
  };

  const onPick = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const fs = Array.from(picked);
    setFiles(fs);
    autoPair(fs);
  };

  const setRowFile = (rowId: number, fileIdx: number | undefined) => {
    setAssign((prev) => {
      const next = { ...prev };
      // 1 file ↔ 1 row: gỡ file khỏi row khác đang giữ nó
      if (fileIdx !== undefined) {
        for (const k of Object.keys(next)) {
          if (next[Number(k)] === fileIdx) next[Number(k)] = undefined;
        }
      }
      next[rowId] = fileIdx;
      return next;
    });
  };

  const pairs = useMemo(
    () =>
      rows
        .filter((r) => assign[r.id] !== undefined)
        .map((r) => ({ id: r.id, file: files[assign[r.id]!] })),
    [rows, assign, files],
  );
  const matchedCount = pairs.length;
  const usedIdx = new Set(Object.values(assign).filter((v): v is number => v !== undefined));
  const leftoverFiles = files.filter((_, i) => !usedIdx.has(i));

  const handleSave = () => {
    if (pairs.length === 0) { toast({ title: "Chưa ghép file nào", variant: "destructive" }); return; }
    batchMut.mutate(pairs, {
      onSuccess: ({ ok, failed, errors }) => {
        if (failed === 0) {
          toast({ title: `Đã gắn UNC cho ${ok} ĐNTT` });
          handleClose();
        } else {
          toast({
            title: `Gắn ${ok} OK, ${failed} lỗi`,
            description: errors.slice(0, 3).join("; "),
            variant: "destructive",
          });
        }
      },
      onError: (e: any) =>
        toast({ title: "Lỗi: " + (e?.message || "Không gắn được"), variant: "destructive" }),
    });
  };

  const handleClose = () => {
    setFiles([]);
    setAssign({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            Gắn UNC nhanh — {doanLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {rows.length} ĐNTT đang thiếu UNC. Chọn nhiều file UNC cùng lúc — hệ
            thống tự ghép theo <strong>số tiền</strong>; dòng nào sai chỉ cần đổi
            lại bằng dropdown (không cần chọn file lại). Mỗi file gắn đúng 1 ĐNTT.
          </p>

          {/* Vùng chọn / kéo-thả file */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files); }}
            className="border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm font-medium">Bấm chọn / kéo-thả nhiều file UNC vào đây</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {files.length > 0
                ? `Đã chọn ${files.length} file — đã ghép ${matchedCount}/${rows.length}`
                : "PDF / ảnh — tên file nên chứa số tiền để tự ghép"}
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,image/*"
              className="hidden"
              onChange={(e) => { onPick(e.target.files); e.target.value = ""; }}
            />
          </div>

          {files.length > 0 && (
            <div className="border rounded-lg max-h-[42vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Nội dung / NCC</th>
                    <th className="text-right p-2 font-medium w-[120px]">Số tiền</th>
                    <th className="text-left p-2 font-medium w-[300px]">File UNC</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const fi = assign[r.id];
                    const matched = fi !== undefined;
                    return (
                      <tr key={r.id} className="border-t">
                        <td className="p-2">
                          {r.ten_doan && (
                            <div className="text-[11px] font-semibold text-blue-700 truncate max-w-[260px]">
                              {r.ten_doan}
                            </div>
                          )}
                          <div className="font-medium truncate max-w-[260px]">
                            {r.mo_ta || r.ten_nha_cung_cap || `ĐNTT #${r.id}`}
                          </div>
                          {r.ten_nha_cung_cap && r.mo_ta && (
                            <div className="text-muted-foreground truncate max-w-[260px]">
                              {r.ten_nha_cung_cap}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums font-semibold">
                          {fmt(r.so_tien)}
                        </td>
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            {matched ? (
                              <FileCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                            <Select
                              value={fi === undefined ? "_none" : String(fi)}
                              onValueChange={(v) =>
                                setRowFile(r.id, v === "_none" ? undefined : Number(v))
                              }
                            >
                              <SelectTrigger className="h-7 text-xs flex-1">
                                <span className="truncate">
                                  {fi === undefined ? "— Chưa gắn —" : files[fi]?.name}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none" className="text-xs">— Chưa gắn —</SelectItem>
                                {files.map((f, i) => {
                                  const usedElsewhere =
                                    usedIdx.has(i) && assign[r.id] !== i;
                                  return (
                                    <SelectItem
                                      key={i}
                                      value={String(i)}
                                      className="text-xs"
                                      disabled={usedElsewhere}
                                    >
                                      {f.name}{usedElsewhere ? " (đã dùng)" : ""}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {leftoverFiles.length > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              {leftoverFiles.length} file chưa ghép vào ĐNTT nào:{" "}
              {leftoverFiles.map((f) => f.name).join(", ")}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={batchMut.isPending}>
            <X className="h-4 w-4 mr-1" /> Đóng
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={batchMut.isPending || matchedCount === 0}
          >
            {batchMut.isPending
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Đang lưu...</>
              : `Lưu tất cả (${matchedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
