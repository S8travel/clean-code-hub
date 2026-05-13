import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { externalSupabase } from "@/lib/supabase-external";
import { toast } from "sonner";

type LoaiTour = "outbound" | "noi_dia" | "inbound";

interface FormState {
  ho_ten: string;
  so_dien_thoai: string;
  email: string;
  loai_tour: LoaiTour;
  diem_den: string;
  so_nguoi_lon: number;
  so_nguoi_em: number;
  ngay_di: string; // YYYY-MM-DD
  ngay_ve: string;
  ngan_sach: string;
  ghi_chu: string;
}

const EMPTY: FormState = {
  ho_ten: "",
  so_dien_thoai: "",
  email: "",
  loai_tour: "outbound",
  diem_den: "",
  so_nguoi_lon: 2,
  so_nguoi_em: 0,
  ngay_di: "",
  ngay_ve: "",
  ngan_sach: "",
  ghi_chu: "",
};

const LOAI_TOUR_OPTS: { value: LoaiTour; label: string }[] = [
  { value: "outbound", label: "Du lịch nước ngoài" },
  { value: "noi_dia",  label: "Du lịch trong nước" },
  { value: "inbound",  label: "Khách nước ngoài vào Việt Nam" },
];

export default function LeadFormPublicPage() {
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const canSubmit =
    form.ho_ten.trim().length > 0 &&
    (form.so_dien_thoai.trim().length > 0 || form.email.trim().length > 0) &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const ngan_sach = form.ngan_sach.replace(/[^\d]/g, "");
      const { error } = await externalSupabase.rpc("create_lead_from_form", {
        p_ho_ten:              form.ho_ten.trim(),
        p_so_dien_thoai:       form.so_dien_thoai.trim() || null,
        p_email:               form.email.trim() || null,
        p_loai_tour:           form.loai_tour,
        p_diem_den:            form.diem_den.trim() || null,
        p_so_nguoi_lon:        form.so_nguoi_lon,
        p_so_nguoi_em:         form.so_nguoi_em,
        p_ngay_di_du_kien:     form.ngay_di || null,
        p_ngay_ve_du_kien:     form.ngay_ve || null,
        p_ngan_sach_per_khach: ngan_sach ? Number(ngan_sach) : null,
        p_yeu_cau_dac_biet:    null,
        p_ghi_chu:             form.ghi_chu.trim() || null,
        p_nguon:               "web_form",
      });
      if (error) {
        toast.error("Không gửi được, vui lòng thử lại: " + error.message);
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f8fc] p-6">
        <div className="w-full max-w-md bg-white rounded-xl shadow-md p-8 text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
          <h1 className="text-2xl font-bold text-[#0a3d7c]">Cảm ơn anh/chị!</h1>
          <p className="text-sm text-muted-foreground">
            Thông tin của anh/chị đã được ghi nhận. Bộ phận sales của S8 Travel sẽ
            liên hệ trong vòng 24 giờ làm việc.
          </p>
          <Button
            variant="outline"
            onClick={() => { setForm({ ...EMPTY }); setDone(false); }}
          >
            Gửi yêu cầu khác
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f8fc] flex flex-col">
      {/* Header */}
      <header className="bg-[#0a3d7c] text-white py-6 px-4 sm:px-8">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <img src="/logo.jpg" alt="S8 Travel" className="w-12 h-12 rounded bg-white p-1 object-contain" />
          <div>
            <h1 className="text-xl font-bold">S8 TRAVEL</h1>
            <p className="text-xs text-blue-200">Để lại thông tin — sales liên hệ trong 24h</p>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="flex-1 py-8 px-4 sm:px-8">
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-md p-6 sm:p-8 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-[#0a3d7c]">Yêu cầu tư vấn tour</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vui lòng điền các trường có dấu <span className="text-red-500">*</span>
            </p>
          </div>

          {/* Họ tên */}
          <div className="space-y-1.5">
            <Label htmlFor="ho_ten">Họ và tên <span className="text-red-500">*</span></Label>
            <Input
              id="ho_ten"
              value={form.ho_ten}
              onChange={(e) => set("ho_ten", e.target.value)}
              placeholder="Nguyễn Văn A"
              disabled={submitting}
            />
          </div>

          {/* SDT + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sdt">Số điện thoại <span className="text-red-500">*</span></Label>
              <Input
                id="sdt"
                type="tel"
                value={form.so_dien_thoai}
                onChange={(e) => set("so_dien_thoai", e.target.value)}
                placeholder="0901 234 567"
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="example@email.com"
                disabled={submitting}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Cần ít nhất số điện thoại hoặc email để sales liên hệ.
          </p>

          {/* Loại tour */}
          <div className="space-y-1.5">
            <Label>Loại tour quan tâm <span className="text-red-500">*</span></Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {LOAI_TOUR_OPTS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={submitting}
                  onClick={() => set("loai_tour", o.value)}
                  className={
                    "border rounded-md py-2 px-3 text-sm transition " +
                    (form.loai_tour === o.value
                      ? "bg-[#0a3d7c] text-white border-[#0a3d7c]"
                      : "bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Điểm đến */}
          <div className="space-y-1.5">
            <Label htmlFor="diem_den">Điểm đến muốn đi</Label>
            <Input
              id="diem_den"
              value={form.diem_den}
              onChange={(e) => set("diem_den", e.target.value)}
              placeholder="VD: Đài Loan, Phú Quốc, Nhật Bản..."
              disabled={submitting}
            />
          </div>

          {/* Số khách */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="nl">Số người lớn</Label>
              <Input
                id="nl"
                type="number"
                min={1}
                value={form.so_nguoi_lon}
                onChange={(e) => set("so_nguoi_lon", Math.max(1, Number(e.target.value) || 1))}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ne">Số trẻ em</Label>
              <Input
                id="ne"
                type="number"
                min={0}
                value={form.so_nguoi_em}
                onChange={(e) => set("so_nguoi_em", Math.max(0, Number(e.target.value) || 0))}
                disabled={submitting}
              />
            </div>
          </div>

          {/* Ngày đi / về */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Ngày đi dự kiến</Label>
              <DatePicker
                value={form.ngay_di}
                onChange={(v) => set("ngay_di", v)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ngày về dự kiến</Label>
              <DatePicker
                value={form.ngay_ve}
                onChange={(v) => set("ngay_ve", v)}
              />
            </div>
          </div>

          {/* Ngân sách */}
          <div className="space-y-1.5">
            <Label htmlFor="ns">Ngân sách dự kiến / khách (VND)</Label>
            <Input
              id="ns"
              inputMode="numeric"
              value={form.ngan_sach}
              onChange={(e) => set("ngan_sach", e.target.value)}
              placeholder="VD: 15000000"
              disabled={submitting}
            />
          </div>

          {/* Ghi chú */}
          <div className="space-y-1.5">
            <Label htmlFor="gc">Ghi chú / yêu cầu thêm</Label>
            <Textarea
              id="gc"
              rows={3}
              value={form.ghi_chu}
              onChange={(e) => set("ghi_chu", e.target.value)}
              placeholder="VD: Thích biển, ăn chay, đi cùng người lớn tuổi..."
              disabled={submitting}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full h-11 bg-[#0a3d7c] hover:bg-[#0a3d7c]/90 text-base font-semibold"
          >
            {submitting ? "Đang gửi..." : "Gửi yêu cầu tư vấn"}
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            Thông tin của anh/chị chỉ dùng nội bộ để sales liên hệ tư vấn.
          </p>
        </div>
      </main>

      <footer className="text-center text-xs text-muted-foreground py-4">
        © S8 Travel · Hệ thống quản lý khách hàng
      </footer>
    </div>
  );
}
