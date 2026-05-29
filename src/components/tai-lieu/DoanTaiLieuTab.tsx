import { useRef, useState } from "react";
import { Upload, FileText, ExternalLink, Trash2, Loader2, Plus } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
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

// Hợp đồng + Danh sách khách: 1 file/đoàn (replace). Báo giá: nhiều file (xem MultiFileSection).
const SINGLE_SECTIONS: { loai: "hop_dong" | "danh_sach_khach"; desc: string; accent: string }[] = [
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
  const [addOpen, setAddOpen] = useState(false);

  const docByLoai: Partial<Record<DoanTaiLieuLoai, DoanTaiLieuRow>> = {};
  const baoGiaDocs: DoanTaiLieuRow[] = [];
  const customDocs: DoanTaiLieuRow[] = [];
  for (const d of docs) {
    if (d.loai === "khac") customDocs.push(d);
    else if (d.loai === "bao_gia") baoGiaDocs.push(d);
    else docByLoai[d.loai] = d;
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">{t("Đang tải tài liệu...")}</p>;
  }

  return (
    <div className="space-y-3 max-w-3xl">
      {/* Báo giá — nhiều file/đoàn */}
      <MultiFileSection
        doanId={doanId}
        loai="bao_gia"
        desc="Báo giá tour gửi khách"
        accent="bg-blue-50 border-blue-200"
        docs={baoGiaDocs}
        uploadedBy={user?.user_id ?? null}
      />

      {/* Hợp đồng + Danh sách khách — 1 file/đoàn */}
      {SINGLE_SECTIONS.map(({ loai, desc, accent }) => (
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

      {/* Custom docs ('khac') */}
      {customDocs.map((doc) => (
        <CustomDocRow key={doc.id} doc={doc} doanId={doanId} />
      ))}

      <div className="flex justify-center pt-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 border-dashed"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("Thêm tài liệu khác")}
        </Button>
      </div>

      <AddCustomDocDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        doanId={doanId}
        uploadedBy={user?.user_id ?? null}
      />
    </div>
  );
}

/** Một dòng file: link + ngày upload + nút xóa (có xác nhận). Dùng chung mọi section. */
function FileLine({ doc, doanId }: { doc: DoanTaiLieuRow; doanId: number }) {
  useTranslate();
  const del = useDeleteDoanTaiLieu();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = () => {
    del.mutate(
      { id: doc.id, doanId },
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
    <div className="flex items-center justify-between gap-2 bg-white/60 rounded px-3 py-2">
      <div className="min-w-0 flex-1">
        <a
          href={doc.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 truncate"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{doc.file_name || t("Xem file")}</span>
        </a>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {t("Upload")} {format(new Date(doc.uploaded_at), "dd/MM/yyyy HH:mm", { locale: vi })}
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
  );
}

/** Section nhiều file (Báo giá): Upload = thêm file mới, list từng file. */
function MultiFileSection({
  doanId, loai, desc, accent, docs, uploadedBy,
}: {
  doanId: number;
  loai: DoanTaiLieuLoai;
  desc: string;
  accent: string;
  docs: DoanTaiLieuRow[];
  uploadedBy: string | null;
}) {
  useTranslate();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDoanTaiLieu();
  const title = t(TAI_LIEU_LABEL[loai]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    upload.mutate(
      { doanId, loai, file, uploadedBy },
      {
        onSuccess: () => toast.success(`${t("Đã upload")} ${title}`),
        onError: (err: unknown) => toast.error(t("Lỗi upload: ") + (errMsg(err) || "")),
      },
    );
  };

  return (
    <div className={cn("rounded-lg border p-4 space-y-2", accent)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {title}
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
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {t("Upload")}
          </Button>
        </div>
      </div>

      {docs.length > 0 ? (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <FileLine key={d.id} doc={d} doanId={doanId} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic px-1">{t("Chưa có file.")}</p>
      )}
    </div>
  );
}

/** Section 1 file (Hợp đồng / Danh sách khách): Upload = thay file. */
function DocSection({
  doanId, loai, existing, desc, accent, uploadedBy,
}: {
  doanId: number;
  loai: "hop_dong" | "danh_sach_khach";
  existing: DoanTaiLieuRow | null;
  desc: string;
  accent: string;
  uploadedBy: string | null;
}) {
  useTranslate();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDoanTaiLieu();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    upload.mutate(
      { doanId, loai, file, uploadedBy },
      {
        onSuccess: () => toast.success(`${t("Đã upload")} ${t(TAI_LIEU_LABEL[loai])}`),
        onError: (err: unknown) => toast.error(t("Lỗi upload: ") + (errMsg(err) || "")),
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
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {existing ? t("Thay file") : t("Upload")}
          </Button>
        </div>
      </div>

      {existing ? (
        <FileLine doc={existing} doanId={doanId} />
      ) : (
        <p className="text-xs text-muted-foreground italic px-1">{t("Chưa có file.")}</p>
      )}
    </div>
  );
}

function CustomDocRow({ doc, doanId }: { doc: DoanTaiLieuRow; doanId: number }) {
  useTranslate();
  return (
    <div className="rounded-lg border p-4 space-y-2 bg-slate-50 border-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {doc.ten || t("Tài liệu khác")}
          </h3>
          {doc.mo_ta && (
            <p className="text-xs text-muted-foreground mt-0.5">{doc.mo_ta}</p>
          )}
        </div>
      </div>
      <FileLine doc={doc} doanId={doanId} />
    </div>
  );
}

function AddCustomDocDialog({
  open, onClose, doanId, uploadedBy,
}: {
  open: boolean;
  onClose: () => void;
  doanId: number;
  uploadedBy: string | null;
}) {
  useTranslate();
  const upload = useUploadDoanTaiLieu();
  const [ten, setTen] = useState("");
  const [moTa, setMoTa] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setTen("");
    setMoTa("");
    setFile(null);
  };

  const handleClose = () => {
    if (upload.isPending) return;
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (!ten.trim()) {
      toast.error(t("Vui lòng nhập tên tài liệu"));
      return;
    }
    if (!file) {
      toast.error(t("Vui lòng chọn file"));
      return;
    }
    upload.mutate(
      {
        doanId,
        loai: "khac",
        file,
        uploadedBy,
        ten: ten.trim(),
        moTa: moTa.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(t("Đã thêm tài liệu"));
          reset();
          onClose();
        },
        onError: (err: unknown) => toast.error(t("Lỗi upload: ") + (errMsg(err) || "")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Thêm tài liệu khác")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="ten-tl" className="text-xs">
              {t("Tên tài liệu")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ten-tl"
              value={ten}
              onChange={(e) => setTen(e.target.value)}
              placeholder={t("Vé máy bay, Visa, Bảo hiểm, ...")}
              className="h-9 text-sm"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mo-ta-tl" className="text-xs">{t("Mô tả")}</Label>
            <Textarea
              id="mo-ta-tl"
              value={moTa}
              onChange={(e) => setMoTa(e.target.value)}
              placeholder={t("Mô tả ngắn (tuỳ chọn)")}
              className="min-h-[60px] text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="file-tl" className="text-xs">
              {t("File")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="file-tl"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
              className="h-9 text-sm cursor-pointer"
            />
            {file && (
              <p className="text-[10px] text-muted-foreground truncate">
                {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={upload.isPending}>
            {t("Hủy")}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={upload.isPending}>
            {upload.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {t("Thêm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
