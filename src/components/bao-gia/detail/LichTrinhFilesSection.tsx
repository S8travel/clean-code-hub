import { useRef } from "react";
import { Upload, FileText, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { openStorageFileOnClick } from "@/lib/storage-url";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { errMsg } from "@/lib/error";
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

  const handlePick = async (file: File | null) => {
    if (!file) return;
    try {
      await upload.mutateAsync({ baoGiaId: draft.id, file, current: files, uploadedBy: user?.user_id });
      toast.success("Đã tải file lịch trình");
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi tải file");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (url: string) => {
    try {
      await remove.mutateAsync({ baoGiaId: draft.id, url, current: files });
      toast.success("Đã gỡ file");
    } catch (e: unknown) {
      toast.error(errMsg(e) || "Lỗi gỡ file");
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
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
          className="hidden"
          onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
        />
      </div>

      {files.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center">
          <FileText className="h-5 w-5 mx-auto text-slate-300 mb-1" />
          <p className="text-xs text-slate-400">Chưa có file. Tải lên chương trình tour (PDF, Word, ảnh...).</p>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {files.map((f) => (
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
          ))}
        </div>
      )}
    </section>
  );
}
