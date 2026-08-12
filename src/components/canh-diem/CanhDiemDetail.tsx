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
import { errMsg } from "@/lib/error";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { useKhachSanList } from "@/hooks/use-khach-san";
import { SearchableSelect } from "@/components/SearchableSelect";
import { lyDoKhongBookingDV, NHAN_LY_DO_KHONG_BOOKING } from "@/lib/booking-dv-filter";

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
  const [focKhach, setFocKhach] = useState("");
  const [focMien, setFocMien] = useState("");
  // Vé combo đã gồm bữa ăn — "khong" = vé thường (lưu NULL).
  const [baoGomBuaAn, setBaoGomBuaAn] = useState("khong");
  const [baoGomGhiChu, setBaoGomGhiChu] = useState("");
  const [nguoiThanhToan, setNguoiThanhToan] = useState("");
  const [email, setEmail] = useState("");
  const [taiKhoanThanhToan, setTaiKhoanThanhToan] = useState("");
  const [thongTinChung, setThongTinChung] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [nhaCungCapId, setNhaCungCapId] = useState("");
  const [khachSanId, setKhachSanId] = useState("");
  const [khongCanBooking, setKhongCanBooking] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  useEffect(() => {
    setTen(canhDiem.ten || "");
    setLoai(canhDiem.loai || "canh_diem");
    setDiaDiem(canhDiem.dia_diem || "");
    setIcon(canhDiem.icon || "");
    setCoPhi(canhDiem.co_phi ?? false);
    setGiaMacDinh(canhDiem.gia_mac_dinh?.toString() || "");
    setDonVi(canhDiem.don_vi || "");
    setFocKhach(canhDiem.foc_khach?.toString() || "");
    setFocMien(canhDiem.foc_mien?.toString() || "");
    setBaoGomBuaAn(canhDiem.bao_gom_bua_an || "khong");
    setBaoGomGhiChu(canhDiem.bao_gom_ghi_chu || "");
    setNguoiThanhToan(canhDiem.nguoi_thanh_toan || "");
    setEmail(canhDiem.email || "");
    setTaiKhoanThanhToan(canhDiem.tai_khoan_thanh_toan || "");
    setThongTinChung(canhDiem.thong_tin_chung || "");
    setGhiChu(canhDiem.ghi_chu || "");
    setNhaCungCapId(canhDiem.nha_cung_cap_id?.toString() || "");
    setKhachSanId(canhDiem.khach_san_id?.toString() || "");
    setKhongCanBooking(canhDiem.khong_can_booking ?? false);
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
          foc_khach: coPhi && focKhach ? Number(focKhach) : null,
          foc_mien: coPhi && focMien ? Number(focMien) : null,
          // KHÔNG gate theo coPhi: tắt/bật switch "Có phí" không được xoá trắng cờ combo.
          bao_gom_bua_an: baoGomBuaAn === "khong" ? null : baoGomBuaAn,
          bao_gom_ghi_chu: baoGomBuaAn === "khong" ? null : baoGomGhiChu || null,
          nguoi_thanh_toan: coPhi ? nguoiThanhToan || null : null,
          email: email || null,
          tai_khoan_thanh_toan: taiKhoanThanhToan || null,
          thong_tin_chung: thongTinChung || null,
          ghi_chu: ghiChu || null,
          nha_cung_cap_id: nhaCungCapId ? Number(nhaCungCapId) : null,
          khach_san_id: khachSanId ? Number(khachSanId) : null,
          khong_can_booking: khongCanBooking,
        },
      });
      toast.success("Đã lưu");
    } catch (e) {
      toast.error(errMsg(e) || "Lỗi khi lưu");
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

  // Badge phản ánh ĐÚNG thứ sync Booking DV làm, không chỉ mỗi `loai`: dịch vụ
  // gắn KS day-use hoặc bật "đặt ngoài hệ thống" thì không có mail nào được gửi.
  const lyDo = lyDoKhongBookingDV({
    loai,
    co_phi: coPhi,
    khach_san_id: khachSanId ? Number(khachSanId) : null,
    khong_can_booking: khongCanBooking,
  });

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Chi tiết cảnh điểm</h2>
        <Badge
          className={lyDo === null ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"}
          title={lyDo ? NHAN_LY_DO_KHONG_BOOKING[lyDo] : undefined}
        >
          {lyDo === null ? "Có gửi mail" : "Không gửi mail"}
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
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs flex items-center gap-2">
              FOC (miễn phí)
              <span className="text-[11px] font-normal text-muted-foreground italic">
                cứ X khách miễn Y suất — mặc định khi tạo chi phí (sửa lại được ở tour)
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} value={focKhach}
                onChange={(e) => setFocKhach(e.target.value)}
                placeholder="X khách" className="h-9 text-sm w-28"
              />
              <span className="text-sm text-muted-foreground">免</span>
              <Input
                type="number" min={0} value={focMien}
                onChange={(e) => setFocMien(e.target.value)}
                placeholder="Y suất" className="h-9 text-sm w-28"
              />
            </div>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs flex items-center gap-2">
              Vé combo đã bao gồm bữa ăn
              <span className="text-[11px] font-normal text-muted-foreground italic">
                vd Bà Nà: vé cáp treo đã kèm buffet trưa
              </span>
            </Label>
            <div className="flex items-center gap-2">
              <Select value={baoGomBuaAn} onValueChange={setBaoGomBuaAn}>
                <SelectTrigger className="h-9 text-sm w-44">
                  <span>
                    {baoGomBuaAn === "trua" ? "Gồm ăn trưa"
                      : baoGomBuaAn === "toi" ? "Gồm ăn tối"
                      : baoGomBuaAn === "ca_hai" ? "Gồm cả trưa + tối"
                      : "Không gồm bữa nào"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="khong">Không gồm bữa nào</SelectItem>
                  <SelectItem value="trua">Gồm ăn trưa</SelectItem>
                  <SelectItem value="toi">Gồm ăn tối</SelectItem>
                  <SelectItem value="ca_hai">Gồm cả trưa + tối</SelectItem>
                </SelectContent>
              </Select>
              {baoGomBuaAn !== "khong" && (
                <Input
                  value={baoGomGhiChu}
                  onChange={(e) => setBaoGomGhiChu(e.target.value)}
                  placeholder="Mô tả bữa đã gồm (buffet trưa trên đỉnh...)"
                  className="h-9 text-sm flex-1"
                />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground italic">
              Bật cờ này thì báo giá AI sẽ tự ẩn bữa ăn cùng ngày, không tính tiền 2 lần.
              Áp dụng cho mọi báo giá lập sau đó.
            </p>
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
            Booking đã nằm bên tab Khách sạn nên dịch vụ này KHÔNG hiện ở tab Booking DV nữa.
          </p>
        </div>
        <div className="space-y-1.5 col-span-2">
          <div className="flex items-center gap-3">
            <Switch
              checked={khongCanBooking}
              onCheckedChange={setKhongCanBooking}
              disabled={!!khachSanId}
            />
            <Label className="text-sm">Đặt ngoài hệ thống — không cần gửi booking</Label>
          </div>
          <p className="text-[11px] text-muted-foreground italic">
            Bật khi dịch vụ này luôn đặt qua Zalo / điện thoại / quan hệ sẵn. Dịch vụ sẽ không
            xuất hiện ở tab Booking DV của bất kỳ đoàn nào, không bị nhắc "chưa gửi booking".
            Chi phí vẫn tính bình thường.
            {khachSanId && " (Đã liên kết KS day-use nên vốn dĩ không gửi booking DV.)"}
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
