import { useState } from "react";
import { Plus, Save, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useVanPhongList, useCreateVanPhong, useUpdateVanPhong, useDeleteVanPhong,
  type VanPhongRow,
} from "@/hooks/use-van-phong";
import { toast } from "sonner";
import { t, useTranslate } from "@/lib/i18n";

const emptyVpForm = (): Omit<VanPhongRow, "id"> => ({ ten: "", dia_chi: null, ghi_chu: null, active: true });

export function VanPhongTab() {
  useTranslate();
  const { data: list = [], isLoading } = useVanPhongList();
  const createMut = useCreateVanPhong();
  const updateMut = useUpdateVanPhong();
  const deleteMut = useDeleteVanPhong();

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<Omit<VanPhongRow, "id">>(emptyVpForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Omit<VanPhongRow, "id">>(emptyVpForm());
  const [deleteTarget, setDeleteTarget] = useState<VanPhongRow | null>(null);

  const handleCreate = async () => {
    if (!newForm.ten.trim()) return;
    try {
      await createMut.mutateAsync({ ...newForm, ten: newForm.ten.trim() });
      setNewForm(emptyVpForm());
      setShowNew(false);
      toast.success(t("Đã thêm văn phòng"));
    } catch {
      toast.error(t("Lỗi khi thêm văn phòng"));
    }
  };

  const handleStartEdit = (vp: VanPhongRow) => {
    setEditId(vp.id);
    setEditForm({ ten: vp.ten, dia_chi: vp.dia_chi, ghi_chu: vp.ghi_chu, active: vp.active });
  };

  const handleSaveEdit = async () => {
    if (!editId || !editForm.ten.trim()) return;
    try {
      await updateMut.mutateAsync({ id: editId, ...editForm, ten: editForm.ten.trim() });
      setEditId(null);
      toast.success(t("Đã lưu"));
    } catch {
      toast.error(t("Lỗi khi lưu"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      toast.success(t("Đã xóa"));
    } catch {
      toast.error(t("Lỗi khi xóa"));
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{t("Văn phòng đại diện")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("Gán văn phòng cho người dùng để lọc dữ liệu đoàn tour theo văn phòng.")}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setShowNew(true); setEditId(null); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {t("Thêm")}
        </Button>
      </div>

      {showNew && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <p className="text-xs font-medium">{t("Văn phòng mới")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("Tên")} <span className="text-destructive">*</span></Label>
              <Input className="h-8 text-sm" placeholder={t("VD: Văn phòng HCM")} autoFocus
                value={newForm.ten} onChange={(e) => setNewForm((p) => ({ ...p, ten: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("Địa chỉ")}</Label>
              <Input className="h-8 text-sm" placeholder={t("Địa chỉ...")}
                value={newForm.dia_chi ?? ""} onChange={(e) => setNewForm((p) => ({ ...p, dia_chi: e.target.value || null }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">{t("Ghi chú")}</Label>
              <Input className="h-8 text-sm" placeholder={t("Ghi chú...")}
                value={newForm.ghi_chu ?? ""} onChange={(e) => setNewForm((p) => ({ ...p, ghi_chu: e.target.value || null }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate}
              disabled={!newForm.ten.trim() || createMut.isPending}>
              {createMut.isPending ? t("Đang lưu...") : t("Tạo")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => { setShowNew(false); setNewForm(emptyVpForm()); }}>
              {t("Hủy")}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Đang tải...")}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Chưa có văn phòng nào.")}</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="text-xs bg-muted/40">
                <TableHead className="py-2">{t("Tên")}</TableHead>
                <TableHead className="py-2">{t("Địa chỉ")}</TableHead>
                <TableHead className="py-2">{t("Ghi chú")}</TableHead>
                <TableHead className="py-2 w-20 text-center">{t("Active")}</TableHead>
                <TableHead className="py-2 w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((vp) =>
                editId === vp.id ? (
                  <TableRow key={vp.id} className="bg-muted/20">
                    <TableCell className="py-1.5">
                      <Input className="h-7 text-xs" value={editForm.ten}
                        onChange={(e) => setEditForm((p) => ({ ...p, ten: e.target.value }))} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input className="h-7 text-xs" value={editForm.dia_chi ?? ""}
                        onChange={(e) => setEditForm((p) => ({ ...p, dia_chi: e.target.value || null }))} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input className="h-7 text-xs" value={editForm.ghi_chu ?? ""}
                        onChange={(e) => setEditForm((p) => ({ ...p, ghi_chu: e.target.value || null }))} />
                    </TableCell>
                    <TableCell className="py-1.5 text-center">
                      <Switch checked={editForm.active} onCheckedChange={(v) => setEditForm((p) => ({ ...p, active: v }))} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit}
                          disabled={!editForm.ten.trim() || updateMut.isPending}>
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>
                          {t("Hủy")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={vp.id} className="text-sm">
                    <TableCell className="py-2 font-medium">{vp.ten}</TableCell>
                    <TableCell className="py-2 text-muted-foreground text-xs">{vp.dia_chi ?? "—"}</TableCell>
                    <TableCell className="py-2 text-muted-foreground text-xs">{vp.ghi_chu ?? "—"}</TableCell>
                    <TableCell className="py-2 text-center">
                      <Badge variant={vp.active ? "default" : "secondary"} className="text-[10px] h-4 px-1">
                        {vp.active ? t("Có") : t("Tắt")}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => handleStartEdit(vp)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(vp)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Xóa văn phòng?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Xóa")} <strong>{deleteTarget?.ten}</strong>. {t("Người dùng thuộc văn phòng này sẽ không còn được gán văn phòng.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Hủy")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("Xóa")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
