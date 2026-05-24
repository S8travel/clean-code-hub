import { useState, useEffect, useMemo, Fragment } from "react";
import { Plus, Search, Trash2, Save, Users, ShieldAlert, Shield, History, Building2, Pencil } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useNguoiDungList,
  useCreateNguoiDung,
  useUpdateNguoiDung,
  useDeleteNguoiDung,
  type UserRoleRow,
  type VaiTro,
  type BoPhan,
} from "@/hooks/use-nguoi-dung";
import { THI_TRUONG_OPTS } from "@/hooks/use-doan";
import { useAuth } from "@/hooks/use-auth";
import {
  useVanPhongList, useCreateVanPhong, useUpdateVanPhong, useDeleteVanPhong,
  type VanPhongRow,
} from "@/hooks/use-van-phong";
import {
  useRolePermissions, useUpsertRolePermissions,
  useUserPermissions, useUpsertUserPermissions,
  type UserPermission,
  type Resource, type PermAction, type RolePermission,
} from "@/hooks/use-permissions";
import { useActivityLogList, useLogActivity, type ActivityLogFilters, type ActivityAction } from "@/hooks/use-activity-log";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";

const VAI_TRO_OPTS: { value: VaiTro; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "giam_doc", label: "Giám đốc" },
  { value: "truong_phong", label: "Trưởng phòng" },
  { value: "specialist", label: "Specialist (quyền riêng)" },
  { value: "nhan_vien_cao_cap", label: "Nhân viên cao cấp" },
  { value: "nhan_vien", label: "Nhân viên" },
];

const BO_PHAN_OPTS: { value: BoPhan; label: string }[] = [
  { value: "dieu_hanh", label: "Điều hành" },
  { value: "ke_toan", label: "Kế toán" },
  { value: "sales", label: "Sales" },
  { value: "cong_tac_vien", label: "Cộng tác viên" },
];

const VAI_TRO_LABEL: Record<VaiTro, string> = {
  admin: "Admin",
  giam_doc: "Giám đốc",
  truong_phong: "Trưởng phòng",
  specialist: "Specialist",
  nhan_vien_cao_cap: "NV Cao cấp",
  nhan_vien: "Nhân viên",
};

interface ResourceItem { value: Resource; label: string }
interface ResourceSection { section: string; items: ResourceItem[] }

const RESOURCE_SECTIONS: ResourceSection[] = [
  {
    section: "Khách hàng",
    items: [
      { value: "lead", label: "Lead" },
      { value: "bao_cao_lead", label: "Báo cáo Lead" },
    ],
  },
  {
    section: "Quản lý đoàn",
    items: [
      { value: "dashboard", label: "Tổng quan" },
      { value: "my_job", label: "Công việc của tôi" },
      { value: "doan", label: "Danh sách đoàn" },
      { value: "theo_doi", label: "Theo dõi" },
      { value: "xep_hdv", label: "Xếp HDV" },
      { value: "lock_phong", label: "Lock Phòng" },
      { value: "invoice", label: "Invoice" },
      { value: "bao_gia", label: "Báo Giá" },
      { value: "chi_phi", label: "Chi phí (tab trong đoàn)" },
    ],
  },
  {
    section: "Danh mục",
    items: [
      { value: "danh_muc", label: "Danh mục (NH/KS/Xe/CĐ/HDV/Visa/NCC)" },
      { value: "seri", label: "Mẫu seri" },
    ],
  },
  {
    section: "Hệ thống",
    items: [
      { value: "dntt", label: "Đề nghị thanh toán" },
      { value: "thanh_toan_dk", label: "Thanh toán định kỳ" },
      { value: "hoa_don_unc", label: "Thanh toán, HĐ & UNC" },
      { value: "cong_no", label: "Công nợ" },
      { value: "nguoi_dung", label: "Người dùng" },
      { value: "agent", label: "Agent" },
      { value: "phan_cong_team", label: "Phân công team" },
    ],
  },
];

// Backward-compat: flat list
const RESOURCES: ResourceItem[] = RESOURCE_SECTIONS.flatMap((s) => s.items);

const ACTIONS: { field: keyof Pick<RolePermission, "can_view" | "can_create" | "can_edit" | "can_delete">; label: string }[] = [
  { field: "can_view", label: "Xem" },
  { field: "can_create", label: "Tạo" },
  { field: "can_edit", label: "Sửa" },
  { field: "can_delete", label: "Xóa" },
];

const ACTION_LABEL: Record<string, string> = {
  tao: "Tạo",
  sua: "Sửa",
  xoa: "Xóa",
  duyet: "Duyệt",
  tu_choi: "Từ chối",
  thanh_toan: "Thanh toán",
};

const THI_TRUONG_GROUPS = [
  { label: "Inbound", loai_tour: "inbound" },
  { label: "Outbound", loai_tour: "outbound" },
  { label: "Nội địa", loai_tour: "noi_dia" },
];

const emptyForm = (): Omit<UserRoleRow, "id" | "created_at"> => ({
  user_id: "",
  ho_ten: "",
  email: "",
  role: "nhan_vien",
  bo_phan: null,
  van_phong_id: null,
  phan_loai_tour: null,
  so_dien_thoai: null,
  ghi_chu: null,
  active: true,
  password_hash: null,
});

// ── Admin Guard ─────────────────────────────────────────────────────────────

function AdminGuard({ children }: { children: React.ReactNode }) {
  useTranslate();
  const { user } = useAuth();

  if (!user || user.role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center h-[calc(100vh-3rem)]">
        <div className="text-center space-y-3">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive opacity-60" />
          <div>
            <h2 className="font-semibold text-base">{t("Không có quyền truy cập")}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t("Trang này chỉ dành cho Admin.")}</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function NguoiDungPage() {
  return (
    <AdminGuard>
      <NguoiDungContent />
    </AdminGuard>
  );
}

function NguoiDungContent() {
  useTranslate();
  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col overflow-hidden">
      <Tabs defaultValue="nguoi_dung" className="flex flex-col flex-1 overflow-hidden">
        <div className="border-b px-6 pt-4 pb-0 shrink-0">
          <h1 className="text-lg font-semibold mb-3">{t("Quản lý hệ thống")}</h1>
          <TabsList className="h-9">
            <TabsTrigger value="nguoi_dung" className="text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" /> {t("Người dùng")}
            </TabsTrigger>
            <TabsTrigger value="van_phong" className="text-xs gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> {t("Văn phòng")}
            </TabsTrigger>
            <TabsTrigger value="phan_quyen" className="text-xs gap-1.5">
              <Shield className="h-3.5 w-3.5" /> {t("Phân quyền")}
            </TabsTrigger>
            <TabsTrigger value="nhat_ky" className="text-xs gap-1.5">
              <History className="h-3.5 w-3.5" /> {t("Nhật ký")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="nguoi_dung" className="flex-1 overflow-hidden mt-0">
          <NguoiDungTab />
        </TabsContent>
        <TabsContent value="van_phong" className="flex-1 overflow-auto mt-0 px-6 py-4">
          <VanPhongTab />
        </TabsContent>
        <TabsContent value="phan_quyen" className="flex-1 overflow-auto mt-0 px-6 py-4">
          <PhanQuyenTab />
        </TabsContent>
        <TabsContent value="nhat_ky" className="flex-1 overflow-auto mt-0 px-6 py-4">
          <NhatKyTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tab 1: Người dùng ────────────────────────────────────────────────────────

function NguoiDungTab() {
  useTranslate();
  const { data: list = [], isLoading } = useNguoiDungList();
  const { data: vanPhongList } = useVanPhongList();
  const createMut = useCreateNguoiDung();
  const updateMut = useUpdateNguoiDung();
  const deleteMut = useDeleteNguoiDung();
  const logActivity = useLogActivity();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [form, setForm] = useState<Omit<UserRoleRow, "id" | "created_at">>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<UserRoleRow | null>(null);
  const [dirty, setDirty] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);

  const filtered = list.filter((u) =>
    (u.ho_ten ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const selected = list.find((u) => u.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) {
      setForm({
        user_id: selected.user_id,
        ho_ten: selected.ho_ten,
        email: selected.email,
        role: selected.role,
        bo_phan: selected.bo_phan,
        van_phong_id: selected.van_phong_id,
        phan_loai_tour: selected.phan_loai_tour,
        so_dien_thoai: selected.so_dien_thoai,
        ghi_chu: selected.ghi_chu,
        active: selected.active,
        password_hash: selected.password_hash,
      });
      setDirty(false);
    }
    // selected = list.find(...) — react-query structural sharing giữ ref ổn định
    // khi user này không đổi → effect chỉ chạy khi đổi user hoặc data user đổi thật.
  }, [selected]);

  const set = <K extends keyof Omit<UserRoleRow, "id" | "created_at">>(
    field: K,
    value: UserRoleRow[K],
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    const emailLower = newEmail.trim().toLowerCase();
    try {
      const created = await createMut.mutateAsync({
        ...emptyForm(),
        user_id: crypto.randomUUID(),
        ho_ten: newName.trim(),
        email: emailLower,
      });
      setSelectedId(created.id);
      setNewName("");
      setNewEmail("");
      setShowCreate(false);
      logActivity.mutate({ action: "tao", table_name: "user_roles", record_id: created.id, mo_ta: `Tạo tài khoản ${newName.trim()}` });
      toast.success(t("Đã thêm người dùng"));
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "23505") {
        toast.error(t("Email đã tồn tại"));
      } else {
        toast.error(t("Lỗi khi tạo người dùng"));
      }
    }
  };

  const handleSave = async () => {
    if (!selected || !form.ho_ten?.trim() || !form.email?.trim()) return;
    try {
      await updateMut.mutateAsync({
        id: selected.id,
        ...form,
        email: form.email?.trim().toLowerCase() ?? null,
      });
      setDirty(false);
      toast.success(t("Đã lưu"));
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "23505") {
        toast.error(t("Email đã tồn tại"));
      } else {
        toast.error(t("Lỗi khi lưu"));
      }
    }
  };

  const handleSetPassword = async () => {
    if (!selected || !newPass) return;
    if (newPass !== confirmPass) { toast.error(t("Mật khẩu xác nhận không khớp")); return; }
    if (newPass.length < 6) { toast.error(t("Mật khẩu phải ít nhất 6 ký tự")); return; }
    if (!selected.user_id) { toast.error(t("Người dùng chưa có Supabase UID")); return; }
    setPasswordPending(true);
    try {
      const { data: { session } } = await externalSupabase.auth.getSession();
      const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/Change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ target_user_id: selected.user_id, new_password: newPass }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? t("Lỗi khi đặt mật khẩu"));
        return;
      }
      setNewPass("");
      setConfirmPass("");
      toast.success(t("Đã đặt mật khẩu"));
    } catch {
      toast.error(t("Lỗi khi đặt mật khẩu"));
    } finally {
      setPasswordPending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const name = deleteTarget.ho_ten;
      await deleteMut.mutateAsync(deleteTarget.id);
      logActivity.mutate({ action: "xoa", table_name: "user_roles", record_id: deleteTarget.id, mo_ta: `Xóa tài khoản ${name}` });
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      toast.success(t("Đã xóa"));
    } catch {
      toast.error(t("Lỗi khi xóa"));
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: danh sách ── */}
      <div className="w-72 shrink-0 border-r flex flex-col bg-card">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">{t("Người dùng")}</h2>
            <Button
              size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => setShowCreate(!showCreate)}
            >
              <Plus className="h-3 w-3 mr-1" /> {t("Thêm")}
            </Button>
          </div>

          {showCreate && (
            <div className="space-y-1.5 rounded-md border p-2">
              <Input
                className="h-7 text-xs"
                placeholder={t("Họ tên...")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <Input
                className="h-7 text-xs"
                placeholder="Email..."
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <div className="flex gap-1">
                <Button
                  size="sm" className="h-7 text-xs flex-1"
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newEmail.trim() || createMut.isPending}
                >
                  {t("Tạo")}
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => { setShowCreate(false); setNewName(""); setNewEmail(""); }}
                >
                  {t("Hủy")}
                </Button>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-7 text-xs pl-7"
              placeholder={t("Tìm theo tên, email...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">{t("Đang tải...")}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t("Chưa có người dùng")}</div>
          ) : (
            <div className="p-2 space-y-0.5">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedId(u.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    selectedId === u.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/60"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{u.ho_ten ?? t("(Chưa có tên)")}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {!u.active && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1">{t("Ẩn")}</Badge>
                      )}
                      <Badge
                        variant={u.role === "admin" || u.role === "giam_doc" ? "default" : "secondary"}
                        className="text-[10px] h-4 px-1"
                      >
                        {t(VAI_TRO_LABEL[u.role])}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <p className="text-[11px] text-muted-foreground truncate flex-1">
                      {u.email ?? "—"}
                    </p>
                    {u.bo_phan && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
                        {t(BO_PHAN_OPTS.find((o) => o.value === u.bo_phan)?.label ?? u.bo_phan)}
                      </Badge>
                    )}
                    {u.phan_loai_tour && u.phan_loai_tour.length > 0 && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0 bg-green-50 border-green-200 text-green-700">
                        {u.phan_loai_tour.map((t) => THI_TRUONG_OPTS.find((o) => o.value === t)?.label ?? t).join(", ")}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Right: chi tiết ── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center space-y-2">
            <Users className="h-10 w-10 mx-auto opacity-30" />
            <p>{t("Chọn một người dùng để xem chi tiết")}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold">{selected.ho_ten ?? t("(Chưa có tên)")}</h1>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="destructive" className="h-8 text-xs"
                  onClick={() => setDeleteTarget(selected)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("Xóa")}
                </Button>
                <Button
                  size="sm" className="h-8 text-xs"
                  onClick={handleSave}
                  disabled={!dirty || updateMut.isPending}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {updateMut.isPending ? t("Đang lưu...") : t("Lưu")}
                </Button>
              </div>
            </div>

            {/* Thông tin */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Họ tên")} <span className="text-destructive">*</span></Label>
                <Input
                  className="h-8 text-sm"
                  value={form.ho_ten ?? ""}
                  onChange={(e) => set("ho_ten", e.target.value || null)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Vai trò")}</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => set("role", v as VaiTro)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <span>{t(VAI_TRO_OPTS.find((o) => o.value === form.role)?.label ?? "")}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {VAI_TRO_OPTS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Bộ phận")}</Label>
                <Select
                  value={form.bo_phan ?? "none"}
                  onValueChange={(v) => set("bo_phan", v === "none" ? null : v as BoPhan)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <span>{form.bo_phan == null ? t("— Không có —") : t(BO_PHAN_OPTS.find((o) => o.value === form.bo_phan)?.label ?? "Chọn bộ phận")}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("— Không có —")}</SelectItem>
                    {BO_PHAN_OPTS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Văn phòng")}</Label>
                <Select
                  value={form.van_phong_id != null ? String(form.van_phong_id) : "none"}
                  onValueChange={(v) => set("van_phong_id", v === "none" ? null : Number(v))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <span>{form.van_phong_id == null ? t("— Không có —") : (vanPhongList ?? []).find((vp) => vp.id === form.van_phong_id)?.ten ?? t("Chọn văn phòng")}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("— Không có —")}</SelectItem>
                    {(vanPhongList ?? []).map((vp) => (
                      <SelectItem key={vp.id} value={String(vp.id)}>{vp.ten}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">{t("Mảng phụ trách")}</Label>
                <div className="space-y-2 py-1">
                  {THI_TRUONG_GROUPS.map((group) => {
                    const opts = THI_TRUONG_OPTS.filter((o) => o.loai_tour === group.loai_tour);
                    return (
                      <div key={group.loai_tour} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-16 shrink-0">{group.label}</span>
                        <div className="flex items-center gap-3">
                          {opts.map((opt) => {
                            const checked = (form.phan_loai_tour ?? []).includes(opt.value);
                            return (
                              <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer text-sm">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => {
                                    const current = form.phan_loai_tour ?? [];
                                    const next = v ? [...current, opt.value] : current.filter((x) => x !== opt.value);
                                    set("phan_loai_tour", next.length > 0 ? next : null);
                                  }}
                                />
                                {opt.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">{t("Để trống = thấy tất cả đoàn (admin/giám đốc)")}</p>
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                <Input
                  className="h-8 text-sm"
                  type="email"
                  placeholder="example@s8travel.vn"
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value || null)}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t("Dùng để gửi email trực tiếp từ hệ thống")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Số điện thoại")}</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="VD: 0901234567"
                  value={form.so_dien_thoai ?? ""}
                  onChange={(e) => set("so_dien_thoai", e.target.value || null)}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{t("Kích hoạt")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("Tài khoản có thể đăng nhập")}</p>
                </div>
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => set("active", v)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("Ghi chú")}</Label>
              <Textarea
                className="text-sm min-h-[80px] resize-none"
                placeholder={t("Ghi chú thêm...")}
                value={form.ghi_chu ?? ""}
                onChange={(e) => set("ghi_chu", e.target.value || null)}
              />
            </div>

            {/* Đặt mật khẩu */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t("Mật khẩu đăng nhập")}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {t("Mật khẩu được quản lý qua Supabase Auth")}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("Mật khẩu mới")}</Label>
                  <div className="relative">
                    <Input
                      type={showNewPass ? "text" : "password"}
                      className="h-8 text-sm pr-8"
                      placeholder={t("Tối thiểu 6 ký tự")}
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowNewPass((v) => !v)}
                      tabIndex={-1}
                    >
                      {showNewPass
                        ? <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("Xác nhận")}</Label>
                  <Input
                    type="password"
                    className="h-8 text-sm"
                    placeholder={t("Nhập lại mật khẩu")}
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleSetPassword}
                disabled={!newPass || !confirmPass || passwordPending}
              >
                {passwordPending ? t("Đang lưu...") : t("Lưu mật khẩu")}
              </Button>
            </div>

            {form.role === "specialist" && selected.user_id && (
              <SpecialistPermissionsSection userId={selected.user_id} />
            )}

            <div className="text-[11px] text-muted-foreground border-t pt-3">
              {t("Ngày tạo:")} {new Date(selected.created_at).toLocaleDateString("vi-VN")}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Xóa người dùng?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Xóa")} <strong>{deleteTarget?.ho_ten}</strong> ({deleteTarget?.email}). {t("Hành động này không thể hoàn tác.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Hủy")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("Xóa")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Tab 2: Văn phòng ─────────────────────────────────────────────────────────

const emptyVpForm = (): Omit<VanPhongRow, "id"> => ({ ten: "", dia_chi: null, ghi_chu: null, active: true });

function VanPhongTab() {
  useTranslate();
  const { data: list = [], isLoading } = useVanPhongList();
  const createMut = useCreateVanPhong();
  const updateMut = useUpdateVanPhong();
  const deleteMut = useDeleteVanPhong();

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState<Omit<VanPhongRow, "id">>(emptyVpForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Omit<VanPhongRow, "id">>(emptyVpForm());
  const [deleteTarget, setDeleteTarget] = useState<VanPhongRow | null>(null);

  const handleCreate = async () => {
    if (!newForm.ten.trim()) return;
    try {
      await createMut.mutateAsync({ ...newForm, ten: newForm.ten.trim() });
      setNewForm(emptyVpForm());
      setShowNew(false);
      toast.success(t("Đã thêm văn phòng"));
    } catch {
      toast.error(t("Lỗi khi thêm văn phòng"));
    }
  };

  const handleStartEdit = (vp: VanPhongRow) => {
    setEditId(vp.id);
    setEditForm({ ten: vp.ten, dia_chi: vp.dia_chi, ghi_chu: vp.ghi_chu, active: vp.active });
  };

  const handleSaveEdit = async () => {
    if (!editId || !editForm.ten.trim()) return;
    try {
      await updateMut.mutateAsync({ id: editId, ...editForm, ten: editForm.ten.trim() });
      setEditId(null);
      toast.success(t("Đã lưu"));
    } catch {
      toast.error(t("Lỗi khi lưu"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      toast.success(t("Đã xóa"));
    } catch {
      toast.error(t("Lỗi khi xóa"));
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{t("Văn phòng đại diện")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("Gán văn phòng cho người dùng để lọc dữ liệu đoàn tour theo văn phòng.")}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setShowNew(true); setEditId(null); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {t("Thêm")}
        </Button>
      </div>

      {showNew && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <p className="text-xs font-medium">{t("Văn phòng mới")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t("Tên")} <span className="text-destructive">*</span></Label>
              <Input className="h-8 text-sm" placeholder={t("VD: Văn phòng HCM")} autoFocus
                value={newForm.ten} onChange={(e) => setNewForm((p) => ({ ...p, ten: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("Địa chỉ")}</Label>
              <Input className="h-8 text-sm" placeholder={t("Địa chỉ...")}
                value={newForm.dia_chi ?? ""} onChange={(e) => setNewForm((p) => ({ ...p, dia_chi: e.target.value || null }))} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">{t("Ghi chú")}</Label>
              <Input className="h-8 text-sm" placeholder={t("Ghi chú...")}
                value={newForm.ghi_chu ?? ""} onChange={(e) => setNewForm((p) => ({ ...p, ghi_chu: e.target.value || null }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={handleCreate}
              disabled={!newForm.ten.trim() || createMut.isPending}>
              {createMut.isPending ? t("Đang lưu...") : t("Tạo")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => { setShowNew(false); setNewForm(emptyVpForm()); }}>
              {t("Hủy")}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Đang tải...")}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Chưa có văn phòng nào.")}</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="text-xs bg-muted/40">
                <TableHead className="py-2">{t("Tên")}</TableHead>
                <TableHead className="py-2">{t("Địa chỉ")}</TableHead>
                <TableHead className="py-2">{t("Ghi chú")}</TableHead>
                <TableHead className="py-2 w-20 text-center">{t("Active")}</TableHead>
                <TableHead className="py-2 w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((vp) =>
                editId === vp.id ? (
                  <TableRow key={vp.id} className="bg-muted/20">
                    <TableCell className="py-1.5">
                      <Input className="h-7 text-xs" value={editForm.ten}
                        onChange={(e) => setEditForm((p) => ({ ...p, ten: e.target.value }))} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input className="h-7 text-xs" value={editForm.dia_chi ?? ""}
                        onChange={(e) => setEditForm((p) => ({ ...p, dia_chi: e.target.value || null }))} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <Input className="h-7 text-xs" value={editForm.ghi_chu ?? ""}
                        onChange={(e) => setEditForm((p) => ({ ...p, ghi_chu: e.target.value || null }))} />
                    </TableCell>
                    <TableCell className="py-1.5 text-center">
                      <Switch checked={editForm.active} onCheckedChange={(v) => setEditForm((p) => ({ ...p, active: v }))} />
                    </TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit}
                          disabled={!editForm.ten.trim() || updateMut.isPending}>
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>
                          {t("Hủy")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={vp.id} className="text-sm">
                    <TableCell className="py-2 font-medium">{vp.ten}</TableCell>
                    <TableCell className="py-2 text-muted-foreground text-xs">{vp.dia_chi ?? "—"}</TableCell>
                    <TableCell className="py-2 text-muted-foreground text-xs">{vp.ghi_chu ?? "—"}</TableCell>
                    <TableCell className="py-2 text-center">
                      <Badge variant={vp.active ? "default" : "secondary"} className="text-[10px] h-4 px-1">
                        {vp.active ? t("Có") : t("Tắt")}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => handleStartEdit(vp)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(vp)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Xóa văn phòng?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Xóa")} <strong>{deleteTarget?.ten}</strong>. {t("Người dùng thuộc văn phòng này sẽ không còn được gán văn phòng.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Hủy")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("Xóa")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Tab 4: Phân quyền ────────────────────────────────────────────────────────

// Matrix state: role → resource → { can_view, can_create, can_edit, can_delete }
type PermMatrix = Record<string, Record<string, Record<string, boolean>>>;

function buildMatrix(perms: RolePermission[]): PermMatrix {
  const m: PermMatrix = {};
  for (const role of VAI_TRO_OPTS.map((o) => o.value)) {
    m[role] = {};
    for (const res of RESOURCES.map((r) => r.value)) {
      const row = perms.find((p) => p.role === role && p.resource === res);
      m[role][res] = {
        can_view: row?.can_view ?? false,
        can_create: row?.can_create ?? false,
        can_edit: row?.can_edit ?? false,
        can_delete: row?.can_delete ?? false,
      };
    }
  }
  return m;
}

function PhanQuyenTab() {
  useTranslate();
  const { data: perms = [], isLoading } = useRolePermissions();
  const upsertMut = useUpsertRolePermissions();

  const [matrix, setMatrix] = useState<PermMatrix>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setMatrix(buildMatrix(perms));
      setDirty(false);
    }
  }, [perms, isLoading]);

  const toggle = (role: string, resource: string, field: string) => {
    if (role === "admin") return; // admin luôn có tất cả
    setMatrix((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [resource]: {
          ...prev[role]?.[resource],
          [field]: !prev[role]?.[resource]?.[field],
        },
      },
    }));
    setDirty(true);
  };

  const handleSave = () => {
    const rows: Omit<RolePermission, "id">[] = [];
    for (const role of VAI_TRO_OPTS.map((o) => o.value)) {
      for (const res of RESOURCES.map((r) => r.value)) {
        const cell = matrix[role]?.[res] ?? {};
        rows.push({
          role,
          resource: res,
          can_view: role === "admin" ? true : !!cell.can_view,
          can_create: role === "admin" ? true : !!cell.can_create,
          can_edit: role === "admin" ? true : !!cell.can_edit,
          can_delete: role === "admin" ? true : !!cell.can_delete,
        });
      }
    }
    upsertMut.mutate(rows, {
      onSuccess: () => { toast.success(t("Đã lưu phân quyền")); setDirty(false); },
      onError: (e: unknown) => toast.error(t("Lỗi") + ": " + errMsg(e)),
    });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Đang tải...")}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{t("Ma trận phân quyền")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("Admin luôn có toàn quyền. Thay đổi sẽ có hiệu lực khi người dùng đăng nhập lại.")}
          </p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={!dirty || upsertMut.isPending}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {upsertMut.isPending ? t("Đang lưu...") : t("Lưu")}
        </Button>
      </div>

      <div className="border rounded-lg overflow-auto">
        <table className="text-xs w-full">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted/40">
              <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/40 w-[260px] z-20">Resource</th>
              {VAI_TRO_OPTS.map((role) => (
                <th key={role.value} colSpan={4} className="px-2 py-2 font-medium text-center border-l whitespace-nowrap">
                  {t(role.label)}
                  {role.value === "admin" && <span className="ml-1 text-[10px] text-muted-foreground">{t("(tất cả)")}</span>}
                  {role.value === "specialist" && <span className="ml-1 text-[10px] text-muted-foreground">(per-user)</span>}
                </th>
              ))}
            </tr>
            <tr className="border-b bg-muted/20">
              <th className="sticky left-0 bg-muted/20 z-20" />
              {VAI_TRO_OPTS.map((role) =>
                ACTIONS.map((a) => (
                  <th key={role.value + a.field} className={cn(
                    "px-1 py-1.5 font-normal text-muted-foreground text-center w-9",
                    a.field === "can_view" && "border-l",
                  )}>
                    {t(a.label)}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {RESOURCE_SECTIONS.map((section) => (
              <Fragment key={section.section}>
                <tr className="border-b bg-blue-50">
                  <td colSpan={1 + VAI_TRO_OPTS.length * ACTIONS.length}
                    className="px-3 py-1.5 font-semibold text-[11px] uppercase text-blue-900 sticky left-0 bg-blue-50 z-10">
                    {t(section.section)}
                  </td>
                </tr>
                {section.items.map((res, ri) => (
                  <tr key={res.value} className={cn("border-b last:border-0 hover:bg-muted/30", ri % 2 === 0 ? "" : "bg-muted/10")}>
                    <td className={cn(
                      "px-3 py-1.5 font-medium sticky left-0",
                      ri % 2 === 0 ? "bg-background" : "bg-muted/10",
                    )}>
                      {t(res.label)}
                    </td>
                    {VAI_TRO_OPTS.map((role) =>
                      ACTIONS.map((act) => {
                        const isAdmin = role.value === "admin";
                        const isSpecialist = role.value === "specialist";
                        const checked = isAdmin
                          ? true
                          : isSpecialist
                            ? false
                            : !!matrix[role.value]?.[res.value]?.[act.field];
                        return (
                          <td key={role.value + act.field} className={cn(
                            "text-center px-1 py-1.5",
                            act.field === "can_view" && "border-l",
                          )}>
                            {isSpecialist ? (
                              <span className="text-muted-foreground text-[10px]">—</span>
                            ) : (
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggle(role.value, res.value, act.field)}
                                disabled={isAdmin}
                                className="h-3.5 w-3.5"
                              />
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab 5: Nhật ký ───────────────────────────────────────────────────────────

function NhatKyTab() {
  useTranslate();
  const { data: userList = [] } = useNguoiDungList();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");

  const filters = useMemo<ActivityLogFilters>(() => ({
    fromDate: fromDate || null,
    toDate: toDate || null,
    userId: userId || null,
    action: (action as ActivityAction) || null,
  }), [fromDate, toDate, userId, action]);

  const { data: logs = [], isLoading } = useActivityLogList(filters);

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">{t("Nhật ký hoạt động")}</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("Từ ngày")}</label>
          <DatePicker className="h-8 text-sm w-36" value={fromDate} onChange={setFromDate} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("Đến ngày")}</label>
          <DatePicker className="h-8 text-sm w-36" value={toDate} onChange={setToDate} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("Người dùng")}</label>
          <Select value={userId || "all"} onValueChange={(v) => setUserId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <span>{!userId ? t("Tất cả") : userList.find((u) => u.user_id === userId)?.ho_ten ?? userList.find((u) => u.user_id === userId)?.email ?? t("Tất cả")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tất cả")}</SelectItem>
              {userList.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.ho_ten ?? u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("Hành động")}</label>
          <Select value={action || "all"} onValueChange={(v) => setAction(v === "all" ? "" : v)}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <span>{!action ? t("Tất cả") : action === "tao" ? t("Tạo") : action === "sua" ? t("Sửa") : action === "xoa" ? t("Xóa") : action === "duyet" ? t("Duyệt") : action === "tu_choi" ? t("Từ chối") : t("Thanh toán")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Tất cả")}</SelectItem>
              <SelectItem value="tao">{t("Tạo")}</SelectItem>
              <SelectItem value="sua">{t("Sửa")}</SelectItem>
              <SelectItem value="xoa">{t("Xóa")}</SelectItem>
              <SelectItem value="duyet">{t("Duyệt")}</SelectItem>
              <SelectItem value="tu_choi">{t("Từ chối")}</SelectItem>
              <SelectItem value="thanh_toan">{t("Thanh toán")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="ghost" size="sm"
          onClick={() => { setFromDate(""); setToDate(""); setUserId(""); setAction(""); }}
        >
          {t("Đặt lại")}
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-36">{t("Thời gian")}</TableHead>
              <TableHead className="w-36">{t("Người dùng")}</TableHead>
              <TableHead className="w-24">{t("Hành động")}</TableHead>
              <TableHead>{t("Mô tả")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                  {t("Đang tải...")}
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                  {t("Không có dữ liệu")}
                </TableCell>
              </TableRow>
            ) : logs.map((log) => (
              <TableRow key={log.id} className="text-sm">
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}
                </TableCell>
                <TableCell className="text-sm">{log.ho_ten ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {t(ACTION_LABEL[log.action] ?? log.action)}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{log.mo_ta ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Specialist: per-user permission editor ──────────────────────────────────
// Ref ổn định cho default rỗng — tránh tạo [] mới mỗi render (loop effect).
const EMPTY_USER_PERMS: UserPermission[] = [];

function SpecialistPermissionsSection({ userId }: { userId: string }) {
  useTranslate();
  const { data: existing = EMPTY_USER_PERMS, isLoading } = useUserPermissions(userId);
  const upsertMut = useUpsertUserPermissions();

  type PermFlags = { v: boolean; c: boolean; e: boolean; d: boolean };
  const [matrix, setMatrix] = useState<Record<Resource, PermFlags>>(
    () => Object.fromEntries(
      RESOURCES.map((r) => [r.value, { v: false, c: false, e: false, d: false }])
    ) as Record<Resource, PermFlags>
  );
  const [dirty, setDirty] = useState(false);

  // Hydrate from existing
  useEffect(() => {
    setMatrix(Object.fromEntries(
      RESOURCES.map((r) => {
        const row = existing.find((p) => p.resource === r.value);
        return [r.value, {
          v: row?.can_view ?? false,
          c: row?.can_create ?? false,
          e: row?.can_edit ?? false,
          d: row?.can_delete ?? false,
        }];
      })
    ) as Record<Resource, PermFlags>);
    setDirty(false);
  }, [existing, userId]);

  const toggle = (resource: Resource, action: "v" | "c" | "e" | "d") => {
    setMatrix((prev) => ({
      ...prev,
      [resource]: { ...prev[resource], [action]: !prev[resource][action] },
    }));
    setDirty(true);
  };

  const handleSave = async () => {
    const rows: Omit<UserPermission, "id" | "user_id">[] = RESOURCES.map((r) => ({
      resource: r.value,
      can_view: matrix[r.value].v,
      can_create: matrix[r.value].c,
      can_edit: matrix[r.value].e,
      can_delete: matrix[r.value].d,
    }));
    try {
      await upsertMut.mutateAsync({ userId, rows });
      setDirty(false);
      toast.success(t("Đã lưu quyền specialist"));
    } catch (err: unknown) {
      toast.error(t("Lỗi") + ": " + (errMsg(err) || t("Không lưu được")));
    }
  };

  return (
    <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-amber-600" />
            {t("Quyền Specialist (per-user)")}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {t("User này không dùng quyền mặc định theo role — chọn từng resource bên dưới.")}
          </p>
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={handleSave}
          disabled={!dirty || upsertMut.isPending}>
          <Save className="h-3 w-3 mr-1" />
          {upsertMut.isPending ? t("Đang lưu...") : t("Lưu quyền")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">{t("Đang tải...")}</p>
      ) : (
        <div className="border border-border rounded-md overflow-hidden bg-background">
          <Table>
            <TableHeader>
              <TableRow className="text-xs bg-muted/30">
                <TableHead className="py-2">Resource</TableHead>
                <TableHead className="py-2 text-center w-16">{t("Xem")}</TableHead>
                <TableHead className="py-2 text-center w-16">{t("Tạo")}</TableHead>
                <TableHead className="py-2 text-center w-16">{t("Sửa")}</TableHead>
                <TableHead className="py-2 text-center w-16">{t("Xóa")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RESOURCE_SECTIONS.map((section) => (
                <Fragment key={section.section}>
                  <TableRow className="bg-blue-50 hover:bg-blue-50">
                    <TableCell colSpan={5} className="py-1.5 font-semibold text-[11px] uppercase text-blue-900">
                      {t(section.section)}
                    </TableCell>
                  </TableRow>
                  {section.items.map((r) => (
                    <TableRow key={r.value} className="text-sm">
                      <TableCell className="py-1.5">{t(r.label)}</TableCell>
                      {(["v", "c", "e", "d"] as const).map((act) => (
                        <TableCell key={act} className="py-1.5 text-center">
                          <Checkbox
                            checked={matrix[r.value]?.[act] ?? false}
                            onCheckedChange={() => toggle(r.value, act)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
