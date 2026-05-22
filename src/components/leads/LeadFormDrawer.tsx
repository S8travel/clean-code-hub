import { useState, useEffect } from "react";
import { errMsg } from "@/lib/error";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  useCreateLead, useUpdateLead,
  LEAD_NGUON_OPTS, LEAD_LOAI_KHACH_OPTS,
  type Lead, type LeadInsert,
} from "@/hooks/use-leads";
import { useCampaignList } from "@/hooks/use-lead-campaign";
import { useUserRoles } from "@/hooks/use-doan";
import { useReplaceDiemDen } from "@/hooks/use-lead-diem-den";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  lead?: Lead | null;
}

const EMPTY: LeadInsert = {
  ho_ten: "", so_dien_thoai: "", email: "", facebook_url: "",
  nguon: "", loai_tour: "outbound", loai_khach: null,
  ten_to_chuc: "", chuc_vu: "",
  so_nguoi_lon: 1, so_nguoi_em: 0,
  ngay_di_du_kien: null, ngay_ve_du_kien: null, thang_du_kien: "",
  so_ngay: null, ngan_sach_per_khach: null,
  phong_cach: null, yeu_cau_dac_biet: "",
  uu_tien: "trung_binh", assigned_to: null,
  ngay_follow_up_tiep: null, ghi_chu: "",
};

const PHONG_CACH_OPTS = [
  { value: "", label: "— Chưa xác định —" },
  { value: "tiet_kiem", label: "Tiết kiệm" },
  { value: "tieu_chuan", label: "Tiêu chuẩn" },
  { value: "cao_cap", label: "Cao cấp" },
  { value: "luxury", label: "Luxury" },
];

const CAMPAIGN_EMPTY_LABEL = "— Không chọn —";
const USER_AUTO_LABEL = "— Tự động chọn (round-robin) —";

export function LeadFormDrawer({ open, onClose, lead }: Props) {
  useTranslate();
  const { user } = useAuth();
  const { data: campaigns = [] } = useCampaignList({ active: true });
  const { data: userRoles = [] } = useUserRoles();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const replaceDiemDen = useReplaceDiemDen();

  const [form, setForm] = useState<LeadInsert>({ ...EMPTY });
  const [danhSachDiemDen, setDanhSachDiemDen] = useState<string[]>([]);
  const [diemDenInput, setDiemDenInput] = useState("");
  const [useSpecificDate, setUseSpecificDate] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (lead) {
      setForm({
        ho_ten: lead.ho_ten ?? "",
        so_dien_thoai: lead.so_dien_thoai ?? "",
        email: lead.email ?? "",
        facebook_url: lead.facebook_url ?? "",
        nguon: lead.nguon ?? "",
        campaign_id: lead.campaign_id,
        loai_tour: lead.loai_tour ?? "outbound",
        loai_khach: lead.loai_khach,
        ten_to_chuc: lead.ten_to_chuc ?? "",
        chuc_vu: lead.chuc_vu ?? "",
        so_nguoi_lon: lead.so_nguoi_lon ?? 1,
        so_nguoi_em: lead.so_nguoi_em ?? 0,
        ngay_di_du_kien: lead.ngay_di_du_kien,
        ngay_ve_du_kien: lead.ngay_ve_du_kien,
        thang_du_kien: lead.thang_du_kien ?? "",
        so_ngay: lead.so_ngay,
        ngan_sach_per_khach: lead.ngan_sach_per_khach,
        phong_cach: lead.phong_cach,
        yeu_cau_dac_biet: lead.yeu_cau_dac_biet ?? "",
        uu_tien: lead.uu_tien ?? "trung_binh",
        assigned_to: lead.assigned_to,
        ngay_follow_up_tiep: lead.ngay_follow_up_tiep,
        ghi_chu: lead.ghi_chu ?? "",
      });
      setDanhSachDiemDen(lead.diem_den?.map((d) => d.diem_den) ?? []);
      setUseSpecificDate(!!lead.ngay_di_du_kien || !lead.thang_du_kien);
    } else {
      setForm({ ...EMPTY, assigned_to: user?.user_id ?? null });
      setDanhSachDiemDen([]);
      setUseSpecificDate(true);
    }
    setDiemDenInput("");
  }, [open, lead, user?.user_id]);

  const set = <K extends keyof LeadInsert>(k: K, v: LeadInsert[K]) => setForm((p) => ({ ...p, [k]: v }));

  const isB2B = ["cong_ty", "truong_hoc", "agent_doi_tac"].includes(form.loai_khach ?? "");

  const addDiemDen = (val: string) => {
    const t = val.trim();
    if (t && !danhSachDiemDen.includes(t)) setDanhSachDiemDen((p) => [...p, t]);
    setDiemDenInput("");
  };

  const handleSubmit = async () => {
    if (!form.ho_ten?.trim()) { toast.error(t("Họ tên không được để trống")); return; }
    if (!form.so_dien_thoai?.trim() && !form.email?.trim()) {
      toast.error(t("Cần ít nhất SĐT hoặc email")); return;
    }
    if (!form.nguon) { toast.error(t("Vui lòng chọn nguồn")); return; }

    try {
      let leadId: number;
      if (lead) {
        await updateLead.mutateAsync({ id: lead.id, ...form });
        leadId = lead.id;
        toast.success(t("Đã cập nhật lead"));
      } else {
        const created = await createLead.mutateAsync({
          ...form, created_by: user?.user_id ?? null,
        });
        leadId = created.id;
        toast.success(t("Đã tạo lead mới"));
      }
      await replaceDiemDen.mutateAsync({ leadId, diemDenList: danhSachDiemDen });
      onClose();
    } catch (e: unknown) {
      toast.error(errMsg(e) || t("Lỗi khi lưu"));
    }
  };

  const isSaving = createLead.isPending || updateLead.isPending || replaceDiemDen.isPending;
  const campaignOptions = [
    { value: "", label: t(CAMPAIGN_EMPTY_LABEL) },
    ...campaigns.map((c) => ({ value: c.id.toString(), label: c.ten })),
  ];
  // Option đầu: assigned_to = "" → onChange convert thành null → trigger
  // fn_auto_assign_lead chạy round-robin chọn sales ít lead nhất.
  const userOptions = [
    { value: "", label: t(USER_AUTO_LABEL) },
    ...userRoles.map((u) => ({ value: u.user_id, label: u.ho_ten })),
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle>{lead ? t("Sửa Lead") : t("Thêm Lead mới")}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Loại khách */}
          <Field label="Loại khách">
            <div className="flex flex-wrap gap-2">
              {LEAD_LOAI_KHACH_OPTS.map((o) => (
                <button key={o.value} type="button" onClick={() => set("loai_khach", form.loai_khach === o.value ? null : o.value)}
                  className={cn("px-3 py-1 rounded-full text-xs border transition-colors",
                    form.loai_khach === o.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  )}>
                  {t(o.label)}
                </button>
              ))}
            </div>
          </Field>

          {/* Liên lạc */}
          <Field label="Họ tên *">
            <Input value={form.ho_ten} onChange={(e) => set("ho_ten", e.target.value)} placeholder={t("Nguyễn Văn A")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SĐT">
              <Input value={form.so_dien_thoai ?? ""} onChange={(e) => set("so_dien_thoai", e.target.value)} placeholder="09x..." />
            </Field>
            <Field label="Email">
              <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="abc@gmail.com" />
            </Field>
          </div>
          <Field label="Facebook">
            <Input value={form.facebook_url ?? ""} onChange={(e) => set("facebook_url", e.target.value)}
              placeholder={t("https://facebook.com/... hoặc https://m.me/...")} />
          </Field>

          {/* B2B */}
          {isB2B && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tên tổ chức">
                <Input value={form.ten_to_chuc ?? ""} onChange={(e) => set("ten_to_chuc", e.target.value)} placeholder={t("Công ty ABC")} />
              </Field>
              <Field label="Chức vụ">
                <Input value={form.chuc_vu ?? ""} onChange={(e) => set("chuc_vu", e.target.value)} placeholder={t("Trưởng phòng HR")} />
              </Field>
            </div>
          )}

          {/* Nguồn & Campaign */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nguồn *">
              <SearchableSelect options={LEAD_NGUON_OPTS.map((o) => ({ value: o.value, label: t(o.label) }))} value={form.nguon ?? ""} onChange={(v) => set("nguon", v)} placeholder={t("Chọn nguồn")} />
            </Field>
            <Field label="Campaign">
              <SearchableSelect options={campaignOptions} value={form.campaign_id?.toString() ?? ""} onChange={(v) => set("campaign_id", v ? parseInt(v) : null)} placeholder={t("Chọn campaign")} />
            </Field>
          </div>

          {/* Loại tour */}
          <Field label="Loại tour *">
            <div className="flex gap-3">
              {[{ value: "outbound", label: "Outbound" }, { value: "noi_dia", label: "Nội địa" }].map((o) => (
                <button key={o.value} type="button" onClick={() => set("loai_tour", o.value)}
                  className={cn("flex-1 py-2 rounded-lg text-sm border transition-colors",
                    form.loai_tour === o.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                  )}>
                  {t(o.label)}
                </button>
              ))}
            </div>
          </Field>

          {/* Điểm đến */}
          <Field label="Điểm đến">
            <div className="flex gap-2">
              <Input value={diemDenInput} onChange={(e) => setDiemDenInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addDiemDen(diemDenInput); } }}
                placeholder={t("Nhật Bản... Enter để thêm")} className="flex-1" />
              <Button type="button" variant="outline" size="sm" onClick={() => addDiemDen(diemDenInput)}>+</Button>
            </div>
            {danhSachDiemDen.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {danhSachDiemDen.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                    {d}
                    <button type="button" onClick={() => setDanhSachDiemDen((p) => p.filter((x) => x !== d))}>
                      <X className="h-3 w-3 hover:text-red-500" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          {/* Số khách */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Người lớn">
              <Input type="number" min={0} value={form.so_nguoi_lon ?? 1} onChange={(e) => set("so_nguoi_lon", parseInt(e.target.value) || 0)} className="tabular-nums" />
            </Field>
            <Field label="Trẻ em">
              <Input type="number" min={0} value={form.so_nguoi_em ?? 0} onChange={(e) => set("so_nguoi_em", parseInt(e.target.value) || 0)} className="tabular-nums" />
            </Field>
          </div>

          {/* Thời gian */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground font-medium">{t("Thời gian dự kiến")}</Label>
            <div className="flex gap-2">
              {[{ v: true, l: "Ngày cụ thể" }, { v: false, l: "Tháng dự kiến" }].map((o) => (
                <button key={String(o.v)} type="button" onClick={() => setUseSpecificDate(o.v)}
                  className={cn("flex-1 py-1.5 text-xs rounded border transition-colors",
                    useSpecificDate === o.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                  )}>
                  {t(o.l)}
                </button>
              ))}
            </div>
            {useSpecificDate ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ngày đi">
                  <DatePicker value={form.ngay_di_du_kien ?? ""} onChange={(v) => set("ngay_di_du_kien", v)} className="w-full h-9" />
                </Field>
                <Field label="Ngày về">
                  <DatePicker value={form.ngay_ve_du_kien ?? ""} onChange={(v) => set("ngay_ve_du_kien", v)} className="w-full h-9" />
                </Field>
              </div>
            ) : (
              <Field label="Tháng (yyyy-MM)">
                <Input value={form.thang_du_kien ?? ""} onChange={(e) => set("thang_du_kien", e.target.value)} placeholder="2026-09" />
              </Field>
            )}
          </div>

          {/* Chi tiết tour */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Số ngày">
              <Input type="number" min={1} value={form.so_ngay ?? ""} onChange={(e) => set("so_ngay", e.target.value ? parseInt(e.target.value) : null)} placeholder="5" className="tabular-nums" />
            </Field>
            <Field label="Ngân sách/khách (VND)">
              <Input type="number" min={0} value={form.ngan_sach_per_khach ?? ""} onChange={(e) => set("ngan_sach_per_khach", e.target.value ? parseInt(e.target.value) : null)} placeholder="10,000,000" className="tabular-nums" />
            </Field>
          </div>

          <Field label="Phong cách">
            <SearchableSelect options={PHONG_CACH_OPTS.map((o) => ({ value: o.value, label: t(o.label) }))} value={form.phong_cach ?? ""} onChange={(v) => set("phong_cach", v || null)} placeholder={t("Chọn phong cách")} />
          </Field>

          <Field label="Yêu cầu đặc biệt">
            <Textarea value={form.yeu_cau_dac_biet ?? ""} onChange={(e) => set("yeu_cau_dac_biet", e.target.value)} rows={2} className="resize-none" />
          </Field>

          {/* Phân công */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sales phụ trách">
              <SearchableSelect options={userOptions} value={form.assigned_to ?? ""} onChange={(v) => set("assigned_to", v || null)} placeholder={t("Chọn sales")} />
            </Field>
            <Field label="Follow-up tiếp">
              <DatePicker value={form.ngay_follow_up_tiep ?? ""} onChange={(v) => set("ngay_follow_up_tiep", v)} className="w-full h-9" />
            </Field>
          </div>

          <Field label="Ghi chú">
            <Textarea value={form.ghi_chu ?? ""} onChange={(e) => set("ghi_chu", e.target.value)} rows={2} className="resize-none" />
          </Field>
        </div>

        <div className="px-6 py-4 border-t shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>{t("Hủy")}</Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? t("Đang lưu...") : lead ? t("Cập nhật") : t("Tạo Lead")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase text-muted-foreground font-medium">{t(label)}</Label>
      {children}
    </div>
  );
}
