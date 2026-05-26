import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useUpdateCanhDiem, useDeleteCanhDiem, type CanhDiem } from "@/hooks/use-canh-diem";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { useKhachSanList } from "@/hooks/use-khach-san";
import { SearchableSelect } from "@/components/SearchableSelect";

interface Props {
  canhDiem: CanhDiem;
  onDeleted: () => void;
}

export default function CanhDiemDetail({ canhDiem, onDeleted }: Props) {
  const updateMut = useUpdateCanhDiem();
  const deleteMut = useDeleteCanhDiem();
  const { data: nccList } = useNhaCungCapList();
  const { data: ksList } = useKhachSanList();
  const nccOptions = (nccList ?? []).map((n) => ({ value: String(n.id), label: n.ten }));
  const ksOptions = (ksList ?? []).map((k) => ({ value: String(k.id), label: k.ten }));

  const [ten, setTen] = useState("");
  const [loai, setLoai] = useState("canh_diem");
  const [diaDiem, setDiaDiem] = useState("");
  const [icon, setIcon] = useState("");
  const [coPhi, setCoPhi] = useState(false);
  const [giaMacDinh, setGiaMacDinh] = useState("");
  const [donVi, setDonVi] = useState("");
  const [nguoiThanhToan, setNguoiThanhToan] = useState("");
  const [email, setEmail] = useState("");
  const [taiKhoanThanhToan, setTaiKhoanThanhToan] = useState("");
  const [thongTinChung, setThongTinChung] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [nhaCungCapId, setNhaCungCapId] = useState("");
  const [khachSanId, setKhachSanId] = useState("");
  const [delOpen, setDelOpen] = useState(false);

  useEffect(() => {
    setTen(canhDiem.ten || "");
    setLoai(canhDiem.loai || "canh_diem");
    setDiaDiem(canhDiem.dia_diem || "");
    setIcon(canhDiem.icon || "");
    setCoPhi(canhDiem.co_phi ?? false);
    setGiaMacDinh(canhDiem.gia_mac_dinh?.toString() || "");
    setDonVi(canhDiem.don_vi || "");
    setNguoiThanhToan(canhDiem.nguoi_thanh_toan || "");
    setEmail(canhDiem.email || "");
    setTaiKhoanThanhToan(canhDiem.tai_khoan_thanh_toan || "");
    setThongTinChung(canhDiem.thong_tin_chung || "");
    setGhiChu(canhDiem.ghi_chu || "");
    setNhaCungCapId(canhDiem.nha_cung_cap_id?.toString() || "");
    setKhachSanId(canhDiem.khach_san_id?.toString() || "");
  }, [canhDiem]);

  const handleSave = async () => {
    if (!ten.trim()) {
      toast.warning("Tên cảnh điểm không được để trống");
      return;
    }

    try {
      await updateMut.mutateAsync({
        id: canhDiem.id,
        updates: {
          ten: ten.trim(),
          loai,
          dia_diem: diaDiem || null,
          icon: icon || null,
          co_phi: coPhi,
          gia_mac_dinh: coPhi && giaMacDinh ? Number(giaMacDinh) : null,
          don_vi: coPhi ? donVi || null : null,
          nguoi_thanh_toan: coPhi ? nguoiThanhToan || null : null,
          email: email || null,
          tai_khoan_thanh_toan: taiKhoanThanhToan || null,
          thong_tin_chung: thongTinChung || null,
          ghi_chu: ghiChu || null,
          nha_cung_cap_id: nhaCungCapId ? Number(nhaCungCapId) : null,
          khach_san_id: khachSanId ? Number(khachSanId) : null,
        },
      });
      toast.success("Đã lưu");
    } catch {
      toast.error("Lỗi khi lưu");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(canhDiem.id);
      toast.success("Đã xóa");
      onDeleted();
    } catch {
      toast.error("Lỗi khi xóa");
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chi tiết cảnh điểm</h2>
        <Badge className={loai === "dich_vu" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"}>
          {loai === "dich_vu" ? "Có gửi mail" : "Không gửi mail"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Tên *</Label>
          <Input value={ten} onChange={(e) => setTen(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Loại</Label>
          <Select value={loai} onValueChange={setLoai}>
            <SelectTrigger className="h-9 text-sm">
              <span>{loai === "canh_diem" ? "Không gửi mail" : loai === "dich_vu" ? "Có gửi mail" : ""}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="canh_diem">Không gửi mail</SelectItem>
              <SelectItem value="dich_vu">Có gửi mail</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Địa điểm</Label>
          <Input value={diaDiem} onChange={(e) => setDiaDiem(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Icon</Label>
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏞️" className="h-9 text-sm" />
        </div>
      </div>

      <Separator />

      <div className="flex items-center gap-3">
        <Switch checked={coPhi} onCheckedChange={setCoPhi} />
        <Label className="text-sm">Có phí</Label>
      </div>

      {coPhi && (
        <div className="grid grid-cols-2 gap-4 pl-2 border-l-2 border-accent/30">
          <div className="space-y-1.5">
            <Label className="text-xs">Giá mặc định</Label>
            <Input type="number" value={giaMacDinh} onChange={(e) => setGiaMacDinh(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Đơn vị</Label>
            <Input value={donVi} onChange={(e) => setDonVi(e.target.value)} placeholder="VND/người" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">Người thanh toán</Label>
            <Select value={nguoiThanhToan} onValueChange={setNguoiThanhToan}>
              <SelectTrigger className="h-9 text-sm">
                <span>{nguoiThanhToan === "cong_ty" ? "Công ty" : nguoiThanhToan === "hdv" ? "Hướng dẫn viên" : "-- Chọn --"}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cong_ty">Công ty</SelectItem>
                <SelectItem value="hdv">Hướng dẫn viên</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Nhà cung cấp</Label>
          <SearchableSelect
            options={nccOptions}
            value={nhaCungCapId}
            onChange={setNhaCungCapId}
            placeholder="Chọn nhà cung cấp"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs flex items-center gap-2">
            Liên kết KS Day Use
            {khachSanId && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">Day Use</span>
            )}
          </Label>
          <SearchableSelect
            options={ksOptions}
            value={khachSanId}
            onChange={setKhachSanId}
            placeholder="(Không) — chọn nếu cảnh điểm này là KS day-use"
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-muted-foreground italic">
            Khi liên kết: cảnh điểm này được điền vào "Chương trình" sẽ tự tạo booking KS và đẩy chi phí vào Section Khách sạn.
          </p>
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Email booking</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Tài khoản thanh toán</Label>
          <Textarea value={taiKhoanThanhToan} onChange={(e) => setTaiKhoanThanhToan(e.target.value)} className="text-sm min-h-[60px] resize-none" rows={2} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs flex items-center gap-2">
            Thông tin chung
            <span className="text-[11px] font-normal text-muted-foreground italic">
              (hiện khi hover ở chi phí — đặt phòng, FOC, lưu ý vận hành...)
            </span>
          </Label>
          <Textarea value={thongTinChung} onChange={(e) => setThongTinChung(e.target.value)} className="text-sm min-h-[60px] resize-none" rows={3} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs flex items-center gap-2">
            Ghi chú
            <span className="text-[11px] font-normal text-muted-foreground italic">
              (nội dung này sẽ hiển thị trong Điều tour, dưới tên cảnh điểm)
            </span>
          </Label>
          <Textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} className="text-sm min-h-[60px] resize-none" rows={3} />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button size="sm" onClick={handleSave} disabled={updateMut.isPending} className="bg-green-600 hover:bg-green-700 text-white">
          <Save className="h-4 w-4 mr-1" /> {updateMut.isPending ? "Đang lưu..." : "Lưu"}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setDelOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1" /> Xóa
        </Button>
        <DeleteDialog
          open={delOpen}
          name={canhDiem.ten}
          onConfirm={handleDelete}
          onCancel={() => setDelOpen(false)}
          isDeleting={deleteMut.isPending}
        />
      </div>
    </div>
  );
}
