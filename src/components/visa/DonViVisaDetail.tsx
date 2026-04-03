import { useState, useEffect } from "react";
import { Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useUpdateDonViVisa, useDeleteDonViVisa, type DonViVisa } from "@/hooks/use-visa";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { SearchableSelect } from "@/components/SearchableSelect";
import LoaiVisaSection from "./LoaiVisaSection";

interface Props {
  donViVisa: DonViVisa;
  onDeleted: () => void;
}

export default function DonViVisaDetail({ donViVisa, onDeleted }: Props) {
  const updateMut = useUpdateDonViVisa();
  const deleteMut = useDeleteDonViVisa();
  const { data: nccList } = useNhaCungCapList();
  const nccOptions = (nccList ?? []).map((n) => ({ value: String(n.id), label: n.ten }));
  const [delOpen, setDelOpen] = useState(false);

  const [form, setForm] = useState({
    ten: "",
    nha_cung_cap_id: "",
    email: "",
    so_dien_thoai: "",
    dia_chi: "",
    tai_khoan_thanh_toan: "",
    ghi_chu: "",
  });

  useEffect(() => {
    setForm({
      ten: donViVisa.ten ?? "",
      nha_cung_cap_id: donViVisa.nha_cung_cap_id?.toString() ?? "",
      email: donViVisa.email ?? "",
      so_dien_thoai: donViVisa.so_dien_thoai ?? "",
      dia_chi: donViVisa.dia_chi ?? "",
      tai_khoan_thanh_toan: donViVisa.tai_khoan_thanh_toan ?? "",
      ghi_chu: donViVisa.ghi_chu ?? "",
    });
  }, [donViVisa.id]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.ten.trim()) { toast.warning("Tên đơn vị không được để trống"); return; }
    if (!form.nha_cung_cap_id) { toast.warning("Vui lòng chọn nhà cung cấp"); return; }
    try {
      await updateMut.mutateAsync({
        id: donViVisa.id,
        ten: form.ten.trim(),
        nha_cung_cap_id: Number(form.nha_cung_cap_id),
        email: form.email || null,
        so_dien_thoai: form.so_dien_thoai || null,
        dia_chi: form.dia_chi || null,
        tai_khoan_thanh_toan: form.tai_khoan_thanh_toan || null,
        ghi_chu: form.ghi_chu || null,
      });
      toast.success("Đã lưu thông tin");
    } catch {
      toast.error("Lỗi lưu thông tin");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(donViVisa.id);
      toast.success("Đã xóa");
      onDeleted();
    } catch {
      toast.error("Lỗi khi xóa");
    }
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{donViVisa.ten}</h2>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> Lưu
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDelOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa
          </Button>
          <DeleteDialog
            open={delOpen}
            name={donViVisa.ten}
            onConfirm={handleDelete}
            onCancel={() => setDelOpen(false)}
            isDeleting={deleteMut.isPending}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Nhà cung cấp *</Label>
          <SearchableSelect
            options={nccOptions}
            value={form.nha_cung_cap_id}
            onChange={(v) => set("nha_cung_cap_id", v)}
            placeholder="Chọn nhà cung cấp"
            className="h-8 text-sm"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Tên đơn vị visa *</Label>
          <Input value={form.ten} onChange={(e) => set("ten", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input value={form.email} onChange={(e) => set("email", e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Số điện thoại</Label>
          <Input value={form.so_dien_thoai} onChange={(e) => set("so_dien_thoai", e.target.value)} className="h-8 text-sm" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Địa chỉ</Label>
          <Input value={form.dia_chi} onChange={(e) => set("dia_chi", e.target.value)} className="h-8 text-sm" />
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

      <LoaiVisaSection donViVisaId={donViVisa.id} />
    </div>
  );
}
