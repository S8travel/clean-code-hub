import { useState, useEffect } from "react";
import { normalizeEmails } from "@/lib/utils";
import { Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useUpdateNhaHang, useDeleteNhaHang, type NhaHang } from "@/hooks/use-nha-hang";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { SearchableSelect } from "@/components/SearchableSelect";
import SetMenuSection from "./SetMenuSection";

interface Props {
  nhaHang: NhaHang;
  onDeleted: () => void;
}

export default function NhaHangDetail({ nhaHang, onDeleted }: Props) {
  const updateMut = useUpdateNhaHang();
  const deleteMut = useDeleteNhaHang();
  const { data: nccList } = useNhaCungCapList();

  const nccOptions = (nccList ?? []).map((n) => ({ value: String(n.id), label: n.ten }));

  const [form, setForm] = useState({
    ten: "",
    ten_zh: "",
    dia_diem: "",
    dia_diem_zh: "",
    dia_chi: "",
    email: "",
    website: "",
    hinh_anh: "",
    tai_khoan_thanh_toan: "",
    nguoi_thanh_toan: "cong_ty",
    foc_khach: "",
    foc_mien: "",
    chiet_khau: "",
    thong_tin_chung: "",
    nha_cung_cap_id: "",
  });

  useEffect(() => {
    setForm({
      ten: nhaHang.ten ?? "",
      ten_zh: nhaHang.ten_zh ?? "",
      dia_diem: nhaHang.dia_diem ?? "",
      dia_diem_zh: nhaHang.dia_diem_zh ?? "",
      dia_chi: nhaHang.dia_chi ?? "",
      email: nhaHang.email ?? "",
      website: nhaHang.website ?? "",
      hinh_anh: nhaHang.hinh_anh ?? "",
      tai_khoan_thanh_toan: nhaHang.tai_khoan_thanh_toan ?? "",
      nguoi_thanh_toan: nhaHang.nguoi_thanh_toan ?? "cong_ty",
      foc_khach: nhaHang.foc_khach?.toString() ?? "",
      foc_mien: nhaHang.foc_mien?.toString() ?? "",
      chiet_khau: nhaHang.chiet_khau_phan_tram?.toString() ?? "",
      thong_tin_chung: nhaHang.thong_tin_chung ?? "",
      nha_cung_cap_id: (nhaHang as any).nha_cung_cap_id?.toString() ?? "",
    });
  }, [nhaHang.id]);

  const handleSave = async () => {

    try {
      await updateMut.mutateAsync({
        id: nhaHang.id,
        ten: form.ten,
        ten_zh: form.ten_zh || null,
        dia_diem: form.dia_diem || null,
        dia_diem_zh: form.dia_diem_zh || null,
        dia_chi: form.dia_chi || null,
        email: normalizeEmails(form.email) || null,
        website: form.website || null,
        hinh_anh: form.hinh_anh || null,
        tai_khoan_thanh_toan: form.tai_khoan_thanh_toan || null,
        nguoi_thanh_toan: form.nguoi_thanh_toan || null,
        foc_khach: form.foc_khach ? Number(form.foc_khach) : null,
        foc_mien: form.foc_mien ? Number(form.foc_mien) : null,
        chiet_khau_phan_tram: form.chiet_khau ? Number(form.chiet_khau) : null,
        thong_tin_chung: form.thong_tin_chung || null,
        nha_cung_cap_id: form.nha_cung_cap_id ? Number(form.nha_cung_cap_id) : null,
      });
      toast.success("Đã lưu thông tin nhà hàng");
    } catch {
      toast.error("Lỗi lưu thông tin");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(nhaHang.id);
      toast.success("Đã xóa nhà hàng");
      onDeleted();
    } catch {
      toast.error("Lỗi xóa nhà hàng");
    }
  };

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{nhaHang.ten}</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> Lưu
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xóa nhà hàng?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hành động này không thể hoàn tác. Tất cả set menu liên quan sẽ bị xóa.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Xóa</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Tên nhà hàng *</Label>
          <Input value={form.ten} onChange={(e) => set("ten", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Tên tiếng Trung</Label>
          <Input value={form.ten_zh} onChange={(e) => set("ten_zh", e.target.value)} className="h-8 text-sm" placeholder="餐廳名稱..." />
        </div>
        <div>
          <Label className="text-xs">Nhà cung cấp</Label>
          <SearchableSelect
            options={nccOptions}
            value={form.nha_cung_cap_id}
            onChange={(v) => set("nha_cung_cap_id", v)}
            placeholder="Chọn nhà cung cấp"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Địa điểm</Label>
          <Input value={form.dia_diem} onChange={(e) => set("dia_diem", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Địa điểm tiếng Trung</Label>
          <Input value={form.dia_diem_zh} onChange={(e) => set("dia_diem_zh", e.target.value)} className="h-8 text-sm" placeholder="地點..." />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input value={form.email} onChange={(e) => set("email", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Website</Label>
          <Input value={form.website} onChange={(e) => set("website", e.target.value)} className="h-8 text-sm" placeholder="https://..." />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Hình ảnh (URL)</Label>
          <Input value={form.hinh_anh} onChange={(e) => set("hinh_anh", e.target.value)} className="h-8 text-sm" placeholder="https://..." />
          {form.hinh_anh && (
            <img src={form.hinh_anh} alt="Preview" className="mt-2 rounded-md max-h-[120px] object-cover border" onError={(e) => (e.currentTarget.style.display = 'none')} />
          )}
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Địa chỉ</Label>
          <Input value={form.dia_chi} onChange={(e) => set("dia_chi", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Tài khoản thanh toán</Label>
          <Textarea value={form.tai_khoan_thanh_toan} onChange={(e) => set("tai_khoan_thanh_toan", e.target.value)} className="text-sm min-h-[60px]" />
        </div>
        <div>
          <Label className="text-xs">Người thanh toán</Label>
          <Select value={form.nguoi_thanh_toan} onValueChange={(v) => set("nguoi_thanh_toan", v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cong_ty">Công ty</SelectItem>
              <SelectItem value="hdv">Hướng dẫn viên</SelectItem>
              <SelectItem value="khach">Khách thanh toán</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <Label className="text-xs">FOC khách</Label>
            <Input type="number" value={form.foc_khach} onChange={(e) => set("foc_khach", e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="flex-1">
            <Label className="text-xs">FOC miễn</Label>
            <Input type="number" value={form.foc_mien} onChange={(e) => set("foc_mien", e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="flex-1">
            <Label className="text-xs">Chiết khấu (%)</Label>
            <Input type="number" min="0" max="100" placeholder="0" value={form.chiet_khau} onChange={(e) => set("chiet_khau", e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Thông tin chung</Label>
          <Textarea value={form.thong_tin_chung} onChange={(e) => set("thong_tin_chung", e.target.value)} className="text-sm min-h-[60px]" />
        </div>
      </div>

      <Separator />

      <SetMenuSection nhaHangId={nhaHang.id} />
    </div>
  );
}
