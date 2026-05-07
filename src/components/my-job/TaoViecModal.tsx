import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateCongViec, useUserListForAssign } from "@/hooks/use-cong-viec";
import { useDoanList } from "@/hooks/use-doan";
import { toast } from "sonner";

const LOAI_OPTIONS = [
  { value: "booking_ks",  label: "Booking Khách sạn" },
  { value: "booking_nh",  label: "Booking Nhà hàng" },
  { value: "visa",        label: "Xử lý Visa" },
  { value: "thanh_toan",  label: "Thanh toán" },
  { value: "lien_he",     label: "Liên hệ / Xác nhận" },
  { value: "khac",        label: "Khác" },
];

const UU_TIEN_OPTIONS = [
  { value: "khan_cap",    label: "🔴 Khẩn cấp" },
  { value: "cao",         label: "🟠 Cao" },
  { value: "binh_thuong", label: "🟡 Bình thường" },
  { value: "thap",        label: "🟢 Thấp" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export default function TaoViecModal({ open, onClose, userId, userName }: Props) {
  const { data: users = [] } = useUserListForAssign();
  const { data: allDoan = [] } = useDoanList(null);
  const createMut = useCreateCongViec();

  const [tieu_de, setTieuDe] = useState("");
  const [mo_ta, setMoTa] = useState("");
  const [nguoi_nhan, setNguoiNhan] = useState("");
  const [doan_id, setDoanId] = useState<string>("");
  const [loai_viec, setLoaiViec] = useState("khac");
  const [do_uu_tien, setDoUuTien] = useState("binh_thuong");
  const [han_xu_ly, setHanXuLy] = useState("");
  const [doanSearch, setDoanSearch] = useState("");

  const filteredDoan = (allDoan as any[])
    .filter((d) => !doanSearch || d.ten_doan?.toLowerCase().includes(doanSearch.toLowerCase()))
    .slice(0, 20);

  const otherUsers = users.filter((u) => u.user_id !== userId);

  const handleSubmit = async () => {
    if (!tieu_de.trim()) { toast.error("Vui lòng nhập tiêu đề công việc"); return; }
    if (!nguoi_nhan) { toast.error("Vui lòng chọn người nhận việc"); return; }

    const tenNguoiNhan = users.find((u) => u.user_id === nguoi_nhan)?.ho_ten ?? "";
    const tenDoan = doan_id
      ? (allDoan as any[]).find((d) => String(d.id) === doan_id)?.ten_doan ?? null
      : null;

    try {
      await createMut.mutateAsync({
        tieu_de: tieu_de.trim(),
        mo_ta: mo_ta.trim() || undefined,
        doan_id: doan_id ? Number(doan_id) : null,
        nguoi_giao: userId,
        nguoi_nhan,
        loai_viec,
        do_uu_tien,
        han_xu_ly: han_xu_ly || null,
        ten_nguoi_giao: userName,
        ten_doan: tenDoan,
      });
      toast.success(`Đã giao việc cho ${tenNguoiNhan}`);
      handleClose();
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message ?? ""));
    }
  };

  const handleClose = () => {
    setTieuDe(""); setMoTa(""); setNguoiNhan(""); setDoanId("");
    setLoaiViec("khac"); setDoUuTien("binh_thuong"); setHanXuLy(""); setDoanSearch("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">Tạo việc mới</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1 text-xs">
          {/* Tiêu đề */}
          <div className="space-y-1">
            <Label className="text-xs">Tiêu đề <span className="text-destructive">*</span></Label>
            <Input
              className="h-8 text-xs"
              placeholder="Ví dụ: Xác nhận booking KS Cầu Giấy đoàn HAN..."
              value={tieu_de}
              onChange={(e) => setTieuDe(e.target.value)}
              autoFocus
            />
          </div>

          {/* Người nhận + Ưu tiên */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Người nhận <span className="text-destructive">*</span></Label>
              <Select value={nguoi_nhan} onValueChange={setNguoiNhan}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Chọn người nhận..." />
                </SelectTrigger>
                <SelectContent>
                  {otherUsers.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id} className="text-xs">
                      {u.ho_ten}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Độ ưu tiên</Label>
              <Select value={do_uu_tien} onValueChange={setDoUuTien}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UU_TIEN_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Loại việc + Deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Loại việc</Label>
              <Select value={loai_viec} onValueChange={setLoaiViec}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOAI_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hạn xử lý</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={han_xu_ly}
                onChange={(e) => setHanXuLy(e.target.value)}
              />
            </div>
          </div>

          {/* Đoàn liên quan */}
          <div className="space-y-1">
            <Label className="text-xs">Đoàn liên quan (tuỳ chọn)</Label>
            <Input
              className="h-8 text-xs"
              placeholder="Tìm tên đoàn..."
              value={doanSearch}
              onChange={(e) => { setDoanSearch(e.target.value); setDoanId(""); }}
            />
            {doanSearch && filteredDoan.length > 0 && (
              <div className="border rounded-md max-h-32 overflow-y-auto">
                {filteredDoan.map((d: any) => (
                  <button
                    key={d.id}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                    onClick={() => { setDoanId(String(d.id)); setDoanSearch(d.ten_doan); }}
                  >
                    {d.ten_doan}
                  </button>
                ))}
              </div>
            )}
            {doan_id && (
              <p className="text-[11px] text-green-600">
                ✓ {(allDoan as any[]).find((d) => String(d.id) === doan_id)?.ten_doan}
                <button className="ml-2 text-muted-foreground hover:text-foreground" onClick={() => { setDoanId(""); setDoanSearch(""); }}>✕</button>
              </p>
            )}
          </div>

          {/* Mô tả */}
          <div className="space-y-1">
            <Label className="text-xs">Mô tả chi tiết</Label>
            <Textarea
              className="text-xs min-h-[64px]"
              placeholder="Hướng dẫn, yêu cầu cụ thể..."
              value={mo_ta}
              onChange={(e) => setMoTa(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>Hủy</Button>
          <Button size="sm" className="text-xs" onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? "Đang giao..." : "Giao việc"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
