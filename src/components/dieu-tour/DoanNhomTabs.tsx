import { useState } from "react";
import { Plus, Pencil, Trash2, Users, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import {
  useDoanNhomList, useCreateDoanNhom, useUpdateDoanNhom, useDeleteDoanNhom,
  type DoanNhomRow,
} from "@/hooks/use-doan-nhom";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  doanId: number;
  activeNhomId: number | null;
  onActiveNhomChange: (id: number) => void;
}

export default function DoanNhomTabs({ doanId, activeNhomId, onActiveNhomChange }: Props) {
  useTranslate();
  const { data: nhomList = [] } = useDoanNhomList(doanId);
  const createMut = useCreateDoanNhom();
  const [editing, setEditing] = useState<DoanNhomRow | null>(null);
  const [deleting, setDeleting] = useState<DoanNhomRow | null>(null);

  // Auto-set active nhóm khi list load lần đầu
  if (nhomList.length > 0 && (activeNhomId == null || !nhomList.find((n) => n.id === activeNhomId))) {
    onActiveNhomChange(nhomList[0].id);
  }

  // Ẩn tabs nếu chỉ có 1 nhóm (UX hệt đoàn cũ)
  if (nhomList.length <= 1) {
    return (
      <div className="flex items-center justify-end print-hide">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5 border-dashed"
          onClick={() => createMut.mutate(
            { doanId },
            {
              onSuccess: (data) => {
                onActiveNhomChange(data.id);
                toast.success(t("Đã thêm nhóm mới"));
              },
              onError: (e) => toast.error(t("Lỗi thêm nhóm: ") + (errMsg(e) || "")),
            },
          )}
          disabled={createMut.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("Tách thành nhiều nhóm")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1 border-b border-border print-hide">
        {nhomList.map((nhom) => {
          const isActive = nhom.id === activeNhomId;
          const soKhachTong = (nhom.so_khach_lon ?? 0) + (nhom.so_khach_em1 ?? 0)
            + (nhom.so_khach_em2 ?? 0) + (nhom.so_khach_tl ?? 0);
          return (
            <button
              key={nhom.id}
              onClick={() => onActiveNhomChange(nhom.id)}
              className={cn(
                "group flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="h-3 w-3" />
              <span>{nhom.ten_nhom}</span>
              {soKhachTong > 0 && (
                <span className="text-[10px] text-muted-foreground">({soKhachTong})</span>
              )}
              {isActive && (
                <div className="flex items-center gap-0.5 ml-1.5">
                  <span
                    role="button"
                    tabIndex={0}
                    className="h-4 w-4 rounded hover:bg-muted grid place-items-center cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setEditing(nhom); }}
                    title={t("Sửa nhóm")}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </span>
                  {nhomList.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="h-4 w-4 rounded hover:bg-destructive/10 grid place-items-center cursor-pointer text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleting(nhom); }}
                      title={t("Xóa nhóm")}
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 ml-2 text-muted-foreground hover:text-primary"
          onClick={() => createMut.mutate(
            { doanId },
            {
              onSuccess: (data) => {
                onActiveNhomChange(data.id);
                toast.success(t("Đã thêm nhóm mới"));
              },
              onError: (e) => toast.error(t("Lỗi thêm nhóm: ") + (errMsg(e) || "")),
            },
          )}
          disabled={createMut.isPending}
        >
          <Plus className="h-3 w-3" />
          {t("Thêm nhóm")}
        </Button>
      </div>

      {editing && (
        <EditNhomModal
          nhom={editing}
          doanId={doanId}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteNhomConfirm
          nhom={deleting}
          doanId={doanId}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            // Switch về nhóm đầu tiên còn lại
            const remaining = nhomList.find((n) => n.id !== deleting.id);
            if (remaining) onActiveNhomChange(remaining.id);
          }}
        />
      )}
    </>
  );
}

function EditNhomModal({
  nhom, doanId, onClose,
}: {
  nhom: DoanNhomRow;
  doanId: number;
  onClose: () => void;
}) {
  useTranslate();
  const updateMut = useUpdateDoanNhom();
  const [tenNhom, setTenNhom] = useState(nhom.ten_nhom);
  const [soKhachLon, setSoKhachLon] = useState(String(nhom.so_khach_lon ?? ""));
  const [soKhachEm1, setSoKhachEm1] = useState(String(nhom.so_khach_em1 ?? ""));
  const [soKhachEm2, setSoKhachEm2] = useState(String(nhom.so_khach_em2 ?? ""));
  const [soKhachTl, setSoKhachTl] = useState(String(nhom.so_khach_tl ?? ""));
  const [ghiChu, setGhiChu] = useState(nhom.ghi_chu ?? "");

  const handleSubmit = () => {
    if (!tenNhom.trim()) {
      toast.error(t("Tên nhóm không được trống"));
      return;
    }
    const numOrNull = (s: string): number | null => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : null;
    };
    updateMut.mutate(
      {
        id: nhom.id,
        doanId,
        updates: {
          ten_nhom: tenNhom.trim(),
          so_khach_lon: numOrNull(soKhachLon),
          so_khach_em1: numOrNull(soKhachEm1),
          so_khach_em2: numOrNull(soKhachEm2),
          so_khach_tl: numOrNull(soKhachTl),
          ghi_chu: ghiChu.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success(t("Đã lưu nhóm"));
          onClose();
        },
        onError: (e) => toast.error(t("Lỗi lưu nhóm: ") + (errMsg(e) || "")),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Sửa nhóm")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs">{t("Tên nhóm")}</label>
            <Input
              value={tenNhom}
              onChange={(e) => setTenNhom(e.target.value)}
              placeholder={t("Vd: Tham quan 75 khách")}
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t("Khách lớn")}</label>
              <Input type="number" value={soKhachLon} onChange={(e) => setSoKhachLon(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t("Em 1")}</label>
              <Input type="number" value={soKhachEm1} onChange={(e) => setSoKhachEm1(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t("Em 2")}</label>
              <Input type="number" value={soKhachEm2} onChange={(e) => setSoKhachEm2(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t("T/L")}</label>
              <Input type="number" value={soKhachTl} onChange={(e) => setSoKhachTl(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs">{t("Ghi chú")}</label>
            <Input
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder={t("Vd: Có 1 HDV tiếng Trung riêng")}
              className="h-8 text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={updateMut.isPending}>
            <X className="h-3.5 w-3.5 mr-1" /> {t("Hủy")}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={updateMut.isPending}>
            <Check className="h-3.5 w-3.5 mr-1" /> {t("Lưu")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteNhomConfirm({
  nhom, doanId, onClose, onDeleted,
}: {
  nhom: DoanNhomRow;
  doanId: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  useTranslate();
  const delMut = useDeleteDoanNhom();
  const handleDelete = () => {
    delMut.mutate(
      { id: nhom.id, doanId },
      {
        onSuccess: () => {
          toast.success(t("Đã xóa nhóm"));
          onDeleted();
          onClose();
        },
        onError: (e) => toast.error(t("Lỗi xóa nhóm: ") + (errMsg(e) || "")),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Xóa nhóm")} "{nhom.ten_nhom}"?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("Toàn bộ lịch trình (ngày + cảnh điểm) của nhóm này sẽ bị xóa. Booking + chi phí liên quan có thể bị ảnh hưởng. Không thể khôi phục.")}
        </p>
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={delMut.isPending}>
            {t("Hủy")}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={delMut.isPending}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("Xóa nhóm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
