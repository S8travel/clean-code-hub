import { useState } from "react";
import { Trash2, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useUpdateNguoiDung, useDeleteNguoiDung,
  type UserRoleRow, type VaiTro, type BoPhan,
} from "@/hooks/use-nguoi-dung";
import { THI_TRUONG_OPTS } from "@/hooks/use-doan";
import { type VanPhongRow } from "@/hooks/use-van-phong";
import { useLogActivity } from "@/hooks/use-activity-log";
import { useAuth } from "@/hooks/use-auth";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";
import { toast } from "sonner";
import { t, useTranslate } from "@/lib/i18n";
import { VAI_TRO_OPTS, BO_PHAN_OPTS, THI_TRUONG_GROUPS } from "./constants";
import { SpecialistPermissionsSection } from "./SpecialistPermissionsSection";

type DetailForm = Omit<UserRoleRow, "id" | "created_at">;

const formFrom = (u: UserRoleRow): DetailForm => ({
  user_id: u.user_id,
  ho_ten: u.ho_ten,
  email: u.email,
  role: u.role,
  bo_phan: u.bo_phan,
  van_phong_id: u.van_phong_id,
  van_phong_ids: u.van_phong_ids,
  phan_loai_tour: u.phan_loai_tour,
  so_dien_thoai: u.so_dien_thoai,
  ghi_chu: u.ghi_chu,
  active: u.active,
  chi_xem: u.chi_xem,
  password_hash: u.password_hash,
});

interface Props {
  selected: UserRoleRow;
  vanPhongList: VanPhongRow[];
  onDeleted: () => void;
}

// Parent remounts via key={selected.id} → form khởi tạo từ initializer, không cần effect sync.
export function UserDetailPanel({ selected, vanPhongList, onDeleted }: Props) {
  useTranslate();
  const { user: me } = useAuth();
  // Chỉ admin/giám đốc được cấp quyền truy cập đa-VP cho NV.
  const canGrantVp = me?.role === "admin" || me?.role === "giam_doc";
  const updateMut = useUpdateNguoiDung();
  const deleteMut = useDeleteNguoiDung();
  const logActivity = useLogActivity();

  const [form, setForm] = useState<DetailForm>(() => formFrom(selected));
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);

  const set = <K extends keyof DetailForm>(field: K, value: UserRoleRow[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!form.ho_ten?.trim() || !form.email?.trim()) return;
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
    if (!newPass) return;
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
    try {
      const name = selected.ho_ten;
      await deleteMut.mutateAsync(selected.id);
      logActivity.mutate({ action: "xoa", table_name: "user_roles", record_id: selected.id, mo_ta: `Xóa tài khoản ${name}` });
      setConfirmDelete(false);
      onDeleted();
      toast.success(t("Đã xóa"));
    } catch {
      toast.error(t("Lỗi khi xóa"));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{selected.ho_ten ?? t("(Chưa có tên)")}</h1>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="destructive" className="h-8 text-xs"
              onClick={() => setConfirmDelete(true)}
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
                <span>{form.van_phong_id == null ? t("— Không có —") : vanPhongList.find((vp) => vp.id === form.van_phong_id)?.ten ?? t("Chọn văn phòng")}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("— Không có —")}</SelectItem>
                {vanPhongList.map((vp) => (
                  <SelectItem key={vp.id} value={String(vp.id)}>{vp.ten}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canGrantVp && (
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">{t("Văn phòng được truy cập")}</Label>
              {(form.role === "admin" || form.role === "giam_doc") ? (
                <p className="text-[11px] text-muted-foreground py-1">
                  {t("Admin / giám đốc đã thấy mọi văn phòng — không cần gán.")}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 py-1">
                    {vanPhongList.map((vp) => {
                      const isHome = vp.id === form.van_phong_id;
                      const checked = isHome || (form.van_phong_ids ?? []).includes(vp.id);
                      return (
                        <label key={vp.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
                          <Checkbox
                            checked={checked}
                            disabled={isHome}
                            onCheckedChange={(v) => {
                              const current = form.van_phong_ids ?? [];
                              const next = v
                                ? [...current, vp.id]
                                : current.filter((x) => x !== vp.id);
                              set("van_phong_ids", next.length > 0 ? next : null);
                            }}
                          />
                          {vp.ten}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t("VP nhà (ở trên) luôn được truy cập. Tích thêm VP khác để xem/sửa chéo.")}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">{t("Mảng phụ trách")}</Label>
            <div className="space-y-2 py-1">
              {THI_TRUONG_GROUPS.map((group) => {
                const opts = THI_TRUONG_OPTS.filter((o) => o.loai_tour === group.loai_tour);
                return (
                  <div key={group.loai_tour} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{t(group.label)}</span>
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
            <Label className="text-xs">{t("Email")} <span className="text-destructive">*</span></Label>
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
              placeholder={t("VD: 0901234567")}
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

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">{t("Chỉ xem")}</p>
              <p className="text-[11px] text-muted-foreground">
                {t("Khóa mọi thao tác thêm/sửa/xóa (chặn tận DB)")}
              </p>
            </div>
            <Switch
              checked={form.chi_xem}
              onCheckedChange={(v) => set("chi_xem", v)}
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

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Xóa người dùng?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Xóa")} <strong>{selected.ho_ten}</strong> ({selected.email}). {t("Hành động này không thể hoàn tác.")}
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
