import { useState, useEffect } from "react";
import { Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/DeleteDialog";
import {
  useUpdateNhaCungCap,
  useDeleteNhaCungCap,
  type NhaCungCap,
} from "@/hooks/use-nha-cung-cap";

interface Props {
  nhaCungCap: NhaCungCap;
  onDeleted: () => void;
}

export default function NhaCungCapDetail({ nhaCungCap, onDeleted }: Props) {
  const updateMut = useUpdateNhaCungCap();
  const deleteMut = useDeleteNhaCungCap();
  const [delOpen, setDelOpen] = useState(false);
  const [traTruoc, setTraTruoc] = useState(false);

  const [form, setForm] = useState({
    ten: "",
    ma_so_thue: "",
    email: "",
    so_dien_thoai: "",
    dia_diem: "",
    dia_chi: "",
    ngan_hang: "",
    so_tai_khoan: "",
    tai_khoan_thanh_toan: "",
    ghi_chu: "",
  });

  useEffect(() => {
    setForm({
      ten: nhaCungCap.ten ?? "",
      ma_so_thue: nhaCungCap.ma_so_thue ?? "",
      email: nhaCungCap.email ?? "",
      so_dien_thoai: nhaCungCap.so_dien_thoai ?? "",
      dia_diem: nhaCungCap.dia_diem ?? "",
      dia_chi: nhaCungCap.dia_chi ?? "",
      ngan_hang: nhaCungCap.ngan_hang ?? "",
      so_tai_khoan: nhaCungCap.so_tai_khoan ?? "",
      tai_khoan_thanh_toan: nhaCungCap.tai_khoan_thanh_toan ?? "",
      ghi_chu: nhaCungCap.ghi_chu ?? "",
    });
    setTraTruoc(!!nhaCungCap.tra_truoc);
  }, [nhaCungCap.id]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.ten.trim()) {
      toast.warning("Tên NCC không được để trống");
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: nhaCungCap.id,
        ten: form.ten.trim(),
        ma_so_thue: form.ma_so_thue || null,
        email: form.email || null,
        so_dien_thoai: form.so_dien_thoai || null,
        dia_diem: form.dia_diem || null,
        dia_chi: form.dia_chi || null,
        ngan_hang: form.ngan_hang || null,
        so_tai_khoan: form.so_tai_khoan || null,
        tai_khoan_thanh_toan: form.tai_khoan_thanh_toan || null,
        tra_truoc: traTruoc,
        ghi_chu: form.ghi_chu || null,
      });
      toast.success("Đã lưu thông tin NCC");
    } catch {
      toast.error("Lỗi lưu thông tin");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(nhaCungCap.id);
      toast.success("Đã xóa NCC");
      onDeleted();
    } catch {
      toast.error("Lỗi xóa NCC");
    }
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{nhaCungCap.ten}</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> Lưu
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDelOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa
          </Button>
          <DeleteDialog
            open={delOpen}
            name={nhaCungCap.ten}
            onConfirm={handleDelete}
            onCancel={() => setDelOpen(false)}
            isDeleting={deleteMut.isPending}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Tên NCC *</Label>
          <Input value={form.ten} onChange={(e) => set("ten", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Mã số thuế</Label>
          <Input value={form.ma_so_thue} onChange={(e) => set("ma_so_thue", e.target.value)} className="h-8 text-sm" />
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
          <Label className="text-xs">Địa điểm</Label>
          <Input value={form.dia_diem} onChange={(e) => set("dia_diem", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Địa chỉ</Label>
          <Input value={form.dia_chi} onChange={(e) => set("dia_chi", e.target.value)} className="h-8 text-sm" />
        </div>

        <Separator className="col-span-2" />

        <div>
          <Label className="text-xs">Ngân hàng</Label>
          <Input value={form.ngan_hang} onChange={(e) => set("ngan_hang", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Số tài khoản</Label>
          <Input value={form.so_tai_khoan} onChange={(e) => set("so_tai_khoan", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Tài khoản thanh toán</Label>
          <Textarea value={form.tai_khoan_thanh_toan} onChange={(e) => set("tai_khoan_thanh_toan", e.target.value)} className="text-sm min-h-[60px]" />
        </div>
        <div className="col-span-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <Checkbox
            id="ncc-tra-truoc"
            checked={traTruoc}
            onCheckedChange={(v) => setTraTruoc(v === true)}
            className="mt-0.5"
          />
          <Label htmlFor="ncc-tra-truoc" className="text-xs font-normal cursor-pointer">
            <span className="font-medium text-amber-800">NCC trả trước</span>
            <span className="block text-amber-700">
              Ứng tiền trước theo quỹ, dùng tới đâu cấn trừ tới đó. Khi tạo ĐNTT cho
              NCC này, hệ thống tự gợi ý cấn trừ vào quỹ trả trước thay vì chi tiền.
            </span>
          </Label>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Ghi chú</Label>
          <Textarea value={form.ghi_chu} onChange={(e) => set("ghi_chu", e.target.value)} className="text-sm min-h-[60px]" />
        </div>
      </div>
    </div>
  );
}
