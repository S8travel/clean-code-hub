import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/DeleteDialog";
import {
  useLoaiVisaList,
  useCreateLoaiVisa,
  useUpdateLoaiVisa,
  useDeleteLoaiVisa,
  type LoaiVisa,
} from "@/hooks/use-visa";

interface Props {
  donViVisaId: number;
}

function LoaiVisaRow({ item, donViVisaId }: { item: LoaiVisa; donViVisaId: number }) {
  const updateMut = useUpdateLoaiVisa();
  const deleteMut = useDeleteLoaiVisa();
  const [editing, setEditing] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [form, setForm] = useState({
    quoc_gia: item.quoc_gia,
    loai: item.loai ?? "",
    thoi_han: item.thoi_han ?? "",
    gia: item.gia?.toString() ?? "",
    don_vi: item.don_vi ?? "người",
    ghi_chu: item.ghi_chu ?? "",
  });

  const handleSave = async () => {
    if (!form.quoc_gia.trim()) { toast.warning("Quốc gia không được để trống"); return; }
    try {
      await updateMut.mutateAsync({
        id: item.id,
        don_vi_visa_id: donViVisaId,
        quoc_gia: form.quoc_gia.trim(),
        loai: form.loai || null,
        thoi_han: form.thoi_han || null,
        gia: form.gia ? Number(form.gia) : null,
        don_vi: form.don_vi || null,
        ghi_chu: form.ghi_chu || null,
      });
      setEditing(false);
      toast.success("Đã lưu");
    } catch {
      toast.error("Lỗi khi lưu");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync({ id: item.id, don_vi_visa_id: donViVisaId });
      toast.success("Đã xóa");
    } catch {
      toast.error("Lỗi khi xóa");
    }
  };

  if (editing) {
    return (
      <div className="border rounded-md p-3 space-y-2 bg-muted/30">
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Label className="text-xs">Quốc gia *</Label>
            <Input value={form.quoc_gia} onChange={(e) => setForm((f) => ({ ...f, quoc_gia: e.target.value }))} className="h-7 text-xs" autoFocus />
          </div>
          <div>
            <Label className="text-xs">Loại visa</Label>
            <Input value={form.loai} onChange={(e) => setForm((f) => ({ ...f, loai: e.target.value }))} className="h-7 text-xs" placeholder="Du lịch / Công tác..." />
          </div>
          <div>
            <Label className="text-xs">Thời hạn</Label>
            <Input value={form.thoi_han} onChange={(e) => setForm((f) => ({ ...f, thoi_han: e.target.value }))} className="h-7 text-xs" placeholder="30 ngày / 1 năm..." />
          </div>
          <div>
            <Label className="text-xs">Giá</Label>
            <Input type="number" value={form.gia} onChange={(e) => setForm((f) => ({ ...f, gia: e.target.value }))} className="h-7 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Đơn vị</Label>
            <Input value={form.don_vi} onChange={(e) => setForm((f) => ({ ...f, don_vi: e.target.value }))} className="h-7 text-xs" placeholder="người / bộ..." />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Ghi chú</Label>
            <Input value={form.ghi_chu} onChange={(e) => setForm((f) => ({ ...f, ghi_chu: e.target.value }))} className="h-7 text-xs" />
          </div>
        </div>
        <div className="flex gap-1 justify-end">
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditing(false)}>
            <X className="h-3 w-3 mr-1" /> Hủy
          </Button>
          <Button size="sm" className="h-6 text-xs" onClick={handleSave} disabled={updateMut.isPending}>
            <Check className="h-3 w-3 mr-1" /> Lưu
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-muted/30 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{item.quoc_gia}</span>
          {item.loai && <span className="text-xs text-muted-foreground">· {item.loai}</span>}
          {item.thoi_han && <span className="text-xs text-muted-foreground">· {item.thoi_han}</span>}
        </div>
        {item.gia && (
          <div className="text-xs text-muted-foreground">
            {item.gia.toLocaleString("vi-VN")} /{item.don_vi || "người"}
            {item.ghi_chu && <span className="ml-2 italic">— {item.ghi_chu}</span>}
          </div>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDelOpen(true)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <DeleteDialog
        open={delOpen}
        name={item.quoc_gia}
        onConfirm={handleDelete}
        onCancel={() => setDelOpen(false)}
        isDeleting={deleteMut.isPending}
      />
    </div>
  );
}

export default function LoaiVisaSection({ donViVisaId }: Props) {
  const { data: list, isLoading } = useLoaiVisaList(donViVisaId);
  const createMut = useCreateLoaiVisa();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    quoc_gia: "",
    loai: "",
    thoi_han: "",
    gia: "",
    don_vi: "người",
    ghi_chu: "",
  });

  const handleAdd = async () => {
    if (!form.quoc_gia.trim()) { toast.warning("Quốc gia không được để trống"); return; }
    try {
      await createMut.mutateAsync({
        don_vi_visa_id: donViVisaId,
        quoc_gia: form.quoc_gia.trim(),
        loai: form.loai || null,
        thoi_han: form.thoi_han || null,
        gia: form.gia ? Number(form.gia) : null,
        don_vi: form.don_vi || null,
        ghi_chu: form.ghi_chu || null,
      });
      setForm({ quoc_gia: "", loai: "", thoi_han: "", gia: "", don_vi: "người", ghi_chu: "" });
      setAdding(false);
      toast.success("Đã thêm loại visa");
    } catch {
      toast.error("Lỗi khi thêm loại visa");
    }
  };

  return (
    <div className="space-y-3">
      <Separator />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Danh sách loại visa</h3>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(!adding)}>
          <Plus className="h-3 w-3 mr-1" /> Thêm visa
        </Button>
      </div>

      {adding && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Quốc gia *</Label>
              <Input value={form.quoc_gia} onChange={(e) => setForm((f) => ({ ...f, quoc_gia: e.target.value }))} className="h-7 text-xs" placeholder="VD: Nhật Bản" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Loại visa</Label>
              <Input value={form.loai} onChange={(e) => setForm((f) => ({ ...f, loai: e.target.value }))} className="h-7 text-xs" placeholder="Du lịch / Công tác..." />
            </div>
            <div>
              <Label className="text-xs">Thời hạn</Label>
              <Input value={form.thoi_han} onChange={(e) => setForm((f) => ({ ...f, thoi_han: e.target.value }))} className="h-7 text-xs" placeholder="30 ngày / 1 năm..." />
            </div>
            <div>
              <Label className="text-xs">Giá</Label>
              <Input type="number" value={form.gia} onChange={(e) => setForm((f) => ({ ...f, gia: e.target.value }))} className="h-7 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Đơn vị</Label>
              <Input value={form.don_vi} onChange={(e) => setForm((f) => ({ ...f, don_vi: e.target.value }))} className="h-7 text-xs" placeholder="người / bộ..." />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Ghi chú</Label>
              <Input value={form.ghi_chu} onChange={(e) => setForm((f) => ({ ...f, ghi_chu: e.target.value }))} className="h-7 text-xs" />
            </div>
          </div>
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAdding(false)}>
              <X className="h-3 w-3 mr-1" /> Hủy
            </Button>
            <Button size="sm" className="h-6 text-xs" onClick={handleAdd} disabled={createMut.isPending}>
              <Check className="h-3 w-3 mr-1" /> Thêm
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Đang tải...</p>
      ) : (list ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">Chưa có loại visa nào</p>
      ) : (
        <div className="space-y-1.5">
          {(list ?? []).map((item) => (
            <LoaiVisaRow key={item.id} item={item} donViVisaId={donViVisaId} />
          ))}
        </div>
      )}
    </div>
  );
}
