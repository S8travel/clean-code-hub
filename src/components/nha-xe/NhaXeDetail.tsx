import { useState, useEffect } from "react";
import { Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useUpdateNhaXe, useDeleteNhaXe, type NhaXe } from "@/hooks/use-nha-xe";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { SearchableSelect } from "@/components/SearchableSelect";
import LoaiXeSection from "./LoaiXeSection";

interface Props {
  nhaXe: NhaXe;
  onDeleted: () => void;
}

export default function NhaXeDetail({ nhaXe, onDeleted }: Props) {
  const updateMut = useUpdateNhaXe();
  const deleteMut = useDeleteNhaXe();
  const { data: nccList } = useNhaCungCapList();
  const nccOptions = (nccList ?? []).map((n) => ({ value: String(n.id), label: n.ten }));
  const [delOpen, setDelOpen] = useState(false);

  const [form, setForm] = useState({
    ten: "",
    nha_cung_cap_id: "",
    dia_diem: "",
    email: "",
    so_dien_thoai: "",
    nguoi_thanh_toan: "cong_ty",
    tai_khoan_thanh_toan: "",
    ghi_chu: "",
  });

  useEffect(() => {
    setForm({
      ten: nhaXe.ten ?? "",
      nha_cung_cap_id: nhaXe.nha_cung_cap_id?.toString() ?? "",
      dia_diem: nhaXe.dia_diem ?? "",
      email: nhaXe.email ?? "",
      so_dien_thoai: nhaXe.so_dien_thoai ?? "",
      nguoi_thanh_toan: nhaXe.nguoi_thanh_toan ?? "cong_ty",
      tai_khoan_thanh_toan: nhaXe.tai_khoan_thanh_toan ?? "",
      ghi_chu: nhaXe.ghi_chu ?? "",
    });
  }, [nhaXe.id]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.ten.trim()) {
      toast.warning("Tên nhà xe không được để trống");
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: nhaXe.id,
        ten: form.ten.trim(),
        nha_cung_cap_id: form.nha_cung_cap_id ? Number(form.nha_cung_cap_id) : null,
        dia_diem: form.dia_diem || null,
        email: form.email || null,
        so_dien_thoai: form.so_dien_thoai || null,
        nguoi_thanh_toan: form.nguoi_thanh_toan || null,
        tai_khoan_thanh_toan: form.tai_khoan_thanh_toan || null,
        ghi_chu: form.ghi_chu || null,
      });
      toast.success("Đã lưu thông tin nhà xe");
    } catch {
      toast.error("Lỗi lưu thông tin");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(nhaXe.id);
      toast.success("Đã xóa nhà xe");
      onDeleted();
    } catch {
      toast.error("Lỗi xóa nhà xe");
    }
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{nhaXe.ten}</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> Lưu
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDelOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa
          </Button>
          <DeleteDialog
            open={delOpen}
            name={nhaXe.ten}
            onConfirm={handleDelete}
            onCancel={() => setDelOpen(false)}
            isDeleting={deleteMut.isPending}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Nhà cung cấp</Label>
          <SearchableSelect
            options={nccOptions}
            value={form.nha_cung_cap_id}
            onChange={(v) => set("nha_cung_cap_id", v)}
            placeholder="Chọn nhà cung cấp"
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Tên nhà xe *</Label>
          <Input value={form.ten} onChange={(e) => set("ten", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Địa điểm</Label>
          <Input value={form.dia_diem} onChange={(e) => set("dia_diem", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input value={form.email} onChange={(e) => set("email", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Số điện thoại</Label>
          <Input value={form.so_dien_thoai} onChange={(e) => set("so_dien_thoai", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Người thanh toán</Label>
          <Select value={form.nguoi_thanh_toan} onValueChange={(v) => set("nguoi_thanh_toan", v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cong_ty">Công ty</SelectItem>
              <SelectItem value="hdv">Hướng dẫn viên</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Tài khoản thanh toán</Label>
          <Textarea value={form.tai_khoan_thanh_toan} onChange={(e) => set("tai_khoan_thanh_toan", e.target.value)} className="text-sm min-h-[60px]" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Ghi chú</Label>
          <Textarea value={form.ghi_chu} onChange={(e) => set("ghi_chu", e.target.value)} className="text-sm min-h-[60px]" />
        </div>
      </div>

      <LoaiXeSection nhaXeId={nhaXe.id} />
    </div>
  );
}
