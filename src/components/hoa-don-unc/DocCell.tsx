import { useState, useRef } from "react";
import {
  Upload, Eye, Trash2, FileText, FileCheck, FileX,
  Loader2, ScanText, ClipboardPaste, Mail,
} from "lucide-react";
import { ocrInvoiceAmount, isAmountMatch } from "@/lib/ocr-invoice";
import { openStorageFile } from "@/lib/storage-url";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useUpdateDocStatus, useUploadDNTTDoc, useDeleteDNTTDoc,
  type HoaDonUNCRow, type TrangThaiDoc,
} from "@/hooks/use-hoa-don-unc";
import { toast } from "@/hooks/use-toast";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";

const docStatusConfig: Record<TrangThaiDoc, { textKey: string; icon: React.ElementType; cls: string }> = {
  chua_co: { textKey: "Chưa có", icon: FileX, cls: "bg-red-50 text-red-600 border border-red-200" },
  da_co: { textKey: "Đã có", icon: FileCheck, cls: "bg-green-50 text-green-700 border border-green-200" },
  khong_can: { textKey: "Không cần", icon: FileText, cls: "bg-gray-100 text-gray-500 border border-gray-200" },
};

export function DocCell({
  row,
  loaiDoc,
  onUncUploaded,
}: {
  row: HoaDonUNCRow;
  loaiDoc: "hoa_don" | "unc";
  /** Callback khi upload UNC OK → page mở email modal. State giữ ở page-level
   *  để không mất khi list refetch (invalidate) remount DocCell. */
  onUncUploaded?: (row: HoaDonUNCRow, publicUrl: string) => void;
}) {
  useTranslate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMut = useUploadDNTTDoc();
  const deleteMut = useDeleteDNTTDoc();
  const updateMut = useUpdateDocStatus();

  const status: TrangThaiDoc = loaiDoc === "hoa_don" ? row.trang_thai_hoa_don : row.trang_thai_unc;
  const url = loaiDoc === "hoa_don" ? row.hoa_don_url : row.unc_url;
  const statusField = loaiDoc === "hoa_don" ? "trang_thai_hoa_don" : "trang_thai_unc";

  const cfg = docStatusConfig[status];
  const Icon = cfg.icon;

  const [deleteOpen, setDeleteOpen] = useState(false);
  // OCR result chỉ áp dụng cho hóa đơn — gợi ý số tiền có lệch không.
  const [ocrState, setOcrState] = useState<
    | { status: "idle" }
    | { status: "running" }
    | { status: "done"; detected: number | null; matched: boolean }
    | { status: "error" }
  >({ status: "idle" });

  const runOcr = async (file: File) => {
    if (loaiDoc !== "hoa_don") return;
    if (file.type === "application/pdf") return; // Tesseract.js không parse PDF native
    setOcrState({ status: "running" });
    try {
      const result = await ocrInvoiceAmount(file);
      // Log để debug khi OCR fail — mở DevTools (F12) → Console.
      // eslint-disable-next-line no-console
      console.log("[OCR HÓA ĐƠN #" + row.id + "]", {
        detected: result.detected,
        candidates: result.candidates,
        expected: row.so_tien,
      });
      // rawText log riêng để hiện full không bị truncate. Copy bằng:
      // (right-click block → Copy string contents)
      // eslint-disable-next-line no-console
      console.log("[OCR RAWTEXT #" + row.id + "]\n" + result.rawText);
      const matched = isAmountMatch(result.detected, row.so_tien);
      setOcrState({ status: "done", detected: result.detected, matched });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[OCR ERROR]", err);
      setOcrState({ status: "error" });
    }
  };

  const doUpload = (file: File) => {
    uploadMut.mutate(
      { id: row.id, file, loaiDoc },
      {
        onSuccess: (publicUrl) => {
          toast({ title: `${t("Đã tải lên")} ${loaiDoc === "hoa_don" ? t("hóa đơn") : "UNC"}` });
          if (loaiDoc === "unc") {
            onUncUploaded?.(row, publicUrl);
          }
          // Chạy OCR sau khi upload xong (background, không block toast).
          runOcr(file);
        },
        onError: (err: unknown) => toast({ title: `${t("Lỗi")}: ${errMsg(err) || t("Không thể tải lên")}`, variant: "destructive" }),
      },
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    doUpload(file);
    e.target.value = "";
  };

  // Đọc ảnh từ clipboard (Ctrl+C ảnh / screenshot) → upload trực tiếp.
  // navigator.clipboard.read() cần HTTPS + permission (lần đầu trình duyệt hỏi).
  const handlePasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((ty) => ty.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          const ext = imgType.split("/")[1] || "png";
          const file = new File([blob], `paste-${Date.now()}.${ext}`, { type: imgType });
          doUpload(file);
          return;
        }
      }
      toast({ title: t("Clipboard không có ảnh — hãy chụp/copy ảnh trước"), variant: "destructive" });
    } catch {
      toast({
        title: t("Không đọc được clipboard. Cấp quyền clipboard cho trang rồi thử lại."),
        variant: "destructive",
      });
    }
  };

  const handleDeleteConfirm = () => {
    deleteMut.mutate(
      { id: row.id, loaiDoc },
      {
        onSuccess: () => toast({ title: t("Đã xóa file") }),
        onError: (err: unknown) => toast({ title: `${t("Lỗi")}: ${errMsg(err)}`, variant: "destructive" }),
      },
    );
    setDeleteOpen(false);
  };

  const handleStatusChange = (value: TrangThaiDoc) => {
    updateMut.mutate(
      { id: row.id, field: statusField, value },
      {
        onError: (err: unknown) => toast({ title: `${t("Lỗi")}: ${errMsg(err)}`, variant: "destructive" }),
      },
    );
  };

  const isPending = uploadMut.isPending || deleteMut.isPending || updateMut.isPending;

  return (
    <div className="flex flex-col gap-1.5 min-w-[140px]">
      {/* Status badge + dropdown */}
      <div className="flex items-center gap-1">
        <Select value={status} onValueChange={handleStatusChange} disabled={isPending}>
          <SelectTrigger className={cn("h-6 text-xs px-2 py-0 w-auto gap-1 border-0 shadow-none", cfg.cls)}>
            <Icon className="h-3 w-3 shrink-0" />
            <span>{t(cfg.textKey)}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chua_co">{t("Chưa có")}</SelectItem>
            <SelectItem value="da_co">{t("Đã có")}</SelectItem>
            <SelectItem value="khong_can">{t("Không cần")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {url ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                // Bucket chứng từ đã khoá → phải ký link tạm mới mở được.
                void openStorageFile(url).catch(() =>
                  toast({
                    title: t("Không mở được file — bạn không có quyền hoặc file đã bị gỡ."),
                    variant: "destructive",
                  }),
                );
              }}
            >
              <Eye className="h-3 w-3 mr-1" /> {t("Xem")}
            </Button>
            {loaiDoc === "unc" && (
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6 text-sky-600"
                title={t("Gửi mail UNC cho NCC")}
                onClick={() => onUncUploaded?.(row, url!)}
              >
                <Mail className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive"
              onClick={() => setDeleteOpen(true)}
              disabled={isPending}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        ) : status !== "khong_can" ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending}
            >
              <Upload className="h-3 w-3 mr-1" />
              {isPending ? t("Đang tải...") : t("Tải lên")}
            </Button>
            {loaiDoc === "unc" && (
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                title={t("Paste ảnh từ clipboard (Ctrl+C ảnh rồi bấm)")}
                onClick={handlePasteFromClipboard}
                disabled={isPending}
              >
                <ClipboardPaste className="h-3 w-3" />
              </Button>
            )}
          </>
        ) : null}
      </div>

      {/* OCR badge — chỉ cho hóa đơn, hint khớp số tiền */}
      {loaiDoc === "hoa_don" && ocrState.status !== "idle" && (
        <div className="text-[10px] leading-tight">
          {ocrState.status === "running" && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {t("Đang quét hóa đơn...")}
            </span>
          )}
          {ocrState.status === "error" && (
            <span className="inline-flex items-center gap-1 text-muted-foreground" title={t("Tesseract lỗi — kiểm tra thủ công")}>
              <ScanText className="h-3 w-3" /> {t("Không quét được")}
            </span>
          )}
          {ocrState.status === "done" && ocrState.detected == null && (
            <span className="inline-flex items-center gap-1 text-muted-foreground" title={t("OCR không nhận ra số tiền — kiểm tra thủ công")}>
              <ScanText className="h-3 w-3" /> {t("Không đoán được số tiền")}
            </span>
          )}
          {ocrState.status === "done" && ocrState.detected != null && ocrState.matched && (
            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium" title={`${t("Đoán")}: ${ocrState.detected.toLocaleString("vi-VN")} ₫`}>
              ✓ {t("Khớp số tiền")}
            </span>
          )}
          {ocrState.status === "done" && ocrState.detected != null && !ocrState.matched && (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium" title={`${t("Hóa đơn")}: ${ocrState.detected.toLocaleString("vi-VN")} ₫ vs ĐNTT: ${row.so_tien.toLocaleString("vi-VN")} ₫`}>
              ⚠ {t("Lệch")} {Math.abs(ocrState.detected - row.so_tien).toLocaleString("vi-VN")} ₫
            </span>
          )}
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Xóa file?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("File sẽ bị xóa và trạng thái sẽ trở về \"Chưa có\".")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Hủy")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>{t("Xóa")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
