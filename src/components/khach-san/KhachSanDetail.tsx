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
import { DeleteDialog } from "@/components/DeleteDialog";
import { useUpdateKhachSan, useDeleteKhachSan, type KhachSan } from "@/hooks/use-khach-san";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { SearchableSelect } from "@/components/SearchableSelect";

interface Props {
  khachSan: KhachSan;
  onDeleted: () => void;
}

export default function KhachSanDetail({ khachSan, onDeleted }: Props) {
  const updateMut = useUpdateKhachSan();
  const deleteMut = useDeleteKhachSan();
  const { data: nccList } = useNhaCungCapList();
  const nccOptions = (nccList ?? []).map((n) => ({ value: String(n.id), label: n.ten }));
  const [delOpen, setDelOpen] = useState(false);

  const [form, setForm] = useState({
    ten: "",
    ten_zh: "",
    nha_cung_cap_id: "",
    dia_diem: "",
    dia_diem_zh: "",
    dia_chi: "",
    email: "",
    so_dien_thoai: "",
    website: "",
    nguoi_thanh_toan: "cong_ty",
    foc_khach: "",
    foc_mien: "",
    tai_khoan_thanh_toan: "",
    thong_tin_chung: "",
  });

  useEffect(() => {
    setForm({
      ten: khachSan.ten ?? "",
      ten_zh: khachSan.ten_zh ?? "",
      nha_cung_cap_id: khachSan.nha_cung_cap_id?.toString() ?? "",
      dia_diem: khachSan.dia_diem ?? "",
      dia_diem_zh: khachSan.dia_diem_zh ?? "",
      dia_chi: khachSan.dia_chi ?? "",
      email: khachSan.email ?? "",
      so_dien_thoai: khachSan.so_dien_thoai ?? "",
      website: khachSan.website ?? "",
      nguoi_thanh_toan: khachSan.nguoi_thanh_toan ?? "cong_ty",
      foc_khach: khachSan.foc_khach?.toString() ?? "",
      foc_mien: khachSan.foc_mien?.toString() ?? "",
      tai_khoan_thanh_toan: khachSan.tai_khoan_thanh_toan ?? "",
      thong_tin_chung: khachSan.thong_tin_chung ?? "",
    });
  }, [khachSan.id]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.ten.trim()) {
      toast.warning("Tên khách sạn không được để trống");
      return;
    }

    try {
      await updateMut.mutateAsync({
        id: khachSan.id,
        ten: form.ten.trim(),
        ten_zh: form.ten_zh || null,
        nha_cung_cap_id: form.nha_cung_cap_id ? Number(form.nha_cung_cap_id) : null,
        dia_diem: form.dia_diem || null,
        dia_diem_zh: form.dia_diem_zh || null,
        dia_chi: form.dia_chi || null,
        email: normalizeEmails(form.email) || null,
        so_dien_thoai: form.so_dien_thoai || null,
        website: form.website || null,
        nguoi_thanh_toan: form.nguoi_thanh_toan || null,
        foc_khach: form.foc_khach ? Number(form.foc_khach) : null,
        foc_mien: form.foc_mien ? Number(form.foc_mien) : null,
        tai_khoan_thanh_toan: form.tai_khoan_thanh_toan || null,
        thong_tin_chung: form.thong_tin_chung || null,
      });
      toast.success("Đã lưu thông tin khách sạn");
    } catch {
      toast.error("Lỗi lưu thông tin");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(khachSan.id);
      toast.success("Đã xóa khách sạn");
      onDeleted();
    } catch {
      toast.error("Lỗi xóa khách sạn");
    }
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{khachSan.ten}</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> Lưu
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDelOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa
          </Button>
          <DeleteDialog
            open={delOpen}
            name={khachSan.ten}
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
          <Label className="text-xs">Tên khách sạn *</Label>
          <Input value={form.ten} onChange={(e) => set("ten", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Tên tiếng Trung</Label>
          <Input value={form.ten_zh} onChange={(e) => set("ten_zh", e.target.value)} className="h-8 text-sm" placeholder="酒店名稱..." />
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
          <Label className="text-xs">Số điện thoại</Label>
          <Input value={form.so_dien_thoai} onChange={(e) => set("so_dien_thoai", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Website</Label>
          <Input value={form.website} onChange={(e) => set("website", e.target.value)} className="h-8 text-sm" placeholder="https://..." />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Địa chỉ</Label>
          <Input value={form.dia_chi} onChange={(e) => set("dia_chi", e.target.value)} className="h-8 text-sm" />
        </div>

        <Separator className="col-span-2" />

        <div>
          <Label className="text-xs">Người thanh toán</Label>
          <Select value={form.nguoi_thanh_toan} onValueChange={(v) => set("nguoi_thanh_toan", v)}>
            <SelectTrigger className="h-8 text-sm">
              <span>{form.nguoi_thanh_toan === "cong_ty" ? "Công ty" : form.nguoi_thanh_toan === "hdv" ? "Hướng dẫn viên" : form.nguoi_thanh_toan === "khach" ? "Khách thanh toán" : ""}</span>
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
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Tài khoản thanh toán</Label>
          <Textarea value={form.tai_khoan_thanh_toan} onChange={(e) => set("tai_khoan_thanh_toan", e.target.value)} className="text-sm min-h-[60px]" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Thông tin chung</Label>
          <Textarea value={form.thong_tin_chung} onChange={(e) => set("thong_tin_chung", e.target.value)} className="text-sm min-h-[60px]" />
        </div>
      </div>
    </div>
  );
}
