import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { errMsg } from "@/lib/error";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, MessageCircle, Mail, Facebook, Plus, Trash2, Check, Trophy } from "lucide-react";
import { format, isBefore, isToday, startOfDay, formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useLead, useUpdateLead, useUpdateLeadStatus,
  LEAD_TRANG_THAI_OPTS, LEAD_NGUON_OPTS, LEAD_LOAI_KHACH_OPTS,
  LEAD_PHONG_CACH_OPTS, LEAD_UU_TIEN_OPTS,
  type Lead, type LeadInsert, type LeadTrangThai,
} from "@/hooks/use-leads";
import { ChotDealDialog } from "@/components/leads/ChotDealDialog";
import { useLeadActivities, useCreateActivity, LEAD_ACTIVITY_LOAI_OPTS, LEAD_KET_QUA_OPTS } from "@/hooks/use-lead-activities";
import { useLeadTasks, useCreateTask, useToggleTask, useDeleteTask } from "@/hooks/use-lead-tasks";
import { useLeadDiemDen, useReplaceDiemDen, type LeadDiemDen } from "@/hooks/use-lead-diem-den";
import { useUserRoles } from "@/hooks/use-doan";
import { useKhachHang } from "@/hooks/use-khach-hang";
import { useAuth } from "@/hooks/use-auth";
import { LeadNextActionBox } from "@/components/leads/LeadNextActionBox";
import { LeadBaoGiaTab } from "@/components/leads/LeadBaoGiaTab";
import { LeadTepDinhKem } from "@/components/leads/LeadTepDinhKem";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  leadId: number | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (lead: Lead) => void;
}

const STATUS_COLOR: Record<string, string> = {
  moi:         "bg-blue-100 text-blue-700",
  da_lien_he:  "bg-cyan-100 text-cyan-700",
  dang_tu_van: "bg-amber-100 text-amber-700",
  da_bao_gia:  "bg-violet-100 text-violet-700",
  cho_chot:    "bg-orange-100 text-orange-700",
  chot_deal:   "bg-success/10 text-success",
  mat_khach:   "bg-muted text-muted-foreground",
};

const ACTIVITY_ICON: Record<string, string> = {
  goi_dien: "📞",
  tin_nhan_zalo: "💬",
  tin_nhan_messenger: "💬",
  email: "📧",
  meeting: "🤝",
  gui_bao_gia: "📄",
  ghi_chu_noi_bo: "📝",
  doi_trang_thai: "🔄",
};

const transition = { duration: 0.25, ease: [0.2, 0, 0, 1] as const };

// Ref ổn định cho default rỗng — tránh tạo [] mới mỗi render (loop effect).
const EMPTY_DIEM_DEN: LeadDiemDen[] = [];

type Tab = "info" | "khachhang" | "baogia" | "activity" | "tasks";

// State cục bộ cho các field blur-save trong tab Thông tin.
// Giá trị có thể là string (text input) hoặc number (input số) tùy field.
type LeadLocalState = Record<string, string | number>;

export function LeadDrawer({ leadId, open, onClose, onEdit }: Props) {
  useTranslate();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: lead, isLoading } = useLead(leadId);
  const { data: activities = [] } = useLeadActivities(leadId);
  const { data: tasks = [] } = useLeadTasks(leadId);
  const { data: diemDenList = EMPTY_DIEM_DEN } = useLeadDiemDen(leadId);
  const { data: userRoles = [] } = useUserRoles();
  const { data: khachHang } = useKhachHang(lead?.khach_hang_id ?? null);

  const updateLead = useUpdateLead();
  const updateStatus = useUpdateLeadStatus();
  const createActivity = useCreateActivity();
  const createTask = useCreateTask();
  const toggleTask = useToggleTask();
  const deleteTask = useDeleteTask();
  const replaceDiemDen = useReplaceDiemDen();

  // Modal chốt deal (2 lựa chọn: tạo đoàn mới / ghép đoàn có sẵn).
  const [chotDealOpen, setChotDealOpen] = useState(false);

  // Hiện nút Chốt deal khi lead CHƯA có đoàn (kể cả lead đã chot_deal nhưng mồ côi
  // đoàn — vd kéo kanban kiểu cũ). Ẩn khi đã có đoàn hoặc mất khách.
  const canChotDeal = lead && lead.trang_thai !== "mat_khach" && !lead.doan_id;

  const [activeTab, setActiveTab] = useState<Tab>("info");

  // Local state cho blur-save fields
  const [local, setLocal] = useState<LeadLocalState>({});
  const lastLeadIdRef = useRef<number | null>(null);
  useEffect(() => {
    // Chỉ re-init khi đổi sang lead khác — bỏ qua refetch sau blur-save (cùng
    // id, useUpdateLead invalidate ["lead", id]) để không ghi đè field nhập dở.
    if (lead && lead.id !== lastLeadIdRef.current) {
      lastLeadIdRef.current = lead.id;
      setLocal({
        ho_ten: lead.ho_ten ?? "",
        so_dien_thoai: lead.so_dien_thoai ?? "",
        email: lead.email ?? "",
        facebook_url: lead.facebook_url ?? "",
        ten_to_chuc: lead.ten_to_chuc ?? "",
        chuc_vu: lead.chuc_vu ?? "",
        so_nguoi_lon: lead.so_nguoi_lon ?? 1,
        so_nguoi_em: lead.so_nguoi_em ?? 0,
        ngay_di_du_kien: lead.ngay_di_du_kien ?? "",
        ngay_ve_du_kien: lead.ngay_ve_du_kien ?? "",
        thang_du_kien: lead.thang_du_kien ?? "",
        so_ngay: lead.so_ngay ?? "",
        ngan_sach_per_khach: lead.ngan_sach_per_khach ?? "",
        phong_cach: lead.phong_cach ?? "",
        yeu_cau_dac_biet: lead.yeu_cau_dac_biet ?? "",
        ngay_follow_up_tiep: lead.ngay_follow_up_tiep ?? "",
        ghi_chu: lead.ghi_chu ?? "",
      });
    }
  }, [lead]);

  const setL = (k: string, v: string | number) => setLocal((p) => ({ ...p, [k]: v }));

  const saveField = useCallback((key: keyof LeadInsert, value: string | number | null) => {
    if (!lead) return;
    const cur = (lead as unknown as Record<string, unknown>)[key];
    const val = value === "" ? null : value;
    if (val === cur || (val === null && cur === null)) return;
    updateLead.mutate({ id: lead.id, [key]: val }, {
      onError: (e: unknown) => toast.error(errMsg(e) || t("Lỗi khi lưu")),
    });
  }, [lead, updateLead]);

  // Điểm đến local
  const [localDiemDen, setLocalDiemDen] = useState<string[]>([]);
  const [diemDenInput, setDiemDenInput] = useState("");
  useEffect(() => {
    setLocalDiemDen(diemDenList.map((d) => d.diem_den));
  }, [diemDenList]);

  const saveDiemDen = (list: string[]) => {
    if (!leadId) return;
    replaceDiemDen.mutate({ leadId, diemDenList: list }, {
      onError: () => toast.error(t("Lỗi khi lưu điểm đến")),
    });
  };

  // Activity form
  const [activityLoai, setActivityLoai] = useState("ghi_chu_noi_bo");
  const [activityNd, setActivityNd] = useState("");
  const [activityKq, setActivityKq] = useState("");

  const submitActivity = () => {
    if (!leadId || !activityNd.trim()) return;
    createActivity.mutate({
      lead_id: leadId,
      loai: activityLoai,
      noi_dung: activityNd.trim(),
      ket_qua: activityKq || null,
      created_by: user?.user_id,
    }, {
      onSuccess: () => { setActivityNd(""); setActivityKq(""); toast.success(t("Đã lưu hoạt động")); },
      onError: (e: unknown) => toast.error(errMsg(e) || t("Lỗi")),
    });
  };

  // Task form
  const [taskMoTa, setTaskMoTa] = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");

  const submitTask = () => {
    if (!leadId || !taskMoTa.trim()) return;
    createTask.mutate({
      lead_id: leadId,
      mo_ta: taskMoTa.trim(),
      deadline: taskDeadline || null,
      assigned_to: user?.user_id,
      created_by: user?.user_id,
    }, {
      onSuccess: () => { setTaskMoTa(""); setTaskDeadline(""); },
      onError: (e: unknown) => toast.error(errMsg(e) || t("Lỗi")),
    });
  };

  const userOptions = userRoles.map((u) => ({ value: u.user_id, label: u.ho_ten }));
  const isB2B = ["cong_ty", "truong_hoc", "agent_doi_tac"].includes(lead?.loai_khach ?? "");
  const today = startOfDay(new Date());

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={transition}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-[600px] bg-background shadow-xl border-l border-border/40 flex flex-col"
          >
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {isLoading ? (
                    <div className="h-6 w-40 bg-muted animate-pulse rounded" />
                  ) : (
                    <>
                      <h2 className="text-lg font-semibold truncate">{lead?.ho_ten}</h2>
                      {isB2B && lead?.ten_to_chuc && (
                        <p className="text-sm text-muted-foreground">{lead.ten_to_chuc}{lead.chuc_vu ? ` · ${lead.chuc_vu}` : ""}</p>
                      )}
                    </>
                  )}
                </div>
                <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Quick actions */}
              {lead && (
                <div className="flex items-center gap-2 flex-wrap">
                  {lead.so_dien_thoai && (
                    <a href={`tel:${lead.so_dien_thoai}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs font-medium transition-colors"
                      onClick={(e) => e.stopPropagation()}>
                      <Phone className="h-3.5 w-3.5" /> {t("Gọi")}
                    </a>
                  )}
                  {lead.so_dien_thoai && (
                    <a href={`https://zalo.me/${lead.so_dien_thoai}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-colors"
                      onClick={(e) => e.stopPropagation()}>
                      <MessageCircle className="h-3.5 w-3.5" /> Zalo
                    </a>
                  )}
                  {lead.facebook_url && (
                    <a href={lead.facebook_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-medium transition-colors"
                      onClick={(e) => e.stopPropagation()}>
                      <Facebook className="h-3.5 w-3.5" /> Facebook
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-medium transition-colors"
                      onClick={(e) => e.stopPropagation()}>
                      <Mail className="h-3.5 w-3.5" /> Email
                    </a>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    {canChotDeal && (
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => setChotDealOpen(true)}
                      >
                        <Trophy className="h-3.5 w-3.5" />
                        {t("Chốt deal")}
                      </Button>
                    )}
                    {onEdit && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEdit(lead)}>
                        {t("Sửa")}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Status + Sales */}
              {lead && (
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={lead.trang_thai}
                    onValueChange={(v) => updateStatus.mutate({
                      id: lead.id, trang_thai_moi: v as LeadTrangThai, created_by: user?.user_id,
                    })}>
                    <SelectTrigger className="h-7 w-auto text-xs gap-1">
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", STATUS_COLOR[lead.trang_thai])}>
                        {LEAD_TRANG_THAI_OPTS.find((o) => o.value === lead.trang_thai)?.label}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_TRANG_THAI_OPTS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={lead.assigned_to ?? "_none"}
                    onValueChange={(v) => updateLead.mutate({ id: lead.id, assigned_to: v === "_none" ? null : v })}
                  >
                    <SelectTrigger className="h-7 w-auto text-xs max-w-[140px]">
                      <SelectValue placeholder={t("Chưa phân công")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none" className="text-xs">{t("— Chưa phân công —")}</SelectItem>
                      {userOptions.map((u) => (
                        <SelectItem key={u.value} value={u.value} className="text-xs">{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {lead.ngay_follow_up_tiep && (
                    <span className={cn("text-xs",
                      isBefore(startOfDay(new Date(lead.ngay_follow_up_tiep)), today) ? "text-red-500 font-medium" :
                      isToday(new Date(lead.ngay_follow_up_tiep)) ? "text-amber-500 font-medium" : "text-muted-foreground"
                    )}>
                      📅 {format(new Date(lead.ngay_follow_up_tiep), "dd/MM/yyyy")}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Next-Action Box */}
            {lead && (
              <LeadNextActionBox
                lead={{
                  id: lead.id,
                  ho_ten: lead.ho_ten,
                  so_dien_thoai: lead.so_dien_thoai,
                  email: lead.email,
                  trang_thai: lead.trang_thai,
                  do_not_contact: (lead as { do_not_contact?: boolean | null }).do_not_contact,
                }}
                currentUserId={user?.user_id}
              />
            )}

            {/* Tabs */}
            <div className="shrink-0 flex border-b">
              {([["info", "📋 Thông tin"], ["khachhang", "👤 Khách hàng"], ["baogia", "💰 Báo giá"], ["activity", "🕐 Hoạt động"], ["tasks", "✅ Việc cần làm"]] as [Tab, string][]).map(([tab, l]) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={cn("flex-1 py-2.5 text-xs font-medium transition-colors",
                    activeTab === tab ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"
                  )}>
                  {t(l)}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Tab: Khách hàng ── */}
              {activeTab === "khachhang" && lead && (
                <div className="p-5 space-y-4">
                  {lead.khach_hang_id && khachHang ? (
                    <>
                      <div className="rounded-md border p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm truncate">{khachHang.ho_ten}</p>
                          <span className="shrink-0 text-[10px] px-1.5 py-px rounded-full bg-muted">
                            {khachHang.loai === "to_chuc" ? "Tổ chức" : "Cá nhân"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {khachHang.so_dien_thoai || "—"}
                          {khachHang.email ? ` · ${khachHang.email}` : ""}
                        </p>
                        {khachHang.loai === "to_chuc" && khachHang.ten_to_chuc && (
                          <p className="text-xs text-muted-foreground">{khachHang.ten_to_chuc}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
                          <p className="text-[10px] text-muted-foreground">Số lead</p>
                          <p className="text-sm font-semibold">{khachHang.so_lead ?? 0}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
                          <p className="text-[10px] text-muted-foreground">Số đoàn</p>
                          <p className="text-sm font-semibold">{khachHang.so_doan ?? 0}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/khach-hang")}>
                        Mở trang khách hàng
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        Hồ sơ doanh nghiệp, sở thích &amp; lịch sử đơn quản lý ở trang Khách hàng.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Lead chưa liên kết khách hàng.</p>
                  )}
                </div>
              )}

              {/* ── Tab: Báo giá ── */}
              {activeTab === "baogia" && lead && <LeadBaoGiaTab lead={lead} />}

              {/* ── Tab: Thông tin ── */}
              {activeTab === "info" && lead && (
                <div className="p-5 space-y-5">
                  {/* Liên lạc */}
                  <Section title={t("Liên lạc")}>
                    <Field label={t("Họ tên")}>
                      <Input value={local.ho_ten ?? ""} onChange={(e) => setL("ho_ten", e.target.value)}
                        onBlur={() => saveField("ho_ten", local.ho_ten)} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("SĐT")}>
                        <Input value={local.so_dien_thoai ?? ""} onChange={(e) => setL("so_dien_thoai", e.target.value)}
                          onBlur={() => saveField("so_dien_thoai", local.so_dien_thoai)} />
                      </Field>
                      <Field label="Email">
                        <Input value={local.email ?? ""} onChange={(e) => setL("email", e.target.value)}
                          onBlur={() => saveField("email", local.email)} />
                      </Field>
                    </div>
                    <Field label="Facebook">
                      <Input value={local.facebook_url ?? ""} onChange={(e) => setL("facebook_url", e.target.value)}
                        onBlur={() => saveField("facebook_url", local.facebook_url)}
                        placeholder="https://facebook.com/... hoặc https://m.me/..." />
                    </Field>
                    <Field label={t("Nguồn")}>
                      <SearchableSelect options={LEAD_NGUON_OPTS} value={lead.nguon ?? ""}
                        onChange={(v) => updateLead.mutate({ id: lead.id, nguon: v })} placeholder={t("Chọn nguồn")} />
                    </Field>
                  </Section>

                  {/* Tổ chức (B2B) */}
                  {isB2B && (
                    <Section title={t("Tổ chức")}>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t("Tên tổ chức")}>
                          <Input value={local.ten_to_chuc ?? ""} onChange={(e) => setL("ten_to_chuc", e.target.value)}
                            onBlur={() => saveField("ten_to_chuc", local.ten_to_chuc)} />
                        </Field>
                        <Field label={t("Chức vụ")}>
                          <Input value={local.chuc_vu ?? ""} onChange={(e) => setL("chuc_vu", e.target.value)}
                            onBlur={() => saveField("chuc_vu", local.chuc_vu)} />
                        </Field>
                      </div>
                    </Section>
                  )}

                  {/* Nhu cầu */}
                  <Section title={t("Nhu cầu")}>
                    <Field label={t("Loại khách")}>
                      <div className="flex flex-wrap gap-1.5">
                        {LEAD_LOAI_KHACH_OPTS.map((o) => (
                          <button key={o.value} type="button"
                            onClick={() => updateLead.mutate({ id: lead.id, loai_khach: o.value })}
                            className={cn("px-2.5 py-1 rounded-full text-xs border transition-colors",
                              lead.loai_khach === o.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                            )}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field label={t("Điểm đến")}>
                      <div className="flex gap-2">
                        <Input value={diemDenInput} onChange={(e) => setDiemDenInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              const dd = diemDenInput.trim();
                              if (dd && !localDiemDen.includes(dd)) {
                                const next = [...localDiemDen, dd];
                                setLocalDiemDen(next);
                                saveDiemDen(next);
                              }
                              setDiemDenInput("");
                            }
                          }}
                          placeholder={t("Nhật Bản... Enter để thêm")} className="flex-1 text-xs h-8" />
                      </div>
                      {localDiemDen.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {localDiemDen.map((d) => (
                            <span key={d} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                              {d}
                              <button type="button" onClick={() => {
                                const next = localDiemDen.filter((x) => x !== d);
                                setLocalDiemDen(next);
                                saveDiemDen(next);
                              }}><X className="h-3 w-3 hover:text-red-500" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("Người lớn")}>
                        <Input type="number" min={0} value={local.so_nguoi_lon ?? 1}
                          onChange={(e) => setL("so_nguoi_lon", parseInt(e.target.value) || 0)}
                          onBlur={() => saveField("so_nguoi_lon", local.so_nguoi_lon)}
                          className="tabular-nums text-xs h-8" />
                      </Field>
                      <Field label={t("Trẻ em")}>
                        <Input type="number" min={0} value={local.so_nguoi_em ?? 0}
                          onChange={(e) => setL("so_nguoi_em", parseInt(e.target.value) || 0)}
                          onBlur={() => saveField("so_nguoi_em", local.so_nguoi_em)}
                          className="tabular-nums text-xs h-8" />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("Ngày đi")}>
                        <DatePicker value={String(local.ngay_di_du_kien ?? "")}
                          onChange={(v) => { setL("ngay_di_du_kien", v); saveField("ngay_di_du_kien", v); }}
                          className="w-full h-8 text-xs" />
                      </Field>
                      <Field label={t("Ngày về")}>
                        <DatePicker value={String(local.ngay_ve_du_kien ?? "")}
                          onChange={(v) => { setL("ngay_ve_du_kien", v); saveField("ngay_ve_du_kien", v); }}
                          className="w-full h-8 text-xs" />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("Số ngày")}>
                        <Input type="number" min={1} value={local.so_ngay ?? ""}
                          onChange={(e) => setL("so_ngay", e.target.value)}
                          onBlur={() => saveField("so_ngay", local.so_ngay ? parseInt(String(local.so_ngay)) : null)}
                          className="tabular-nums text-xs h-8" placeholder="5" />
                      </Field>
                      <Field label={t("Ngân sách/khách")}>
                        <Input type="number" min={0} value={local.ngan_sach_per_khach ?? ""}
                          onChange={(e) => setL("ngan_sach_per_khach", e.target.value)}
                          onBlur={() => saveField("ngan_sach_per_khach", local.ngan_sach_per_khach ? parseInt(String(local.ngan_sach_per_khach)) : null)}
                          className="tabular-nums text-xs h-8" placeholder="VND" />
                      </Field>
                    </div>

                    <Field label={t("Phong cách")}>
                      <SearchableSelect options={[{ value: "", label: t("— Chưa xác định —") }, ...LEAD_PHONG_CACH_OPTS]}
                        value={lead.phong_cach ?? ""}
                        onChange={(v) => updateLead.mutate({ id: lead.id, phong_cach: v || null })}
                        placeholder={t("Chọn phong cách")} />
                    </Field>

                    <Field label={t("Yêu cầu đặc biệt")}>
                      <Textarea value={local.yeu_cau_dac_biet ?? ""}
                        onChange={(e) => setL("yeu_cau_dac_biet", e.target.value)}
                        onBlur={() => saveField("yeu_cau_dac_biet", local.yeu_cau_dac_biet)}
                        rows={2} className="resize-none text-xs" />
                    </Field>
                  </Section>

                  {/* Tệp đối tác gửi kèm (yêu cầu báo giá từ cổng 外網) */}
                  <LeadTepDinhKem leadId={lead.id} />

                  {/* Phân công */}
                  <Section title={t("Phân công")}>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("Ưu tiên")}>
                        <SearchableSelect options={LEAD_UU_TIEN_OPTS}
                          value={lead.uu_tien ?? "trung_binh"}
                          onChange={(v) => updateLead.mutate({ id: lead.id, uu_tien: v })}
                          placeholder={t("Chọn ưu tiên")} />
                      </Field>
                      <Field label={t("Follow-up tiếp")}>
                        <DatePicker value={String(local.ngay_follow_up_tiep ?? "")}
                          onChange={(v) => { setL("ngay_follow_up_tiep", v); saveField("ngay_follow_up_tiep", v); }}
                          className="w-full h-8 text-xs" />
                      </Field>
                    </div>
                    <Field label={t("Ghi chú")}>
                      <Textarea value={local.ghi_chu ?? ""}
                        onChange={(e) => setL("ghi_chu", e.target.value)}
                        onBlur={() => saveField("ghi_chu", local.ghi_chu)}
                        rows={3} className="resize-none text-xs" />
                    </Field>
                  </Section>
                </div>
              )}

              {/* ── Tab: Hoạt động ── */}
              {activeTab === "activity" && (
                <div className="p-5 space-y-4">
                  {/* Quick add */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex gap-2">
                      <select value={activityLoai} onChange={(e) => setActivityLoai(e.target.value)}
                        className="text-xs border rounded-md px-2 py-1 bg-background">
                        {LEAD_ACTIVITY_LOAI_OPTS.filter((o) => o.value !== "doi_trang_thai").map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {activityLoai === "goi_dien" && (
                        <select value={activityKq} onChange={(e) => setActivityKq(e.target.value)}
                          className="text-xs border rounded-md px-2 py-1 bg-background">
                          <option value="">{t("Kết quả...")}</option>
                          {LEAD_KET_QUA_OPTS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <Textarea value={activityNd} onChange={(e) => setActivityNd(e.target.value)}
                      placeholder={t("Nội dung tương tác...")} rows={2} className="resize-none text-xs" />
                    <Button size="sm" className="w-full" onClick={submitActivity} disabled={!activityNd.trim() || createActivity.isPending}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t("Lưu hoạt động")}
                    </Button>
                  </div>

                  {/* Timeline */}
                  <div className="space-y-3">
                    {activities.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">{t("Chưa có hoạt động nào")}</p>
                    )}
                    {activities.map((act) => (
                      <div key={act.id} className="flex gap-3">
                        <div className="text-base shrink-0 mt-0.5">{ACTIVITY_ICON[act.loai] ?? "📌"}</div>
                        <div className="flex-1 min-w-0">
                          {act.loai === "doi_trang_thai" ? (
                            <p className="text-xs">
                              <span className="font-medium">
                                {LEAD_TRANG_THAI_OPTS.find((o) => o.value === act.trang_thai_cu)?.label ?? act.trang_thai_cu ?? "?"}
                              </span>
                              <span className="text-muted-foreground"> → </span>
                              <span className="font-medium">
                                {LEAD_TRANG_THAI_OPTS.find((o) => o.value === act.trang_thai_moi)?.label ?? act.trang_thai_moi}
                              </span>
                            </p>
                          ) : (
                            <p className="text-xs whitespace-pre-wrap break-words">{act.noi_dung}</p>
                          )}
                          {act.ket_qua && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {t("Kết quả:")} {LEAD_KET_QUA_OPTS.find((o) => o.value === act.ket_qua)?.label ?? act.ket_qua}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(act.created_at), { addSuffix: true, locale: vi })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Tab: Việc cần làm ── */}
              {activeTab === "tasks" && (
                <div className="p-5 space-y-4">
                  {/* Add task */}
                  <div className="rounded-lg border p-3 space-y-2">
                    <Input value={taskMoTa} onChange={(e) => setTaskMoTa(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitTask()}
                      placeholder={t("Mô tả công việc... Enter để thêm")} className="text-xs" />
                    <div className="flex gap-2 items-center">
                      <DatePicker value={taskDeadline} onChange={setTaskDeadline} className="flex-1 h-8 text-xs" />
                      <Button size="sm" onClick={submitTask} disabled={!taskMoTa.trim() || createTask.isPending}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Task list */}
                  <div className="space-y-1.5">
                    {tasks.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">{t("Không có task nào")}</p>
                    )}
                    {tasks.map((task) => {
                      const deadlineOverdue = task.deadline && !task.hoan_thanh &&
                        isBefore(startOfDay(new Date(task.deadline)), today);
                      return (
                        <div key={task.id} className={cn(
                          "flex items-start gap-2 rounded-lg p-2.5 border",
                          task.hoan_thanh ? "bg-muted/30 opacity-60" : "bg-background"
                        )}>
                          <button className={cn(
                            "shrink-0 mt-0.5 h-4 w-4 rounded border flex items-center justify-center transition-colors",
                            task.hoan_thanh ? "bg-primary border-primary" : "border-border hover:border-primary"
                          )}
                            onClick={() => toggleTask.mutate({
                              id: task.id,
                              hoan_thanh: !task.hoan_thanh,
                              lead_id: task.lead_id,
                              assigned_to: task.assigned_to,
                            })}>
                            {task.hoan_thanh && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-xs", task.hoan_thanh && "line-through")}>{task.mo_ta}</p>
                            {task.deadline && (
                              <p className={cn("text-[10px] mt-0.5",
                                deadlineOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
                              )}>
                                {format(new Date(task.deadline), "dd/MM/yyyy")}
                                {deadlineOverdue && ` · ${t("Quá hạn")}`}
                              </p>
                            )}
                          </div>
                          <button onClick={() => deleteTask.mutate({
                            id: task.id, lead_id: task.lead_id, assigned_to: task.assigned_to,
                          })} className="shrink-0 p-1 text-muted-foreground hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Chốt deal: chọn tạo đoàn mới / ghép đoàn có sẵn */}
          <ChotDealDialog
            lead={lead ?? null}
            open={chotDealOpen}
            onClose={() => setChotDealOpen(false)}
            onDone={(doanId) => {
              setChotDealOpen(false);
              onClose();
              navigate(`/doan/${doanId}`);
            }}
          />
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
