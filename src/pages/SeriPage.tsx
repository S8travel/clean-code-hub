import { useState, useMemo, useEffect } from "react";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useSeriList, useCreateSeri, useUpdateSeri, useDeleteSeri,
  useSeriNgayList, useSeriNgayItems, useSaveSeri, seriToDayLocals,
  type SeriTour,
} from "@/hooks/use-seri";
import { useCanhDiem, useNhaHang, useKhachSan } from "@/hooks/use-dieu-tour";
import type { DayLocal } from "@/hooks/use-dieu-tour";
import { getWeekday } from "@/hooks/use-dieu-tour";
import DayScheduleTable from "@/components/dieu-tour/DayScheduleTable";

// ── Seri detail: table editor ──
function SeriDetail({ seri }: { seri: SeriTour }) {
  const { data: ngayRows = [], isLoading: loadingNgay } = useSeriNgayList(seri.id);
  const { data: itemRows = [], isLoading: loadingItems } = useSeriNgayItems(seri.id);
  const { data: canhDiemList = [] } = useCanhDiem();
  const { data: nhaHangList = [] } = useNhaHang();
  const { data: khachSanList = [] } = useKhachSan();
  const saveSeri = useSaveSeri();

  const [days, setDays] = useState<DayLocal[]>([]);
  const [dirty, setDirty] = useState(false);

  // Load from DB into local state when data arrives
  useEffect(() => {
    if (!loadingNgay && !loadingItems) {
      setDays(seriToDayLocals(ngayRows, itemRows));
      setDirty(false);
    }
  }, [ngayRows, itemRows, loadingNgay, loadingItems]);

  const handleChange = (newDays: DayLocal[]) => {
    setDays(newDays);
    setDirty(true);
  };

  const handleSave = () => {
    saveSeri.mutate(
      { seriId: seri.id, days },
      {
        onSuccess: () => {
          toast({ title: "Đã lưu lịch trình" });
          setDirty(false);
        },
        onError: (err: any) =>
          toast({ title: "Lỗi: " + (err?.message || "Không thể lưu"), variant: "destructive" }),
      }
    );
  };

  const isLoading = loadingNgay || loadingItems;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div>
          <h2 className="text-base font-semibold">{seri.ten_seri}</h2>
          {seri.mo_ta && <p className="text-xs text-muted-foreground mt-0.5">{seri.mo_ta}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{days.length} ngày</Badge>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleSave}
            disabled={!dirty || saveSeri.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveSeri.isPending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : (
          <DayScheduleTable
            days={days}
            setDays={handleChange}
            canhDiemList={canhDiemList}
            nhaHangList={nhaHangList}
            khachSanList={khachSanList}
            getDayLabel={(day) => `Ngày ${day.ngay_so}`}
          />
        )}
      </div>
    </div>
  );
}

// ── Main page ──
export default function SeriPage() {
  const { data: seriList = [], isLoading } = useSeriList();
  const createSeri = useCreateSeri();
  const updateSeri = useUpdateSeri();
  const deleteSeri = useDeleteSeri();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SeriTour | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SeriTour | null>(null);
  const [formName, setFormName] = useState("");
  const [formMoTa, setFormMoTa] = useState("");

  const selectedSeri = useMemo(
    () => seriList.find((s) => s.id === selectedId) ?? null,
    [seriList, selectedId]
  );

  const openCreate = () => {
    setEditTarget(null);
    setFormName("");
    setFormMoTa("");
    setModalOpen(true);
  };

  const openEdit = (s: SeriTour, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(s);
    setFormName(s.ten_seri);
    setFormMoTa(s.mo_ta ?? "");
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!formName.trim()) return;
    if (editTarget) {
      updateSeri.mutate(
        { id: editTarget.id, ten_seri: formName.trim(), mo_ta: formMoTa.trim() || undefined },
        { onSuccess: () => setModalOpen(false) }
      );
    } else {
      createSeri.mutate(
        { ten_seri: formName.trim(), mo_ta: formMoTa.trim() || undefined },
        {
          onSuccess: (data) => {
            setSelectedId(data.id);
            setModalOpen(false);
          },
        }
      );
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: seri list */}
      <div className="w-64 shrink-0 border-r flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h1 className="text-sm font-semibold">Mẫu seri</h1>
          <Button size="sm" className="h-7 text-xs px-2.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Thêm
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {isLoading ? (
            <p className="text-xs text-muted-foreground px-2 py-4">Đang tải...</p>
          ) : seriList.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-8 text-center">
              Chưa có mẫu seri nào
            </p>
          ) : (
            seriList.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer group transition-colors",
                  selectedId === s.id
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted/60"
                )}
                onClick={() => setSelectedId(s.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.ten_seri}</p>
                  {s.mo_ta && (
                    <p className="text-xs text-muted-foreground truncate">{s.mo_ta}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => openEdit(s, e)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: schedule table */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedSeri ? (
          <SeriDetail key={selectedSeri.id} seri={selectedSeri} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Chọn một mẫu seri để chỉnh sửa lịch trình
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Sửa mẫu seri" : "Tạo mẫu seri mới"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-sm">Tên seri *</Label>
              <Input
                className="mt-1"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="VD: Đài Loan 5N4Đ"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            <div>
              <Label className="text-sm">Mô tả</Label>
              <Textarea
                className="mt-1 resize-none"
                rows={2}
                value={formMoTa}
                onChange={(e) => setFormMoTa(e.target.value)}
                placeholder="Ghi chú ngắn về chương trình..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button
              onClick={handleSave}
              disabled={!formName.trim() || createSeri.isPending || updateSeri.isPending}
            >
              {editTarget ? "Lưu" : "Tạo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa mẫu seri "{deleteTarget?.ten_seri}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Toàn bộ lịch trình trong mẫu này sẽ bị xóa. Các đoàn đã áp dụng không bị ảnh hưởng.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (!deleteTarget) return;
                deleteSeri.mutate(deleteTarget.id, {
                  onSuccess: () => {
                    if (selectedId === deleteTarget.id) setSelectedId(null);
                    setDeleteTarget(null);
                  },
                });
              }}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
