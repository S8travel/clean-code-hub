import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Paperclip } from "lucide-react";
import { errMsg } from "@/lib/error";
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
  useCreateHoanUng, LOAI_CHI_HOAN_UNG_OPTS,
  type HoanUngInsert, type HoanUngItem,
} from "@/hooks/use-hoan-ung";
import { externalSupabase } from "@/lib/supabase-external";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  open: boolean;
  onClose: () => void;
}

interface DraftItem {
  loai_chi: string;
  mo_ta: string;
  so_tien: number | "";
  ngay: string;               // ngày phát sinh chi phí (YYYY-MM-DD), default = hôm nay
  hoa_don_file: File | null;
  hoa_don_url: string | null;  // URL sau khi upload (cache giữa các lần submit fail)
}

function emptyItem(): DraftItem {
  return {
    loai_chi: "",
    mo_ta: "",
    so_tien: "",
    ngay: format(new Date(), "yyyy-MM-dd"),
    hoa_don_file: null,
    hoa_don_url: null,
  };
}

export default function HoanUngForm({ open, onClose }: Props) {
  const { user } = useAuth();
  const createMut = useCreateHoanUng();

  // Thông tin nhận tiền (1 lần, dùng cho cả yêu cầu)
  const [hoTen, setHoTen] = useState("");
  const [soTaiKhoan, setSoTaiKhoan] = useState("");
  const [nganHang, setNganHang] = useState("");

  // Common
  const [ngayCanTT, setNgayCanTT] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !user?.user_id) return;
    // user_roles KHÔNG có cột so_tai_khoan/ngan_hang — select cũ làm hỏng cả
    // query (kể cả ho_ten cũng không prefill). Chỉ lấy ho_ten; STK/ngân hàng
    // nhập tay.
    externalSupabase
      .from("user_roles")
      .select("ho_ten")
      .eq("user_id", user.user_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setHoTen(data.ho_ten ?? "");
      });
  }, [open, user?.user_id]);

  const reset = () => {
    setItems([emptyItem()]);
    setNgayCanTT("");
  };

  const updateItem = (idx: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx: number) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const total = items.reduce((s, it) => s + (Number(it.so_tien) || 0), 0);

  const handleSubmit = async () => {
    if (!user?.user_id) { toast.error("Chưa đăng nhập"); return; }
    if (items.length === 0) { toast.error("Cần ít nhất 1 dòng chi phí"); return; }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.ngay) { toast.error(`Dòng ${i + 1}: chọn ngày phát sinh`); return; }
      if (!it.loai_chi) { toast.error(`Dòng ${i + 1}: chọn loại chi`); return; }
      if (!it.mo_ta.trim()) { toast.error(`Dòng ${i + 1}: nhập mô tả`); return; }
      if (!it.so_tien || Number(it.so_tien) <= 0) { toast.error(`Dòng ${i + 1}: số tiền không hợp lệ`); return; }
    }

    setSubmitting(true);

    // Upload từng hóa đơn (nếu có) — file đã upload trước thì giữ URL cũ
    const uploadedItems: HoanUngItem[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let url = it.hoa_don_url;
        if (it.hoa_don_file && !url) {
          const ext = it.hoa_don_file.name.split(".").pop() || "bin";
          const path = `hoan-ung/${user.user_id}/${Date.now()}-${i}.${ext}`;
          const { error: upErr } = await externalSupabase.storage
            .from("dntt-documents")
            .upload(path, it.hoa_don_file, { upsert: false });
          if (upErr) throw upErr;
          const { data: urlData } = externalSupabase.storage
            .from("dntt-documents")
            .getPublicUrl(path);
          url = urlData.publicUrl;
          // Cache URL để retry submit không upload lại
          updateItem(i, { hoa_don_url: url });
        }
        uploadedItems.push({
          loai_chi: it.loai_chi,
          mo_ta: it.mo_ta.trim(),
          so_tien: Number(it.so_tien),
          ngay: it.ngay || null,
          hoa_don_url: url ?? null,
        });
      }
    } catch (e: unknown) {
      toast.error("Lỗi upload hóa đơn: " + (errMsg(e) || "unknown"));
      setSubmitting(false);
      return;
    }

    const payload: HoanUngInsert = {
      items: uploadedItems,
      nguoi_ung_id: user.user_id,
      ten_nguoi_ung: hoTen || user.email || user.user_id,
      so_tai_khoan: soTaiKhoan.trim() || null,
      ngan_hang: nganHang.trim() || null,
      ngay_can_thanh_toan: ngayCanTT || null,
      tao_boi: user.user_id,
    };

    createMut.mutate(payload, {
      onSuccess: () => {
        toast.success(`Đã gửi yêu cầu hoàn ứng (${items.length} mục, tổng ${fmt(total)} ₫)`);
        reset();
        onClose();
      },
      onError: (e: unknown) => toast.error("Lỗi: " + (errMsg(e) || "Không tạo được")),
      onSettled: () => setSubmitting(false),
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>Yêu cầu hoàn tiền tạm ứng</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Danh sách dòng chi phí */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground font-semibold">
                Các dòng chi phí
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addItem}
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3 w-3" /> Thêm dòng
              </Button>
            </div>

            {items.map((it, idx) => (
              <div key={idx} className="rounded-md border border-border bg-card p-3 space-y-2.5 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Dòng {idx + 1}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Xóa dòng"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Hàng 1: Ngày + Loại chi + Số tiền */}
                <div className="grid grid-cols-[130px_1fr_130px] gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Ngày phát sinh *</Label>
                    <DatePicker
                      value={it.ngay}
                      onChange={(v) => updateItem(idx, { ngay: v })}
                      className="h-8 w-full text-xs px-2"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Loại chi *</Label>
                    <Select value={it.loai_chi} onValueChange={(v) => updateItem(idx, { loai_chi: v })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Chọn loại chi" />
                      </SelectTrigger>
                      <SelectContent>
                        {LOAI_CHI_HOAN_UNG_OPTS.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Số tiền (VND) *</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 text-xs tabular-nums"
                      value={it.so_tien}
                      onChange={(e) => updateItem(idx, { so_tien: e.target.value ? Number(e.target.value) : "" })}
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Hàng 2: Mô tả + Hóa đơn */}
                <div className="grid grid-cols-[1fr_200px] gap-2 items-start">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Mô tả chi tiết *</Label>
                    <Textarea
                      className="text-xs min-h-[44px] resize-none"
                      value={it.mo_ta}
                      onChange={(e) => updateItem(idx, { mo_ta: e.target.value })}
                      placeholder="VD: Mua mực in HP + giấy A4..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] flex items-center gap-1">
                      <Paperclip className="h-3 w-3" /> Hóa đơn
                    </Label>
                    <Input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,image/*"
                      onChange={(e) => updateItem(idx, {
                        hoa_don_file: e.target.files?.[0] ?? null,
                        hoa_don_url: null,  // reset URL khi đổi file
                      })}
                      className="text-xs file:mr-1 file:py-0.5 file:px-1.5 file:text-[10px] h-8"
                    />
                    {it.hoa_don_file && (
                      <p className="text-[10px] text-muted-foreground truncate">{it.hoa_don_file.name}</p>
                    )}
                    {it.hoa_don_url && !it.hoa_don_file && (
                      <a
                        href={it.hoa_don_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        Đã upload — xem file
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-end gap-2 px-1 py-1.5 text-xs">
              <span className="text-muted-foreground">Tổng:</span>
              <span className="text-base font-bold tabular-nums text-foreground">{fmt(total)} ₫</span>
            </div>
          </div>

          {/* Thông tin nhận tiền */}
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
            <Label className="text-xs uppercase text-muted-foreground">Ngày cần thanh toán</Label>
            <DatePicker value={ngayCanTT} onChange={setNgayCanTT} className="w-full h-9" />
          </div>
        </div>

        <SheetFooter className="px-6 py-4 border-t shrink-0 flex flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Hủy</Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={submitting || createMut.isPending}
          >
            {submitting ? "Đang gửi..." : `Gửi yêu cầu (${fmt(total)} ₫)`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
