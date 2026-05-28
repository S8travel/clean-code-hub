import { useState } from "react";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { errMsg } from "@/lib/error";
import {
  useDoanNhomList, useDeleteDoanNhom,
  type DoanNhomRow,
} from "@/hooks/use-doan-nhom";
import SplitNhomModal from "./SplitNhomModal";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  doanId: number;
  activeNhomId: number | null;
  onActiveNhomChange: (id: number) => void;
  /** Tổng số khách đoàn (target cho modal chia số) */
  doanTotal: number;
  doanSoKhachLon: number;
  doanSoKhachEm1: number;
  doanSoKhachEm2: number;
  doanSoKhachTl: number;
}

export default function DoanNhomTabs({
  doanId, activeNhomId, onActiveNhomChange,
  doanTotal, doanSoKhachLon, doanSoKhachEm1, doanSoKhachEm2, doanSoKhachTl,
}: Props) {
  useTranslate();
  const { data: nhomList = [] } = useDoanNhomList(doanId);
  const [modalMode, setModalMode] = useState<"split" | "add" | "redistribute" | null>(null);
  const [deleting, setDeleting] = useState<DoanNhomRow | null>(null);

  // Auto-set active nhóm khi list load lần đầu
  if (nhomList.length > 0 && (activeNhomId == null || !nhomList.find((n) => n.id === activeNhomId))) {
    onActiveNhomChange(nhomList[0].id);
  }

  const openModal = (mode: "split" | "add" | "redistribute") => setModalMode(mode);

  // Ẩn tabs nếu chỉ có 1 nhóm (UX hệt đoàn cũ)
  if (nhomList.length <= 1) {
    return (
      <>
        <div className="flex items-center justify-end print-hide">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-dashed"
            onClick={() => openModal("split")}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("Tách thành nhiều nhóm")}
          </Button>
        </div>
        {modalMode && (
          <SplitNhomModal
            doanId={doanId}
            mode={modalMode}
            doanTotal={doanTotal}
            doanSoKhachLon={doanSoKhachLon}
            doanSoKhachEm1={doanSoKhachEm1}
            doanSoKhachEm2={doanSoKhachEm2}
            doanSoKhachTl={doanSoKhachTl}
            onClose={() => setModalMode(null)}
            onSaved={(createdIds) => {
              if (createdIds.length > 0) onActiveNhomChange(createdIds[0]);
            }}
          />
        )}
      </>
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
              {isActive && nhomList.length > 1 && (
                <div className="flex items-center gap-0.5 ml-1.5">
                  <span
                    role="button"
                    tabIndex={0}
                    className="h-4 w-4 rounded hover:bg-destructive/10 grid place-items-center cursor-pointer text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleting(nhom); }}
                    title={t("Xóa nhóm")}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </span>
                </div>
              )}
            </button>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 ml-2 text-muted-foreground hover:text-primary"
          onClick={() => openModal("add")}
        >
          <Plus className="h-3 w-3" />
          {t("Thêm nhóm")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
          onClick={() => openModal("redistribute")}
          title={t("Chia lại số khách giữa các nhóm")}
        >
          <Pencil className="h-3 w-3" />
          {t("Chia lại")}
        </Button>
      </div>

      {modalMode && (
        <SplitNhomModal
          doanId={doanId}
          mode={modalMode}
          doanTotal={doanTotal}
          doanSoKhachLon={doanSoKhachLon}
          doanSoKhachEm1={doanSoKhachEm1}
          doanSoKhachEm2={doanSoKhachEm2}
          doanSoKhachTl={doanSoKhachTl}
          onClose={() => setModalMode(null)}
          onSaved={(createdIds) => {
            if (createdIds.length > 0) onActiveNhomChange(createdIds[0]);
          }}
        />
      )}

      {deleting && (
        <DeleteNhomConfirm
          nhom={deleting}
          doanId={doanId}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            const remaining = nhomList.find((n) => n.id !== deleting.id);
            if (remaining) onActiveNhomChange(remaining.id);
          }}
        />
      )}
    </>
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
