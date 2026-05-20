import { useRef, useState } from "react";
import { Upload, X, FileCheck, AlertTriangle, Loader2, ScanText } from "lucide-react";
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
import { isAmountMatch } from "@/lib/ocr-invoice";
import { ocrUncSlip, normCode, type OcrUncResult } from "@/lib/ocr-unc";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Số "ứng viên" từ tên file (gộp ngăn cách nghìn lẫn số liền).
function amountCandidates(name: string): Set<number> {
  const set = new Set<number>();
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  for (const m of base.matchAll(/[0-9][0-9.,]*[0-9]|[0-9]/g)) {
    const raw = m[0];
    const noSep = Number(raw.replace(/[.,]/g, ""));
    if (Number.isFinite(noSep) && noSep > 0) set.add(noSep);
    const plain = Number(raw.replace(/[^0-9]/g, ""));
    if (Number.isFinite(plain) && plain > 0) set.add(plain);
  }
  return set;
}

type Reason = "code" | "amount_ocr" | "amount_file" | "manual";

interface Props {
  open: boolean;
  onClose: () => void;
  doanLabel: string;
  rows: HoaDonUNCRow[]; // ĐNTT đang thiếu UNC (trang_thai_unc='chua_co')
}

export default function BatchUncDialog({ open, onClose, doanLabel, rows }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const batchMut = useBatchUploadUNC();
  const [files, setFiles] = useState<File[]>([]);
  const [assign, setAssign] = useState<Record<number, number | undefined>>({});
  const [reasons, setReasons] = useState<Record<number, Reason>>({});
  const [ocrProg, setOcrProg] = useState<{ running: boolean; done: number; total: number }>(
    { running: false, done: 0, total: 0 },
  );
  // Chẩn đoán OCR theo từng file (idx → số tiền đọc được / lỗi).
  const [ocrInfo, setOcrInfo] = useState<Record<number, { amount: number | null; err?: string }>>({});

  // Refs cho vòng OCR (đăng ký 1 lần) đọc state mới nhất.
  const manualRef = useRef<Set<number>>(new Set());      // rowId user tự chọn → không auto đè
  const filesRef = useRef<File[]>([]);
  const ocrRef = useRef<Record<number, OcrUncResult>>({});
  const assignRef = useRef<Record<number, number | undefined>>({}); // mirror assign cho recompute
  const runRef = useRef(0);                               // huỷ vòng cũ khi chọn lại / đóng

  // Ghép lại toàn bộ (thuần, từ refs): ưu tiên mã đoàn+số tiền (OCR) >
  // số tiền OCR > số tiền tên file. Giữ nguyên dòng user đã tự chọn (manual).
  const recompute = () => {
    const fs = filesRef.current;
    const ocr = ocrRef.current;
    const manual = manualRef.current;
    const prevA = assignRef.current;
    const nextA: Record<number, number | undefined> = {};
    const nextR: Record<number, Reason> = {};
    const used = new Set<number>();

    // 1) Khoá các dòng user tự chọn
    for (const r of rows) {
      if (manual.has(r.id)) {
        const fiPrev = prevA[r.id];
        nextA[r.id] = fiPrev;
        nextR[r.id] = "manual";
        if (fiPrev !== undefined) used.add(fiPrev);
      }
    }
    const pick = (
      test: (r: HoaDonUNCRow, fi: number) => boolean,
      reason: Reason,
    ) => {
      for (const r of rows) {
        if (manual.has(r.id) || nextA[r.id] !== undefined) continue;
        for (let fi = 0; fi < fs.length; fi++) {
          if (used.has(fi)) continue;
          if (test(r, fi)) { nextA[r.id] = fi; nextR[r.id] = reason; used.add(fi); break; }
        }
      }
    };
    // 2) Mã đoàn xuất hiện trong ảnh + số tiền khớp
    pick((r, fi) => {
      const o = ocr[fi]; if (!o || !r.ten_doan) return false;
      // CHỈ lấy token mã đoàn đầu (trước dấu cách / "(") — ten_doan có thể
      // kèm mô tả "(4 ngày…)" / "Test" mà nội dung UNC không có.
      const codeTok = r.ten_doan.trim().split(/[\s(]/)[0];
      const code = normCode(codeTok);
      return code.length >= 4 && normCode(o.text).includes(code)
        && o.amount != null && isAmountMatch(o.amount, r.so_tien);
    }, "code");
    // 3) Số tiền OCR khớp
    pick((r, fi) => {
      const o = ocr[fi];
      return !!o && o.amount != null && isAmountMatch(o.amount, r.so_tien);
    }, "amount_ocr");
    // 4) Số tiền trong tên file khớp
    pick((r, fi) =>
      amountCandidates(fs[fi].name).has(Math.round(r.so_tien)), "amount_file");

    assignRef.current = nextA;
    setAssign(nextA);
    setReasons(nextR);
  };

  const runOcr = async (fs: File[], myRun: number) => {
    setOcrProg({ running: true, done: 0, total: fs.length });
    for (let i = 0; i < fs.length; i++) {
      if (runRef.current !== myRun) return; // đã chọn lại / đóng
      try {
        const res = await ocrUncSlip(fs[i]);
        ocrRef.current[i] = res;
        setOcrInfo((p) => ({ ...p, [i]: { amount: res.amount } }));
      } catch (e: any) {
        ocrRef.current[i] = { amount: null, text: "" };
        setOcrInfo((p) => ({ ...p, [i]: { amount: null, err: String(e?.message || e) } }));
      }
      if (runRef.current !== myRun) return;
      setOcrProg({ running: true, done: i + 1, total: fs.length });
      recompute();
    }
    if (runRef.current === myRun) setOcrProg({ running: false, done: fs.length, total: fs.length });
  };

  const onPick = (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    const fs = Array.from(picked);
    const myRun = ++runRef.current;
    manualRef.current = new Set();
    ocrRef.current = {};
    assignRef.current = {};
    filesRef.current = fs;
    setFiles(fs);
    setOcrInfo({});
    recompute();          // ghép nhanh theo tên file ngay
    runOcr(fs, myRun);    // rồi OCR refine nền
  };

  const rerunOcr = () => {
    const fs = filesRef.current;
    if (fs.length === 0) return;
    const myRun = ++runRef.current;
    ocrRef.current = {};
    setOcrInfo({});
    recompute();
    runOcr(fs, myRun);
  };

  const setRowFile = (rowId: number, fileIdx: number | undefined) => {
    manualRef.current.add(rowId);
    const next = { ...assignRef.current };
    if (fileIdx !== undefined) {
      for (const k of Object.keys(next)) {
        if (next[Number(k)] === fileIdx) next[Number(k)] = undefined;
      }
    }
    next[rowId] = fileIdx;
    assignRef.current = next;
    setAssign(next);
    setReasons((p) => ({ ...p, [rowId]: "manual" }));
  };

  const pairs = rows
    .filter((r) => assign[r.id] !== undefined)
    .map((r) => ({ id: r.id, file: files[assign[r.id]!] }));
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
    runRef.current++; // huỷ vòng OCR đang chạy
    setFiles([]);
    setAssign({});
    setReasons({});
    setOcrProg({ running: false, done: 0, total: 0 });
    setOcrInfo({});
    manualRef.current = new Set();
    ocrRef.current = {};
    assignRef.current = {};
    filesRef.current = [];
    onClose();
  };

  const badge = (rowId: number) => {
    const r = reasons[rowId];
    if (assign[rowId] === undefined) return null;
    if (r === "code")
      return <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">khớp mã đoàn</span>;
    if (r === "amount_ocr" || r === "amount_file")
      return <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">khớp số tiền</span>;
    if (r === "manual")
      return <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">chọn tay</span>;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base">
            Gắn UNC nhanh — {doanLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
          <p className="text-xs text-muted-foreground">
            {rows.length} ĐNTT đang thiếu UNC. Chọn nhiều ảnh UNC cùng lúc — hệ
            thống <strong>đọc ảnh (OCR)</strong> tự ghép theo <strong>mã đoàn + số
            tiền</strong>; dòng nào sai chỉ cần đổi lại bằng dropdown. Mỗi file
            gắn đúng 1 ĐNTT.
          </p>

          {/* Vùng chọn / kéo-thả file */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files); }}
            className="border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm font-medium">Bấm chọn / kéo-thả nhiều ảnh UNC vào đây</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {files.length > 0
                ? `Đã chọn ${files.length} file — đã ghép ${matchedCount}/${rows.length}`
                : "Ảnh chụp app ngân hàng (jpg/png) — không cần đổi tên file"}
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

          {ocrProg.running && (
            <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
              <ScanText className="h-3.5 w-3.5 animate-pulse" />
              Đang đọc ảnh {ocrProg.done}/{ocrProg.total}… (có thể chỉnh tay trong lúc chờ)
            </div>
          )}

          {/* Chẩn đoán OCR theo từng file — list scroll trong panel để không
              đẩy bảng ĐNTT khỏi viewport khi upload nhiều file. */}
          {files.length > 0 && (
            <div className="border rounded-lg text-[11px] bg-muted/20">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50 sticky top-0 bg-muted/20 backdrop-blur">
                <span className="font-medium text-muted-foreground">
                  OCR đọc ảnh ({files.length} file)
                </span>
                {!ocrProg.running && (
                  <button
                    type="button"
                    onClick={rerunOcr}
                    className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                  >
                    <ScanText className="h-3 w-3" /> Đọc lại OCR
                  </button>
                )}
              </div>
              <div className="max-h-[180px] overflow-y-auto px-2 py-1.5 space-y-0.5">
                {files.map((f, i) => {
                  const info = ocrInfo[i];
                  return (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate max-w-[360px] text-muted-foreground">{f.name}</span>
                      <span className="shrink-0">
                        {info === undefined
                          ? <span className="text-muted-foreground">{ocrProg.running ? "đang đọc…" : "—"}</span>
                          : info.err
                            ? <span className="text-red-600">OCR lỗi: {info.err.slice(0, 40)}</span>
                            : info.amount != null
                              ? <span className="text-emerald-700 tabular-nums">đọc được {fmt(info.amount)} ₫</span>
                              : <span className="text-amber-600">không đọc được số tiền</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="border rounded-lg max-h-[42vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Đoàn / Nội dung</th>
                    <th className="text-right p-2 font-medium w-[110px]">Số tiền</th>
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
                            {badge(r.id)}
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

        <DialogFooter className="gap-2 shrink-0">
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
