import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Trash2, Users2, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DeleteDialog } from "@/components/DeleteDialog";
import {
  useUpdateKhachHang,
  useDeleteKhachHang,
  useKhachHangHistory,
  type KhachHangWithStats,
} from "@/hooks/use-khach-hang";

interface Props {
  khachHang: KhachHangWithStats;
  onDeleted: () => void;
}

const LEAD_TT_LABEL: Record<string, string> = {
  moi: "Mới",
  da_lien_he: "Đã liên hệ",
  dang_tu_van: "Đang tư vấn",
  da_bao_gia: "Đã báo giá",
  cho_chot: "Chờ chốt",
  chot_deal: "Chốt deal",
  mat_khach: "Mất khách",
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("vi-VN");
}

export default function KhachHangDetail({ khachHang, onDeleted }: Props) {
  const navigate = useNavigate();
  const updateMut = useUpdateKhachHang();
  const deleteMut = useDeleteKhachHang();
  const { data: history } = useKhachHangHistory(khachHang.id);
  const [delOpen, setDelOpen] = useState(false);

  const [loai, setLoai] = useState<"ca_nhan" | "to_chuc">("ca_nhan");
  const [doNotContact, setDoNotContact] = useState(false);
  const [form, setForm] = useState({
    ho_ten: "",
    so_dien_thoai: "",
    email: "",
    facebook_url: "",
    zalo: "",
    ten_to_chuc: "",
    ma_so_thue: "",
    dia_chi_xuat_hd: "",
    nguoi_dai_dien: "",
    chuc_vu: "",
    ngay_sinh: "",
    gioi_tinh: "",
    dia_chi: "",
    phong_cach: "",
    so_thich: "",
    mon_kieng_di_ung: "",
    ghi_chu: "",
  });

  useEffect(() => {
    setForm({
      ho_ten: khachHang.ho_ten ?? "",
      so_dien_thoai: khachHang.so_dien_thoai ?? "",
      email: khachHang.email ?? "",
      facebook_url: khachHang.facebook_url ?? "",
      zalo: khachHang.zalo ?? "",
      ten_to_chuc: khachHang.ten_to_chuc ?? "",
      ma_so_thue: khachHang.ma_so_thue ?? "",
      dia_chi_xuat_hd: khachHang.dia_chi_xuat_hd ?? "",
      nguoi_dai_dien: khachHang.nguoi_dai_dien ?? "",
      chuc_vu: khachHang.chuc_vu ?? "",
      ngay_sinh: khachHang.ngay_sinh ?? "",
      gioi_tinh: khachHang.gioi_tinh ?? "",
      dia_chi: khachHang.dia_chi ?? "",
      phong_cach: khachHang.phong_cach ?? "",
      so_thich: khachHang.so_thich ?? "",
      mon_kieng_di_ung: khachHang.mon_kieng_di_ung ?? "",
      ghi_chu: khachHang.ghi_chu ?? "",
    });
    setLoai(khachHang.loai === "to_chuc" ? "to_chuc" : "ca_nhan");
    setDoNotContact(!!khachHang.do_not_contact);
  }, [khachHang]);

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!khachHang.id) return;
    if (!form.ho_ten.trim()) {
      toast.warning("Tên khách hàng không được để trống");
      return;
    }
    try {
      await updateMut.mutateAsync({
        id: khachHang.id,
        ho_ten: form.ho_ten.trim(),
        loai,
        so_dien_thoai: form.so_dien_thoai || null,
        email: form.email || null,
        facebook_url: form.facebook_url || null,
        zalo: form.zalo || null,
        ten_to_chuc: form.ten_to_chuc || null,
        ma_so_thue: form.ma_so_thue || null,
        dia_chi_xuat_hd: form.dia_chi_xuat_hd || null,
        nguoi_dai_dien: form.nguoi_dai_dien || null,
        chuc_vu: form.chuc_vu || null,
        ngay_sinh: form.ngay_sinh || null,
        gioi_tinh: form.gioi_tinh || null,
        dia_chi: form.dia_chi || null,
        phong_cach: form.phong_cach || null,
        so_thich: form.so_thich || null,
        mon_kieng_di_ung: form.mon_kieng_di_ung || null,
        do_not_contact: doNotContact,
        ghi_chu: form.ghi_chu || null,
      });
      toast.success("Đã lưu thông tin khách hàng");
    } catch {
      toast.error("Lỗi lưu thông tin");
    }
  };

  const handleDelete = async () => {
    if (!khachHang.id) return;
    try {
      await deleteMut.mutateAsync(khachHang.id);
      toast.success("Đã xóa khách hàng");
      onDeleted();
    } catch {
      toast.error("Lỗi xóa khách hàng");
    }
  };

  return (
    <div className="p-4 space-y-5 max-w-3xl">
      {/* Header + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold truncate">{khachHang.ho_ten || "Khách hàng"}</h2>
          <p className="text-xs text-muted-foreground">
            {loai === "to_chuc" ? "Tổ chức" : "Cá nhân"}
            {khachHang.so_dien_thoai ? ` · ${khachHang.so_dien_thoai}` : ""}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> Lưu
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDelOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa
          </Button>
          <DeleteDialog
            open={delOpen}
            name={khachHang.ho_ten || "khách hàng"}
            onConfirm={handleDelete}
            onCancel={() => setDelOpen(false)}
            isDeleting={deleteMut.isPending}
          />
        </div>
      </div>

      {/* Thống kê */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border bg-muted/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Số lead</p>
          <p className="text-base font-semibold">{khachHang.so_lead ?? 0}</p>
        </div>
        <div className="rounded-md border bg-muted/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Số đoàn</p>
          <p className="text-base font-semibold">{khachHang.so_doan ?? 0}</p>
        </div>
        <div className="rounded-md border bg-muted/30 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">Liên hệ gần nhất</p>
          <p className="text-sm font-medium">{fmtDate(khachHang.lan_lien_he_gan_nhat)}</p>
        </div>
      </div>

      {/* Loại khách */}
      <div className="flex gap-2">
        {(["ca_nhan", "to_chuc"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setLoai(v)}
            className={cn(
              "flex-1 h-8 rounded-md border text-xs font-medium transition-colors",
              loai === v ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted/50",
            )}
          >
            {v === "ca_nhan" ? "Cá nhân" : "Tổ chức"}
          </button>
        ))}
      </div>

      {/* Liên hệ */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">LIÊN HỆ</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Họ tên *</Label>
            <Input value={form.ho_ten} onChange={(e) => set("ho_ten", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Số điện thoại</Label>
            <Input value={form.so_dien_thoai} onChange={(e) => set("so_dien_thoai", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Facebook</Label>
            <Input value={form.facebook_url} onChange={(e) => set("facebook_url", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Zalo</Label>
            <Input value={form.zalo} onChange={(e) => set("zalo", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Ngày sinh</Label>
            <Input type="date" value={form.ngay_sinh} onChange={(e) => set("ngay_sinh", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Giới tính</Label>
            <Input value={form.gioi_tinh} onChange={(e) => set("gioi_tinh", e.target.value)} className="h-8 text-sm" placeholder="Nam / Nữ" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Địa chỉ</Label>
            <Input value={form.dia_chi} onChange={(e) => set("dia_chi", e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Hồ sơ doanh nghiệp */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">HỒ SƠ DOANH NGHIỆP / XUẤT HÓA ĐƠN</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Tên tổ chức</Label>
            <Input value={form.ten_to_chuc} onChange={(e) => set("ten_to_chuc", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Mã số thuế</Label>
            <Input value={form.ma_so_thue} onChange={(e) => set("ma_so_thue", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Người đại diện</Label>
            <Input value={form.nguoi_dai_dien} onChange={(e) => set("nguoi_dai_dien", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Chức vụ</Label>
            <Input value={form.chuc_vu} onChange={(e) => set("chuc_vu", e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Địa chỉ xuất hóa đơn</Label>
            <Input value={form.dia_chi_xuat_hd} onChange={(e) => set("dia_chi_xuat_hd", e.target.value)} className="h-8 text-sm" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Sở thích / chăm sóc */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">SỞ THÍCH / CHĂM SÓC</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Phong cách</Label>
            <Input value={form.phong_cach} onChange={(e) => set("phong_cach", e.target.value)} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Món kiêng / dị ứng</Label>
            <Input value={form.mon_kieng_di_ung} onChange={(e) => set("mon_kieng_di_ung", e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Sở thích</Label>
            <Textarea value={form.so_thich} onChange={(e) => set("so_thich", e.target.value)} className="text-sm min-h-[50px]" />
          </div>
          <div className="col-span-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <Checkbox id="kh-dnc" checked={doNotContact} onCheckedChange={(v) => setDoNotContact(v === true)} className="mt-0.5" />
            <Label htmlFor="kh-dnc" className="text-xs font-normal cursor-pointer">
              <span className="font-medium text-amber-800">Không liên hệ (Do Not Contact)</span>
              <span className="block text-amber-700">Khách yêu cầu không nhận tư vấn/quảng cáo.</span>
            </Label>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Ghi chú</Label>
            <Textarea value={form.ghi_chu} onChange={(e) => set("ghi_chu", e.target.value)} className="text-sm min-h-[50px]" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Lịch sử lead + đoàn */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">LỊCH SỬ</p>
        <div className="space-y-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium mb-1">
              <Users2 className="h-3.5 w-3.5" /> Lead ({history?.leads.length ?? 0})
            </p>
            {(history?.leads ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có lead.</p>
            ) : (
              <div className="rounded-md border divide-y">
                {history!.leads.map((l) => (
                  <div key={l.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="truncate">{l.ho_ten} · {l.loai_tour}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground">{fmtDate(l.created_at)}</span>
                      <span className="px-1.5 py-px rounded bg-muted text-[10px]">
                        {LEAD_TT_LABEL[l.trang_thai] ?? l.trang_thai}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium mb-1">
              <Package className="h-3.5 w-3.5" /> Đoàn ({history?.doans.length ?? 0})
            </p>
            {(history?.doans ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Chưa có đoàn.</p>
            ) : (
              <div className="rounded-md border divide-y">
                {history!.doans.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => navigate(`/doan/${d.id}`)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-muted/50 text-left"
                  >
                    <span className="truncate text-primary">{d.ten_doan ?? `Đoàn #${d.id}`}</span>
                    <span className="text-muted-foreground shrink-0">{fmtDate(d.ngay_di)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
