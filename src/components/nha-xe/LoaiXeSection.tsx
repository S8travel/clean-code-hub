import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/DeleteDialog";
import {
  useLoaiXeList,
  useCreateLoaiXe,
  useUpdateLoaiXe,
  useDeleteLoaiXe,
  type LoaiXe,
} from "@/hooks/use-nha-xe";

interface Props {
  nhaXeId: number;
}

const DON_VI_OPTIONS = ["chuyến", "ngày", "km"];

function LoaiXeRow({
  item,
  nhaXeId,
}: {
  item: LoaiXe;
  nhaXeId: number;
}) {
  const updateMut = useUpdateLoaiXe();
  const deleteMut = useDeleteLoaiXe();
  const [editing, setEditing] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [form, setForm] = useState({
    ten_xe: item.ten_xe,
    so_cho: item.so_cho?.toString() ?? "",
    gia: item.gia?.toString() ?? "",
    don_vi: item.don_vi ?? "chuyến",
    ghi_chu: item.ghi_chu ?? "",
  });

  const handleSave = async () => {
    if (!form.ten_xe.trim()) { toast.warning("Tên xe không được để trống"); return; }
    try {
      await updateMut.mutateAsync({
        id: item.id,
        nha_xe_id: nhaXeId,
        ten_xe: form.ten_xe.trim(),
        so_cho: form.so_cho ? Number(form.so_cho) : null,
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
      await deleteMut.mutateAsync({ id: item.id, nha_xe_id: nhaXeId });
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
            <Label className="text-xs">Tên xe *</Label>
            <Input
              value={form.ten_xe}
              onChange={(e) => setForm((f) => ({ ...f, ten_xe: e.target.value }))}
              className="h-7 text-xs"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs">Số chỗ</Label>
            <Input
              type="number"
              value={form.so_cho}
              onChange={(e) => setForm((f) => ({ ...f, so_cho: e.target.value }))}
              className="h-7 text-xs"
              placeholder="16"
            />
          </div>
          <div>
            <Label className="text-xs">Giá</Label>
            <Input
              type="number"
              value={form.gia}
              onChange={(e) => setForm((f) => ({ ...f, gia: e.target.value }))}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Đơn vị</Label>
            <Input
              value={form.don_vi}
              onChange={(e) => setForm((f) => ({ ...f, don_vi: e.target.value }))}
              className="h-7 text-xs"
              placeholder="chuyến / ngày / km"
            />
          </div>
          <div>
            <Label className="text-xs">Ghi chú</Label>
            <Input
              value={form.ghi_chu}
              onChange={(e) => setForm((f) => ({ ...f, ghi_chu: e.target.value }))}
              className="h-7 text-xs"
            />
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{item.ten_xe}</span>
          {item.so_cho && (
            <span className="text-xs text-muted-foreground shrink-0">{item.so_cho} chỗ</span>
          )}
        </div>
        {item.gia && (
          <div className="text-xs text-muted-foreground">
            {item.gia.toLocaleString("vi-VN")} /{item.don_vi || "chuyến"}
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
        name={item.ten_xe}
        onConfirm={handleDelete}
        onCancel={() => setDelOpen(false)}
        isDeleting={deleteMut.isPending}
      />
    </div>
  );
}

export default function LoaiXeSection({ nhaXeId }: Props) {
  const { data: list, isLoading } = useLoaiXeList(nhaXeId);
  const createMut = useCreateLoaiXe();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    ten_xe: "",
    so_cho: "",
    gia: "",
    don_vi: "chuyến",
    ghi_chu: "",
  });

  const handleAdd = async () => {
    if (!form.ten_xe.trim()) { toast.warning("Tên xe không được để trống"); return; }
    try {
      await createMut.mutateAsync({
        nha_xe_id: nhaXeId,
        ten_xe: form.ten_xe.trim(),
        so_cho: form.so_cho ? Number(form.so_cho) : null,
        gia: form.gia ? Number(form.gia) : null,
        don_vi: form.don_vi || null,
        ghi_chu: form.ghi_chu || null,
      });
      setForm({ ten_xe: "", so_cho: "", gia: "", don_vi: "chuyến", ghi_chu: "" });
      setAdding(false);
      toast.success("Đã thêm loại xe");
    } catch {
      toast.error("Lỗi khi thêm loại xe");
    }
  };

  return (
    <div className="space-y-3">
      <Separator />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Danh sách loại xe</h3>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(!adding)}>
          <Plus className="h-3 w-3 mr-1" /> Thêm xe
        </Button>
      </div>

      {adding && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Tên xe *</Label>
              <Input
                value={form.ten_xe}
                onChange={(e) => setForm((f) => ({ ...f, ten_xe: e.target.value }))}
                className="h-7 text-xs"
                placeholder="VD: Toyota 16 chỗ"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Số chỗ</Label>
              <Input
                type="number"
                value={form.so_cho}
                onChange={(e) => setForm((f) => ({ ...f, so_cho: e.target.value }))}
                className="h-7 text-xs"
                placeholder="16"
              />
            </div>
            <div>
              <Label className="text-xs">Giá</Label>
              <Input
                type="number"
                value={form.gia}
                onChange={(e) => setForm((f) => ({ ...f, gia: e.target.value }))}
                className="h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Đơn vị</Label>
              <Input
                value={form.don_vi}
                onChange={(e) => setForm((f) => ({ ...f, don_vi: e.target.value }))}
                className="h-7 text-xs"
                placeholder="chuyến / ngày / km"
              />
            </div>
            <div>
              <Label className="text-xs">Ghi chú</Label>
              <Input
                value={form.ghi_chu}
                onChange={(e) => setForm((f) => ({ ...f, ghi_chu: e.target.value }))}
                className="h-7 text-xs"
              />
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
        <p className="text-xs text-muted-foreground">Chưa có loại xe nào</p>
      ) : (
        <div className="space-y-1.5">
          {(list ?? []).map((item) => (
            <LoaiXeRow key={item.id} item={item} nhaXeId={nhaXeId} />
          ))}
        </div>
      )}
    </div>
  );
}
