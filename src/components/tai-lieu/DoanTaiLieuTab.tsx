import { useRef, useState } from "react";
import { Upload, FileText, ExternalLink, Trash2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import {
  useDoanTaiLieuList,
  useUploadDoanTaiLieu,
  useDeleteDoanTaiLieu,
  TAI_LIEU_LABEL,
  type DoanTaiLieuLoai,
  type DoanTaiLieuRow,
} from "@/hooks/use-doan-tai-lieu";
import { useAuth } from "@/hooks/use-auth";
import { t, useTranslate } from "@/lib/i18n";

const SECTIONS: { loai: DoanTaiLieuLoai; desc: string; accent: string }[] = [
  { loai: "bao_gia",         desc: "Báo giá tour gửi khách",           accent: "bg-blue-50 border-blue-200" },
  { loai: "hop_dong",        desc: "Hợp đồng đã ký giữa S8 và khách", accent: "bg-emerald-50 border-emerald-200" },
  { loai: "danh_sach_khach", desc: "Danh sách khách đoàn",             accent: "bg-amber-50 border-amber-200" },
];

interface Props {
  doanId: number;
}

export default function DoanTaiLieuTab({ doanId }: Props) {
  useTranslate();
  const { data: docs = [], isLoading } = useDoanTaiLieuList(doanId);
  const { user } = useAuth();

  const docByLoai: Partial<Record<DoanTaiLieuLoai, DoanTaiLieuRow>> = {};
  docs.forEach((d) => { docByLoai[d.loai] = d; });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">{t("Đang tải tài liệu...")}</p>;
  }

  return (
    <div className="space-y-3 max-w-3xl">
      {SECTIONS.map(({ loai, desc, accent }) => (
        <DocSection
          key={loai}
          doanId={doanId}
          loai={loai}
          existing={docByLoai[loai] ?? null}
          desc={desc}
          accent={accent}
          uploadedBy={user?.user_id ?? null}
        />
      ))}
    </div>
  );
}

function DocSection({
  doanId, loai, existing, desc, accent, uploadedBy,
}: {
  doanId: number;
  loai: DoanTaiLieuLoai;
  existing: DoanTaiLieuRow | null;
  desc: string;
  accent: string;
  uploadedBy: string | null;
}) {
  useTranslate();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDoanTaiLieu();
  const del = useDeleteDoanTaiLieu();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handlePick = () => inputRef.current?.click();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset để chọn lại cùng file vẫn fire
    if (!file) return;
    upload.mutate(
      { doanId, loai, file, uploadedBy },
      {
        onSuccess: () => toast.success(`${t("Đã upload")} ${t(TAI_LIEU_LABEL[loai])}`),
        onError: (err: unknown) => toast.error(t("Lỗi upload: ") + (errMsg(err) || "")),
      },
    );
  };

  const handleDelete = () => {
    if (!existing) return;
    del.mutate(
      { id: existing.id, doanId },
      {
        onSuccess: () => {
          toast.success(t("Đã xóa tài liệu"));
          setConfirmDelete(false);
        },
        onError: (err: unknown) => toast.error(t("Lỗi xóa: ") + (errMsg(err) || "")),
      },
    );
  };

  return (
    <div className={cn("rounded-lg border p-4 space-y-2", accent)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t(TAI_LIEU_LABEL[loai])}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t(desc)}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleFile}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={handlePick}
            disabled={upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Upload className="h-3 w-3" />
            )}
            {existing ? t("Thay file") : t("Upload")}
          </Button>
        </div>
      </div>

      {existing ? (
        <div className="flex items-center justify-between gap-2 bg-white/60 rounded px-3 py-2">
          <div className="min-w-0 flex-1">
            <a
              href={existing.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 truncate"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{existing.file_name || t("Xem file")}</span>
            </a>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t("Upload")} {format(new Date(existing.uploaded_at), "dd/MM/yyyy HH:mm", { locale: vi })}
            </p>
          </div>
          {confirmDelete ? (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="destructive"
                className="h-6 text-[11px] px-2"
                onClick={handleDelete}
                disabled={del.isPending}
              >
                {t("Xác nhận xóa")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px] px-2"
                onClick={() => setConfirmDelete(false)}
              >
                {t("Hủy")}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
              title={t("Xóa")}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic px-1">{t("Chưa có file.")}</p>
      )}
    </div>
  );
}
