import { useEffect, useRef, useState } from "react";
import { Upload, X, FileCheck, AlertTriangle, Loader2, ScanText, FileText, Eye, Send, Check } from "lucide-react";
import { errMsg } from "@/lib/error";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useBatchUploadUNC, type HoaDonUNCRow } from "@/hooks/use-hoa-don-unc";
import { useMarkPaidWithDate } from "@/hooks/use-dntt";
import { ocrUncSlip, type OcrUncResult } from "@/lib/ocr-unc";
import { computeUncAssignments, uncAmountMatch } from "@/lib/ocr-unc-match";
import { PAYMENT_SOURCE_LABELS, matchPaymentSource } from "@/lib/payment-sources";
import { format } from "date-fns";
import { callSendBookingEmail } from "@/hooks/use-booking-dv";
import { useCurrentUserProfile } from "@/hooks/use-doan";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import {
  resolveBookingEmail, buildUncEmailBody, buildUncEmailSubject,
  getCanTruAmount, fileUncAsBase64, ccForLoai,
  type EmailTarget,
} from "@/lib/unc-email";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Số tiền THỰC chuyển trên UNC = so_tien ĐNTT − đã trả (cọc + cấn trừ).
// Hóa đơn thì khớp so_tien gốc (flow khác).
const conLai = (r: HoaDonUNCRow) => Math.max(0, r.so_tien - (r.paid_amount ?? 0));

type Reason = "ncc" | "code" | "amount_ocr" | "manual";

interface Props {
  open: boolean;
  onClose: () => void;
  doanLabel: string;
  rows: HoaDonUNCRow[]; // ĐNTT đang thiếu UNC (trang_thai_unc='chua_co')
}

type SendStatus = "idle" | "sending" | "sent" | "skipped" | "failed";
interface SendTarget {
  rowId: number;
  row: HoaDonUNCRow;
  file: File;
  email: string;
  target: EmailTarget;
  include: boolean;
  status: SendStatus;
  error?: string;
}

export default function BatchUncDialog({ open, onClose, doanLabel, rows }: Props) {
  useTranslate();
  const inputRef = useRef<HTMLInputElement>(null);
  const batchMut = useBatchUploadUNC();
  const markPaidMut = useMarkPaidWithDate();
  const { data: userProfile } = useCurrentUserProfile();
  const { email: currentUserEmail } = useCurrentUserEmail();
  const [step, setStep] = useState<"pick" | "send">("pick");
  const [sendTargets, setSendTargets] = useState<SendTarget[]>([]);
  const [resolvingEmails, setResolvingEmails] = useState(false);
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [assign, setAssign] = useState<Record<number, number | undefined>>({});
  const [reasons, setReasons] = useState<Record<number, Reason>>({});
  // Nguồn TT per row (rowId → label nguồn) — auto match từ OCR, user sửa được.
  const [nguonMap, setNguonMap] = useState<Record<number, string>>({});
  const [ocrProg, setOcrProg] = useState<{ running: boolean; done: number; total: number }>(
    { running: false, done: 0, total: 0 },
  );
  // Chẩn đoán OCR theo từng file (idx → số tiền đọc được / lỗi).
  const [ocrInfo, setOcrInfo] = useState<Record<number, { amount: number | null; err?: string }>>({});

  // Object URLs cho ảnh preview — tạo 1 lần khi pick, revoke khi đóng.
  const [previewUrls, setPreviewUrls] = useState<Record<number, string>>({});
  const previewUrlsRef = useRef<Record<number, string>>({});
  useEffect(() => { previewUrlsRef.current = previewUrls; }, [previewUrls]);

  // Lightbox preview state — null khi đóng, file index khi mở.
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Refs cho vòng OCR (đăng ký 1 lần) đọc state mới nhất.
  const manualRef = useRef<Set<number>>(new Set());      // rowId user tự chọn → không auto đè
  const manualNguonRef = useRef<Set<number>>(new Set()); // rowId user tự chọn NGUỒN → không auto đè
  const filesRef = useRef<File[]>([]);
  const ocrRef = useRef<Record<number, OcrUncResult>>({});
  const assignRef = useRef<Record<number, number | undefined>>({}); // mirror assign cho recompute
  const nguonRef = useRef<Record<number, string>>({});   // mirror nguonMap cho handleSave
  const runRef = useRef(0);                               // huỷ vòng cũ khi chọn lại / đóng
  // rows fresh cho recompute() chạy trong runOcr async (tránh stale closure).
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // Ghép lại toàn bộ (thuần, từ refs).
  //
  // Rule auto-match:
  //  1) STRICT (code): nội dung UNC chứa mã đoàn + số tiền khớp → tin tuyệt đối.
  //  2) AMBIGUITY-SAFE (amount): chỉ ghép khi UNIQUE cả 2 bên — không row khác
  //     cùng số tiền VÀ không file khác cùng số tiền. Vì 1 đoàn có thể có
  //     nhiều UNC + nhiều đoàn có thể cùng số tiền (ví dụ cọc 10tr).
  //  Còn lại → để user chọn tay.
  const recompute = () => {
    const fs = filesRef.current;
    const ocr = ocrRef.current;
    const currentRows = rowsRef.current; // FRESH — tránh stale closure trong runOcr async

    // manual map (rowId → fileIdx user tự chọn) để hàm thuần giữ nguyên.
    const manualMap: Record<number, number | undefined> = {};
    for (const id of manualRef.current) manualMap[id] = assignRef.current[id];

    // Logic ghép tách ra lib (đã test): khớp số tiền (con_lai) BẮT BUỘC, ưu tiên mã đoàn.
    const matchRows = currentRows.map((r) => ({
      id: r.id, tenDoan: r.ten_doan, amount: conLai(r), nccName: r.ten_nha_cung_cap,
    }));
    const matchFiles = fs.map((_, i) => ocr[i] ?? { amount: null, text: "" });
    const { assign: nextA, reasons: nextR } = computeUncAssignments(matchRows, matchFiles, manualMap);

    assignRef.current = nextA;
    setAssign(nextA);
    setReasons(nextR as Record<number, Reason>);

    // Auto-match NGUỒN từ OCR text của file đã ghép. Giữ nguồn user đã chọn tay.
    const prevN = nguonRef.current;
    const nextN: Record<number, string> = {};
    for (const r of currentRows) {
      const fi = nextA[r.id];
      if (fi === undefined) continue;
      if (manualNguonRef.current.has(r.id)) {
        nextN[r.id] = prevN[r.id] ?? "";
      } else {
        nextN[r.id] = matchPaymentSource(ocr[fi]?.text ?? "") ?? "";
      }
    }
    nguonRef.current = nextN;
    setNguonMap(nextN);
  };

  const runOcr = async (fs: File[], myRun: number) => {
    setOcrProg({ running: true, done: 0, total: fs.length });
    for (let i = 0; i < fs.length; i++) {
      if (runRef.current !== myRun) return; // đã chọn lại / đóng
      try {
        const res = await ocrUncSlip(fs[i]);
        ocrRef.current[i] = res;
        setOcrInfo((p) => ({ ...p, [i]: { amount: res.amount } }));
      } catch (e: unknown) {
        ocrRef.current[i] = { amount: null, text: "" };
        setOcrInfo((p) => ({ ...p, [i]: { amount: null, err: errMsg(e) || String(e) } }));
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
    manualNguonRef.current = new Set();
    ocrRef.current = {};
    assignRef.current = {};
    nguonRef.current = {};
    filesRef.current = fs;
    setFiles(fs);
    setNguonMap({});
    setOcrInfo({});
    // Revoke URLs cũ + build preview URLs mới cho ảnh (PDF skip — không render
    // thumbnail bằng <img>).
    for (const u of Object.values(previewUrlsRef.current)) URL.revokeObjectURL(u);
    const urls: Record<number, string> = {};
    for (let i = 0; i < fs.length; i++) {
      if (fs[i].type.startsWith("image/")) {
        urls[i] = URL.createObjectURL(fs[i]);
      }
    }
    setPreviewUrls(urls);
    recompute();          // clear assign cũ — chưa ghép gì tới khi OCR đọc xong
    runOcr(fs, myRun);    // OCR đọc số tiền → recompute() ghép dần (bắt buộc khớp số tiền)
  };

  // Cleanup URLs khi unmount
  useEffect(() => {
    return () => {
      for (const u of Object.values(previewUrlsRef.current)) URL.revokeObjectURL(u);
    };
  }, []);

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

    // Đổi file → re-match nguồn theo file mới (bỏ manual nguồn cũ của row này).
    manualNguonRef.current.delete(rowId);
    const newNguon = fileIdx === undefined
      ? ""
      : (matchPaymentSource(ocrRef.current[fileIdx]?.text ?? "") ?? "");
    const nextN = { ...nguonRef.current, [rowId]: newNguon };
    nguonRef.current = nextN;
    setNguonMap(nextN);
  };

  const setRowNguon = (rowId: number, nguon: string) => {
    manualNguonRef.current.add(rowId);
    const next = { ...nguonRef.current, [rowId]: nguon };
    nguonRef.current = next;
    setNguonMap(next);
  };

  const pairs = rows
    .filter((r) => assign[r.id] !== undefined)
    .map((r) => ({ id: r.id, file: files[assign[r.id]!] }));
  const matchedCount = pairs.length;
  const usedIdx = new Set(Object.values(assign).filter((v): v is number => v !== undefined));
  const leftoverFiles = files.filter((_, i) => !usedIdx.has(i));

  const handleSave = () => {
    if (pairs.length === 0) { toast({ title: t("Chưa ghép file nào"), variant: "destructive" }); return; }
    // Snapshot pairs trước khi mutate — saved rows sẽ disappear khỏi `rows` prop
    // sau khi trang_thai_unc='da_co' (parent filter chỉ ĐNTT thiếu UNC).
    const snapshot = pairs.map((p) => ({
      rowId: p.id,
      row: rows.find((r) => r.id === p.id)!,
      file: p.file,
    })).filter((s) => s.row);
    batchMut.mutate(pairs, {
      onSuccess: async ({ ok, failed, errors }) => {
        if (failed === 0) {
          toast({ title: `${t("Đã gắn UNC cho")} ${ok} ĐNTT` });

          // Tự markPaid cho dòng CÓ NGUỒN + OCR số tiền KHỚP ĐNTT (an toàn).
          const today = format(new Date(), "yyyy-MM-dd");
          const toPay = snapshot.filter((s) => {
            const fi = assignRef.current[s.rowId];
            const nguon = nguonRef.current[s.rowId];
            if (fi === undefined || !nguon) return false;
            const o = ocrRef.current[fi];
            return !!o && o.amount != null && uncAmountMatch(o.amount, conLai(s.row));
          });
          let paidOk = 0;
          let paidFail = 0;
          for (const s of toPay) {
            try {
              await markPaidMut.mutateAsync({
                id: s.rowId, ngayThanhToan: today, nguon: nguonRef.current[s.rowId],
              });
              paidOk++;
            } catch {
              paidFail++;
            }
          }
          if (paidOk > 0) toast({ title: `${t("Đã đánh dấu Đã TT")} ${paidOk} ĐNTT` });
          if (paidFail > 0) {
            toast({ title: `${paidFail} ${t("ĐNTT đánh dấu TT lỗi")}`, variant: "destructive" });
          }

          // Switch sang step 2 — resolve email + cho user review trước khi gửi
          setStep("send");
          setResolvingEmails(true);
          try {
            const resolved = await Promise.all(
              snapshot.map(async (s) => {
                const target = await resolveBookingEmail(s.row);
                return {
                  ...s,
                  email: target.email,
                  target,
                  include: !!target.email,
                  status: "idle" as SendStatus,
                };
              }),
            );
            setSendTargets(resolved);
          } catch (e: unknown) {
            toast({ title: `${t("Lỗi tra email NCC")}: ${errMsg(e) || ""}`, variant: "destructive" });
          } finally {
            setResolvingEmails(false);
          }
        } else {
          toast({
            title: `${t("Gắn")} ${ok} OK, ${failed} ${t("lỗi")}`,
            description: errors.slice(0, 3).join("; "),
            variant: "destructive",
          });
        }
      },
      onError: (e: unknown) =>
        toast({ title: `${t("Lỗi")}: ${errMsg(e) || t("Không gắn được")}`, variant: "destructive" }),
    });
  };

  const handleSendAll = async () => {
    const toSend = sendTargets.filter((s) => s.include && !!s.email && s.status !== "sent");
    if (toSend.length === 0) { toast({ title: t("Không có email nào để gửi"), variant: "destructive" }); return; }
    setSending(true);
    let okCount = 0;
    let failCount = 0;
    try {
      for (const tgt of toSend) {
        setSendTargets((prev) => prev.map((s) => s.rowId === tgt.rowId ? { ...s, status: "sending" } : s));
        try {
          const canTruAmount = await getCanTruAmount(tgt.rowId);
          const attachment = await fileUncAsBase64(tgt.file, tgt.row.ten_nha_cung_cap, tgt.rowId);
          await callSendBookingEmail({
            to: tgt.email,
            cc: ccForLoai(tgt.row.loai),
            subject: buildUncEmailSubject(tgt.row, tgt.target.bookingSubject),
            html: buildUncEmailBody(tgt.row, canTruAmount, userProfile ?? null),
            replyTo: userProfile?.email || currentUserEmail || undefined,
            attachments: [attachment],
          });
          okCount++;
          setSendTargets((prev) => prev.map((s) => s.rowId === tgt.rowId ? { ...s, status: "sent" } : s));
        } catch (e: unknown) {
          failCount++;
          setSendTargets((prev) => prev.map((s) => s.rowId === tgt.rowId ? { ...s, status: "failed", error: errMsg(e) || "" } : s));
        }
      }
      if (failCount === 0) {
        toast({ title: `${t("Đã gửi mail UNC cho")} ${okCount} NCC` });
      } else {
        toast({
          title: `${t("Gửi")} ${okCount} OK, ${failCount} ${t("lỗi")}`,
          variant: "destructive",
        });
      }
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    runRef.current++; // huỷ vòng OCR đang chạy
    setFiles([]);
    setAssign({});
    setReasons({});
    setNguonMap({});
    setOcrProg({ running: false, done: 0, total: 0 });
    setOcrInfo({});
    for (const u of Object.values(previewUrlsRef.current)) URL.revokeObjectURL(u);
    setPreviewUrls({});
    setLightboxIdx(null);
    manualRef.current = new Set();
    manualNguonRef.current = new Set();
    ocrRef.current = {};
    assignRef.current = {};
    nguonRef.current = {};
    filesRef.current = [];
    setStep("pick");
    setSendTargets([]);
    setResolvingEmails(false);
    setSending(false);
    onClose();
  };

  const badge = (rowId: number) => {
    const r = reasons[rowId];
    if (assign[rowId] === undefined) return null;
    if (r === "ncc")
      return <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{t("khớp mã đoàn + NCC")}</span>;
    if (r === "code")
      return <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{t("khớp mã đoàn")}</span>;
    if (r === "amount_ocr")
      return <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{t("khớp số tiền")}</span>;
    if (r === "manual")
      return <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{t("chọn tay")}</span>;
    return null;
  };

  if (step === "send") {
    const total = sendTargets.length;
    const withEmail = sendTargets.filter((s) => !!s.email).length;
    const selectedCount = sendTargets.filter((s) => s.include && !!s.email).length;
    return (
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-600" />
              {t("Gửi mail UNC")} — {doanLabel}
              <span className="text-xs font-normal text-muted-foreground">{t("(Bước 2/2)")}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
            <p className="text-xs text-muted-foreground">
              {t("Đã gắn UNC cho")} <strong>{total}</strong> {t("ĐNTT")}.
              {" "}{withEmail}/{total} {t("có email NCC sẵn sàng gửi")}.
              {withEmail < total && (
                <span className="text-amber-700 ml-1">
                  {t("Dòng không email sẽ skip — gửi tay sau qua nút mở từng row.")}
                </span>
              )}
            </p>

            {resolvingEmails ? (
              <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("Đang tra email NCC...")}
              </div>
            ) : (
              <div className="border rounded-lg overflow-auto max-h-[55vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-center p-2 font-medium w-[40px]">
                        <Checkbox
                          checked={sendTargets.every((s) => !s.email || s.include)}
                          disabled={sending}
                          onCheckedChange={(v) => {
                            setSendTargets((prev) => prev.map((s) => ({
                              ...s,
                              include: !!s.email && !!v,
                            })));
                          }}
                        />
                      </th>
                      <th className="text-left p-2 font-medium">{t("NCC / Nội dung")}</th>
                      <th className="text-left p-2 font-medium w-[260px]">{t("Email NCC")}</th>
                      <th className="text-center p-2 font-medium w-[100px]">{t("Trạng thái")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sendTargets.map((s) => (
                      <tr key={s.rowId} className="border-t align-top">
                        <td className="p-2 text-center">
                          <Checkbox
                            checked={s.include}
                            disabled={!s.email || sending || s.status === "sent"}
                            onCheckedChange={(v) => {
                              setSendTargets((prev) => prev.map((x) =>
                                x.rowId === s.rowId ? { ...x, include: !!v } : x));
                            }}
                          />
                        </td>
                        <td className="p-2">
                          {s.row.ten_doan && (
                            <div className="text-[11px] font-semibold text-blue-700">
                              {s.row.ten_doan}
                            </div>
                          )}
                          <div className="font-medium">
                            {s.row.ten_nha_cung_cap || s.row.mo_ta || `ĐNTT #${s.rowId}`}
                          </div>
                          {s.row.mo_ta && s.row.ten_nha_cung_cap && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[400px]" title={s.row.mo_ta}>
                              {s.row.mo_ta}
                            </div>
                          )}
                        </td>
                        <td className="p-2">
                          {s.email ? (
                            <div className="space-y-0.5">
                              <input
                                type="text"
                                value={s.email}
                                disabled={sending || s.status === "sent"}
                                onChange={(e) => {
                                  setSendTargets((prev) => prev.map((x) =>
                                    x.rowId === s.rowId ? { ...x, email: e.target.value } : x));
                                }}
                                className="w-full h-7 text-xs px-2 border rounded bg-background disabled:opacity-60"
                              />
                              <div className="text-[10px] text-muted-foreground">
                                {s.target.source === "booking" ? t("từ booking đã gửi") :
                                  s.target.source === "ncc" ? t("từ danh mục NCC") :
                                  t("không tìm thấy")}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-amber-700 inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {t("chưa có email")}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {s.status === "idle" && <span className="text-muted-foreground text-[10px]">—</span>}
                          {s.status === "sending" && (
                            <span className="inline-flex items-center gap-1 text-blue-700 text-[11px]">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              {t("đang gửi")}
                            </span>
                          )}
                          {s.status === "sent" && (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px]">
                              <Check className="h-3 w-3" />
                              {t("đã gửi")}
                            </span>
                          )}
                          {s.status === "failed" && (
                            <span className="text-red-600 text-[10px]" title={s.error}>
                              {t("lỗi")}: {(s.error || "").slice(0, 30)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-1.5">
              {t("Subject + Body dùng template mặc định (giống nút 'Gửi UNC' từng row).")}{" "}
              {t("Cần sửa template riêng → đóng dialog rồi mở row đó.")}
            </div>
          </div>

          <DialogFooter className="gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={sending}>
              <X className="h-4 w-4 mr-1" /> {t("Đóng (bỏ qua gửi)")}
            </Button>
            <Button
              size="sm"
              onClick={handleSendAll}
              disabled={sending || resolvingEmails || selectedCount === 0}
            >
              {sending
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("Đang gửi...")}</>
                : <><Send className="h-4 w-4 mr-1" /> {t("Gửi")} {selectedCount} {t("email")}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-base">
            {t("Gắn UNC nhanh")} — {doanLabel}
            <span className="text-xs font-normal text-muted-foreground ml-2">{t("(Bước 1/2)")}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-y-auto min-h-0">
          <p className="text-xs text-muted-foreground">
            {rows.length} {t("ĐNTT đang thiếu UNC. Chọn nhiều ảnh UNC cùng lúc — hệ thống đọc ảnh (OCR) tự ghép theo mã đoàn + số tiền; dòng nào sai chỉ cần đổi lại bằng dropdown. Mỗi file gắn đúng 1 ĐNTT.")}
          </p>

          {/* Vùng chọn / kéo-thả file */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files); }}
            className="border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer hover:bg-muted/40 transition-colors"
          >
            <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm font-medium">{t("Bấm chọn / kéo-thả nhiều ảnh UNC vào đây")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {files.length > 0
                ? `${t("Đã chọn")} ${files.length} ${t("file — đã ghép")} ${matchedCount}/${rows.length}`
                : t("Ảnh chụp app ngân hàng (jpg/png) — không cần đổi tên file")}
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
              {t("Đang đọc ảnh")} {ocrProg.done}/{ocrProg.total}… {t("(có thể chỉnh tay trong lúc chờ)")}
            </div>
          )}

          {/* Chẩn đoán OCR theo từng file — list scroll trong panel để không
              đẩy bảng ĐNTT khỏi viewport khi upload nhiều file. */}
          {files.length > 0 && (
            <div className="border rounded-lg text-[11px] bg-muted/20">
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50 sticky top-0 bg-muted/20 backdrop-blur">
                <span className="font-medium text-muted-foreground">
                  {t("OCR đọc ảnh")} ({files.length} {t("file")})
                </span>
                {!ocrProg.running && (
                  <button
                    type="button"
                    onClick={rerunOcr}
                    className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                  >
                    <ScanText className="h-3 w-3" /> {t("Đọc lại OCR")}
                  </button>
                )}
              </div>
              <div className="max-h-[180px] overflow-y-auto px-2 py-1.5 space-y-0.5">
                {files.map((f, i) => {
                  const info = ocrInfo[i];
                  return (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <span className="truncate flex-1 min-w-0 text-muted-foreground" title={f.name}>{f.name}</span>
                      <span className="shrink-0">
                        {info === undefined
                          ? <span className="text-muted-foreground">{ocrProg.running ? t("đang đọc…") : "—"}</span>
                          : info.err
                            ? <span className="text-red-600">{t("OCR lỗi")}: {info.err.slice(0, 40)}</span>
                            : info.amount != null
                              ? <span className="text-emerald-700 tabular-nums">{t("đọc được")} {fmt(info.amount)} ₫</span>
                              : <span className="text-amber-600">{t("không đọc được số tiền")}</span>}
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
                    <th className="text-left p-2 font-medium">{t("Đoàn / Nội dung")}</th>
                    <th className="text-right p-2 font-medium w-[110px]">{t("Số tiền")}</th>
                    <th className="text-left p-2 font-medium">{t("File UNC")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const fi = assign[r.id];
                    const matched = fi !== undefined;
                    return (
                      <tr key={r.id} className="border-t align-top">
                        <td className="p-2 max-w-[360px]">
                          {r.ten_doan && (
                            <div className="text-[11px] font-semibold text-blue-700 break-words" title={r.ten_doan}>
                              {r.ten_doan}
                            </div>
                          )}
                          <div className="font-medium break-words" title={r.mo_ta || r.ten_nha_cung_cap || ""}>
                            {r.mo_ta || r.ten_nha_cung_cap || `ĐNTT #${r.id}`}
                          </div>
                          {r.ten_nha_cung_cap && r.mo_ta && (
                            <div className="text-muted-foreground break-words" title={r.ten_nha_cung_cap}>
                              {r.ten_nha_cung_cap}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums font-semibold">
                          {fmt(r.so_tien)}
                        </td>
                        <td className="p-2">
                          <div className="flex items-start gap-1.5">
                            {matched ? (
                              <FileCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-1.5" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-1.5" />
                            )}
                            {/* Thumbnail preview — hiện khi đã ghép & là ảnh */}
                            {fi !== undefined && previewUrls[fi] && (
                              <button
                                type="button"
                                onClick={() => setLightboxIdx(fi)}
                                className="shrink-0 relative group rounded border border-border overflow-hidden hover:border-blue-400 transition-colors"
                                title="Bấm để xem to"
                              >
                                <img
                                  src={previewUrls[fi]}
                                  alt={files[fi]?.name}
                                  className="h-12 w-12 object-cover"
                                  loading="lazy"
                                />
                                <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                                  <Eye className="h-3.5 w-3.5 text-white opacity-0 group-hover:opacity-100" />
                                </span>
                              </button>
                            )}
                            {fi !== undefined && !previewUrls[fi] && (
                              <div className="shrink-0 h-12 w-12 rounded border border-border flex items-center justify-center bg-muted/30">
                                <FileText className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0 space-y-1">
                              <Select
                                value={fi === undefined ? "_none" : String(fi)}
                                onValueChange={(v) =>
                                  setRowFile(r.id, v === "_none" ? undefined : Number(v))
                                }
                              >
                                <SelectTrigger className="h-7 text-xs w-full min-w-0">
                                  <span className="truncate" title={fi === undefined ? undefined : files[fi]?.name}>
                                    {fi === undefined ? t("— Chưa gắn —") : files[fi]?.name}
                                  </span>
                                </SelectTrigger>
                                <SelectContent className="max-w-[600px]">
                                  <SelectItem value="_none" className="text-xs">{t("— Chưa gắn —")}</SelectItem>
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
                                        {f.name}{usedElsewhere ? ` ${t("(đã dùng)")}` : ""}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              {badge(r.id)}
                              {/* Nguồn TT — auto từ OCR, sửa được. Có nguồn + OCR
                                  số tiền khớp → khi Lưu sẽ tự đánh dấu Đã TT. */}
                              {matched && (() => {
                                const oAmt = ocrInfo[fi!]?.amount ?? null;
                                const willPay = !!nguonMap[r.id] && oAmt != null && uncAmountMatch(oAmt, conLai(r));
                                return (
                                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                    <Select
                                      value={nguonMap[r.id] || "_none"}
                                      onValueChange={(v) => setRowNguon(r.id, v === "_none" ? "" : v)}
                                    >
                                      <SelectTrigger className="h-6 text-[11px] w-[160px]">
                                        <span className="truncate">{nguonMap[r.id] || t("Chọn nguồn")}</span>
                                      </SelectTrigger>
                                      <SelectContent className="max-w-[260px]">
                                        <SelectItem value="_none" className="text-xs">{t("— Chưa chọn nguồn —")}</SelectItem>
                                        {PAYMENT_SOURCE_LABELS.map((src) => (
                                          <SelectItem key={src} value={src} className="text-xs">{src}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {willPay ? (
                                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded whitespace-nowrap">
                                        {t("sẽ đánh dấu Đã TT")}
                                      </span>
                                    ) : nguonMap[r.id] ? (
                                      <span className="text-[10px] text-amber-600 whitespace-nowrap" title={t("OCR số tiền chưa khớp — chỉ gắn UNC, không tự đánh dấu TT")}>
                                        {t("chỉ gắn UNC")}
                                      </span>
                                    ) : null}
                                  </div>
                                );
                              })()}
                            </div>
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
              {leftoverFiles.length} {t("file chưa ghép vào ĐNTT nào")}:{" "}
              {leftoverFiles.map((f) => f.name).join(", ")}
            </div>
          )}
        </div>

        {/* Lightbox: zoom ảnh khi click thumbnail */}
        {lightboxIdx !== null && previewUrls[lightboxIdx] && (
          <div
            className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center cursor-zoom-out"
            onClick={() => setLightboxIdx(null)}
          >
            <button
              type="button"
              className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/40"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); }}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="absolute top-4 left-4 text-white text-xs px-3 py-1 rounded bg-black/40 max-w-[60%] truncate" title={files[lightboxIdx]?.name}>
              {files[lightboxIdx]?.name}
            </div>
            <img
              src={previewUrls[lightboxIdx]}
              alt={files[lightboxIdx]?.name}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        <DialogFooter className="gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={batchMut.isPending}>
            <X className="h-4 w-4 mr-1" /> {t("Đóng")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={batchMut.isPending || matchedCount === 0}
          >
            {batchMut.isPending
              ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("Đang lưu...")}</>
              : `${t("Lưu tất cả")} (${matchedCount})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
