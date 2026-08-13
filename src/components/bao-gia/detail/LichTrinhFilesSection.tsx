import { useRef } from "react";
import { Upload, FileText, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { openStorageFileOnClick } from "@/lib/storage-url";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { errMsg } from "@/lib/error";
import { unsupportedFileInfo } from "@/lib/itinerary-file";
import { useFileDrop } from "@/hooks/use-file-drop";
import {
  useUploadLichTrinhFile,
  useRemoveLichTrinhFile,
  type BaoGiaRow,
} from "@/hooks/use-bao-gia";

interface Props {
  draft: BaoGiaRow;
}

// File lịch trình đính kèm (mode 'gia_cuoi') — chương trình lấy của bên khác.
// Chỉ lưu để xem/tải/xuất kèm. Upload nhiều file; xóa gỡ khỏi danh sách.
export function LichTrinhFilesSection({ draft }: Props) {
  const { user } = useAuth();
  const upload = useUploadLichTrinhFile();
  const remove = useRemoveLichTrinhFile();
  const inputRef = useRef<HTMLInputElement>(null);
  const files = draft.lich_trinh_files ?? [];

  const handlePick = async (picked: File[]) => {
    if (!picked.length) return;
    // File vẫn được lưu (giữ bản gốc của đối tác để xem/gửi kèm), nhưng nói ngay
    // là AI sẽ không đọc được nó — kèm cách chữa, thay vì để phát hiện lúc bấm
    // "AI điền từ lịch trình" rồi thấy dòng file bị mờ.
    for (const f of picked) {
      const info = unsupportedFileInfo(f.name);
      if (info) toast.warning(`${f.name} — ${info.help}`, { duration: 10000 });
    }
    try {
      await upload.mutateAsync({ baoGiaId: draft.id, files: picked, current: files, uploadedBy: user?.user_id });
      toast.success(picked.length > 1 ? `Đã tải ${picked.length} file lịch trình` : "Đã tải file lịch trình");
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi tải file");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const { dragging, dropProps } = useFileDrop(handlePick, upload.isPending);

  const handleRemove = async (url: string) => {
    try {
      await remove.mutateAsync({ baoGiaId: draft.id, url, current: files });
      toast.success("Đã gỡ file");
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi gỡ file");
    }
  };

  return (
    <section
      {...dropProps}
      className={`bg-white border rounded-lg p-4 space-y-3 transition-colors ${
        dragging ? "border-blue-400 border-dashed bg-blue-50/60" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500">
          File lịch trình đính kèm
        </h2>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          Tải file
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.xls,.doc"
          className="hidden"
          onChange={(e) => handlePick(Array.from(e.target.files ?? []))}
        />
      </div>

      {files.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <FileText className="h-5 w-5 mx-auto text-slate-300 mb-1" />
          <p className="text-xs text-slate-400">
            Chưa có file. <span className="font-medium text-slate-500">Kéo thả file vào đây</span> hoặc bấm “Tải file” (PDF, Word, ảnh...).
          </p>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {files.map((f) => {
            const unsup = unsupportedFileInfo(f.ten);
            return (
              <div key={f.url} className="flex items-center gap-2 px-3 py-2 text-xs">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={openStorageFileOnClick(f.url, toast.error)}
                  className="flex-1 min-w-0 truncate font-medium text-slate-700 hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  {f.ten}
                  <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
                </a>
                {/* Lưu được nhưng AI không đọc được → nói rõ tại chỗ + cách chữa. */}
                {unsup && (
                  <span
                    className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                    title={`${unsup.help} (File vẫn được lưu để xem/tải.)`}
                  >
                    AI chưa đọc được · {unsup.badge}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(f.url)}
                  disabled={remove.isPending}
                  className="text-slate-400 hover:text-red-500 disabled:opacity-40"
                  title="Gỡ file"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
