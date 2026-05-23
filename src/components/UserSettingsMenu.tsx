import { useState } from "react";
import { Settings, User, KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useUpdateUserProfile, type UserRoleRow } from "@/hooks/use-nguoi-dung";
import { externalSupabase } from "@/lib/supabase-external";
import { useCurrentSession } from "@/hooks/use-current-user";
import { t, useTranslate } from "@/lib/i18n";

// ── Thông tin cá nhân ──────────────────────────────────────────────────────

function ThongTinCaNhanDialog({ user, open, onOpenChange }: {
  user: UserRoleRow | null | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  useTranslate();
  const { session } = useCurrentSession();
  const updateMut = useUpdateUserProfile();
  const [hoTen, setHoTen] = useState(user?.ho_ten ?? "");
  const [sdt, setSdt] = useState(user?.so_dien_thoai ?? "");

  const handleOpen = (v: boolean) => {
    if (v) {
      setHoTen(user?.ho_ten ?? "");
      setSdt(user?.so_dien_thoai ?? "");
    }
    onOpenChange(v);
  };

  const handleSave = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    try {
      await updateMut.mutateAsync({ userId, ho_ten: hoTen.trim(), so_dien_thoai: sdt.trim() || null });
      toast.success(t("Đã cập nhật thông tin"));
      onOpenChange(false);
    } catch {
      toast.error(t("Lỗi cập nhật thông tin"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Thông tin cá nhân")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t("Email")}</Label>
            <Input value={user?.email ?? session?.user?.email ?? ""} disabled className="h-8 text-sm bg-muted" />
          </div>
          <div>
            <Label className="text-xs">{t("Họ tên")}</Label>
            <Input
              value={hoTen}
              onChange={(e) => setHoTen(e.target.value)}
              className="h-8 text-sm"
              placeholder={t("Nhập họ tên")}
            />
          </div>
          <div>
            <Label className="text-xs">{t("Số điện thoại")}</Label>
            <Input
              value={sdt}
              onChange={(e) => setSdt(e.target.value)}
              className="h-8 text-sm"
              placeholder={t("Nhập số điện thoại")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t("Hủy")}</Button>
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>{t("Lưu")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Đổi mật khẩu ──────────────────────────────────────────────────────────

function DoiMatKhauDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  useTranslate();
  const [matKhauMoi, setMatKhauMoi] = useState("");
  const [xacNhan, setXacNhan] = useState("");
  const [loading, setLoading] = useState(false);

  const handleOpen = (v: boolean) => {
    if (!v) { setMatKhauMoi(""); setXacNhan(""); }
    onOpenChange(v);
  };

  const handleSave = async () => {
    if (matKhauMoi.length < 6) { toast.warning(t("Mật khẩu tối thiểu 6 ký tự")); return; }
    if (matKhauMoi !== xacNhan) { toast.warning(t("Mật khẩu xác nhận không khớp")); return; }
    setLoading(true);
    try {
      const { error } = await externalSupabase.auth.updateUser({ password: matKhauMoi });
      if (error) throw error;
      toast.success(t("Đã đổi mật khẩu"));
      handleOpen(false);
    } catch {
      toast.error(t("Lỗi đổi mật khẩu"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Đổi mật khẩu")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">{t("Mật khẩu mới")}</Label>
            <Input
              type="password"
              value={matKhauMoi}
              onChange={(e) => setMatKhauMoi(e.target.value)}
              className="h-8 text-sm"
              placeholder={t("Tối thiểu 6 ký tự")}
            />
          </div>
          <div>
            <Label className="text-xs">{t("Xác nhận mật khẩu")}</Label>
            <Input
              type="password"
              value={xacNhan}
              onChange={(e) => setXacNhan(e.target.value)}
              className="h-8 text-sm"
              placeholder={t("Nhập lại mật khẩu mới")}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => handleOpen(false)}>{t("Hủy")}</Button>
          <Button size="sm" onClick={handleSave} disabled={loading}>{t("Đổi mật khẩu")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  user: UserRoleRow | null | undefined;
  onLogout: () => void;
  collapsed?: boolean;
}

export function UserSettingsMenu({ user, onLogout, collapsed = false }: Props) {
  useTranslate();
  const [showProfile, setShowProfile] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            title={t("Cài đặt")}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align={collapsed ? "center" : "end"} className="w-44">
          <DropdownMenuItem onClick={() => setShowProfile(true)}>
            <User className="h-3.5 w-3.5 mr-2" />
            {t("Thông tin cá nhân")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowPassword(true)}>
            <KeyRound className="h-3.5 w-3.5 mr-2" />
            {t("Đổi mật khẩu")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
            <LogOut className="h-3.5 w-3.5 mr-2" />
            {t("Đăng xuất")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ThongTinCaNhanDialog user={user} open={showProfile} onOpenChange={setShowProfile} />
      <DoiMatKhauDialog open={showPassword} onOpenChange={setShowPassword} />
    </>
  );
}
