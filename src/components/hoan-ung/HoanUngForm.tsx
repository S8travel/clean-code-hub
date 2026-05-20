import { useState, useEffect } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  useCreateHoanUng, LOAI_CHI_HOAN_UNG_OPTS, type HoanUngInsert,
} from "@/hooks/use-hoan-ung";
import { externalSupabase } from "@/lib/supabase-external";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function HoanUngForm({ open, onClose }: Props) {
  const { user } = useAuth();
  const createMut = useCreateHoanUng();

  // Tự fill thông tin user từ user_roles khi mở form
  const [hoTen, setHoTen] = useState("");
  const [soTaiKhoan, setSoTaiKhoan] = useState("");
  const [nganHang, setNganHang] = useState("");

  const [loaiChi, setLoaiChi] = useState("");
  const [moTa, setMoTa] = useState("");
  const [soTien, setSoTien] = useState<number | "">("");
  const [ngayCanTT, setNgayCanTT] = useState("");
  const [hoaDonFile, setHoaDonFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open || !user?.user_id) return;
    // Fetch user_roles row để auto-fill họ tên (STK người ứng nếu có)
    externalSupabase
      .from("user_roles")
      .select("ho_ten, so_tai_khoan, ngan_hang")
      .eq("user_id", user.user_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setHoTen(data.ho_ten ?? "");
        setSoTaiKhoan((data as any).so_tai_khoan ?? "");
        setNganHang((data as any).ngan_hang ?? "");
      });
  }, [open, user?.user_id]);

  const reset = () => {
    setLoaiChi("");
    setMoTa("");
    setSoTien("");
    setNgayCanTT("");
    setHoaDonFile(null);
  };

  const handleSubmit = async () => {
    if (!user?.user_id) { toast.error("Chưa đăng nhập"); return; }
    if (!loaiChi) { toast.error("Vui lòng chọn loại chi"); return; }
    if (!moTa.trim()) { toast.error("Vui lòng nhập mô tả"); return; }
    if (!soTien || Number(soTien) <= 0) { toast.error("Số tiền không hợp lệ"); return; }

    let hoaDonUrl: string | null = null;
    if (hoaDonFile) {
      setUploading(true);
      try {
        const ext = hoaDonFile.name.split(".").pop() || "bin";
        const path = `hoan-ung/${user.user_id}/${Date.now()}.${ext}`;
        const { error: upErr } = await externalSupabase.storage
          .from("dntt-documents")
          .upload(path, hoaDonFile, { upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = externalSupabase.storage
          .from("dntt-documents")
          .getPublicUrl(path);
        hoaDonUrl = urlData.publicUrl;
      } catch (e: any) {
        toast.error("Lỗi upload hóa đơn: " + (e?.message ?? "unknown"));
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    const payload: HoanUngInsert = {
      loai_chi_hoan_ung: loaiChi,
      nguoi_ung_id: user.user_id,
      ten_nguoi_ung: hoTen || user.email || user.user_id,
      mo_ta: moTa.trim(),
      so_tien: Number(soTien),
      so_tai_khoan: soTaiKhoan.trim() || null,
      ngan_hang: nganHang.trim() || null,
      ngay_can_thanh_toan: ngayCanTT || null,
      hoa_don_url: hoaDonUrl,
      tao_boi: user.user_id,
    };

    createMut.mutate(payload, {
      onSuccess: () => {
        toast.success("Đã gửi yêu cầu hoàn ứng — chờ kế toán duyệt");
        reset();
        onClose();
      },
      onError: (e: any) => toast.error("Lỗi: " + (e?.message ?? "Không tạo được")),
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>Yêu cầu hoàn tiền tạm ứng</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Loại chi *</Label>
            <Select value={loaiChi} onValueChange={setLoaiChi}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Chọn loại chi" />
              </SelectTrigger>
              <SelectContent>
                {LOAI_CHI_HOAN_UNG_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Mô tả chi tiết *</Label>
            <Textarea
              value={moTa}
              onChange={(e) => setMoTa(e.target.value)}
              placeholder="VD: Mua mực in máy in công ty + giấy A4..."
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Số tiền (VND) *</Label>
            <Input
              type="number"
              min={0}
              value={soTien}
              onChange={(e) => setSoTien(e.target.value ? Number(e.target.value) : "")}
              placeholder="0"
              className="tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Ngày cần thanh toán</Label>
            <DatePicker value={ngayCanTT} onChange={setNgayCanTT} className="w-full h-9" />
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Thông tin nhận tiền (của bạn)
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Họ tên</Label>
              <Input value={hoTen} onChange={(e) => setHoTen(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Số tài khoản</Label>
                <Input value={soTaiKhoan} onChange={(e) => setSoTaiKhoan(e.target.value)} className="h-8 text-sm tabular-nums" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ngân hàng</Label>
                <Input value={nganHang} onChange={(e) => setNganHang(e.target.value)} className="h-8 text-sm" placeholder="VD: Vietcombank" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Hóa đơn / chứng từ</Label>
            <Input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,image/*"
              onChange={(e) => setHoaDonFile(e.target.files?.[0] ?? null)}
              className="text-xs file:mr-2 file:py-1 file:px-2 file:text-xs"
            />
            {hoaDonFile && (
              <p className="text-[11px] text-muted-foreground truncate">{hoaDonFile.name}</p>
            )}
          </div>
        </div>

        <SheetFooter className="px-6 py-4 border-t shrink-0 flex flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Hủy</Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={createMut.isPending || uploading}
          >
            {uploading ? "Đang upload..." : createMut.isPending ? "Đang gửi..." : "Gửi yêu cầu"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
