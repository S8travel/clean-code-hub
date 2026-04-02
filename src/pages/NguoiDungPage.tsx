import { useState, useEffect } from "react";
import { Plus, Search, Trash2, Save, Users, ShieldAlert, LogIn } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  useNguoiDungList,
  useNguoiDungByEmail,
  useCreateNguoiDung,
  useUpdateNguoiDung,
  useDeleteNguoiDung,
  type UserRoleRow,
} from "@/hooks/use-nguoi-dung";
import { useCurrentUserEmail } from "@/hooks/use-current-user";
import { toast } from "sonner";

const VAI_TRO_OPTS = [
  { value: "admin", label: "Admin" },
  { value: "nhan_vien", label: "Nhân viên" },
];

const emptyForm = (): Omit<UserRoleRow, "id" | "created_at"> => ({
  user_id: "",
  ho_ten: "",
  email: "",
  role: "nhan_vien",
  so_dien_thoai: null,
  ghi_chu: null,
  active: true,
});

// ── Admin Guard ─────────────────────────────────────────────────────────────

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { email, setEmail } = useCurrentUserEmail();
  const [inputEmail, setInputEmail] = useState("");
  const { data: currentUser, isLoading } = useNguoiDungByEmail(email);

  if (!email) {
    return (
      <div className="flex flex-1 items-center justify-center h-[calc(100vh-3rem)]">
        <div className="w-full max-w-sm space-y-4 text-center">
          <LogIn className="h-10 w-10 mx-auto text-muted-foreground opacity-50" />
          <div>
            <h2 className="font-semibold text-base">Nhập email của bạn</h2>
            <p className="text-sm text-muted-foreground mt-1">Để xác định quyền truy cập</p>
          </div>
          <div className="flex gap-2">
            <Input
              className="h-9 text-sm"
              placeholder="email@s8travel.vn"
              type="email"
              value={inputEmail}
              onChange={(e) => setInputEmail(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && inputEmail.trim() && setEmail(inputEmail.trim().toLowerCase())
              }
            />
            <Button
              className="h-9 text-sm shrink-0"
              onClick={() => inputEmail.trim() && setEmail(inputEmail.trim().toLowerCase())}
            >
              Xác nhận
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center h-[calc(100vh-3rem)]">
        <p className="text-sm text-muted-foreground">Đang kiểm tra quyền...</p>
      </div>
    );
  }

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center h-[calc(100vh-3rem)]">
        <div className="text-center space-y-3">
          <ShieldAlert className="h-12 w-12 mx-auto text-destructive opacity-60" />
          <div>
            <h2 className="font-semibold text-base">Không có quyền truy cập</h2>
            <p className="text-sm text-muted-foreground mt-1">Trang này chỉ dành cho Admin.</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Đang đăng nhập với: <span className="font-medium">{email}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEmail(null)}>
            Đổi tài khoản
          </Button>
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
  const { data: list = [], isLoading } = useNguoiDungList();
  const createMut = useCreateNguoiDung();
  const updateMut = useUpdateNguoiDung();
  const deleteMut = useDeleteNguoiDung();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [form, setForm] = useState<Omit<UserRoleRow, "id" | "created_at">>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<UserRoleRow | null>(null);
  const [dirty, setDirty] = useState(false);

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
        so_dien_thoai: selected.so_dien_thoai,
        ghi_chu: selected.ghi_chu,
        active: selected.active,
      });
      setDirty(false);
    }
  }, [selectedId, list]);

  const set = (field: keyof Omit<UserRoleRow, "id" | "created_at">, value: any) => {
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
      toast.success("Đã thêm người dùng");
    } catch (e: any) {
      if (e?.code === "23505") {
        toast.error("Email đã tồn tại");
      } else {
        toast.error("Lỗi khi tạo người dùng");
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
      toast.success("Đã lưu");
    } catch (e: any) {
      if (e?.code === "23505") {
        toast.error("Email đã tồn tại");
      } else {
        toast.error("Lỗi khi lưu");
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      toast.success("Đã xóa");
    } catch {
      toast.error("Lỗi khi xóa");
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* ── Left: danh sách ── */}
      <div className="w-72 shrink-0 border-r flex flex-col bg-card">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Người dùng</h2>
            <Button
              size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => setShowCreate(!showCreate)}
            >
              <Plus className="h-3 w-3 mr-1" /> Thêm
            </Button>
          </div>

          {showCreate && (
            <div className="space-y-1.5 rounded-md border p-2">
              <Input
                className="h-7 text-xs"
                placeholder="Họ tên..."
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
                  Tạo
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => { setShowCreate(false); setNewName(""); setNewEmail(""); }}
                >
                  Hủy
                </Button>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-7 text-xs pl-7"
              placeholder="Tìm theo tên, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Chưa có người dùng</div>
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
                    <span className="truncate">{u.ho_ten ?? "(Chưa có tên)"}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {!u.active && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1">Ẩn</Badge>
                      )}
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className="text-[10px] h-4 px-1"
                      >
                        {u.role === "admin" ? "Admin" : "NV"}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {u.email ?? "—"}
                  </p>
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
            <p>Chọn một người dùng để xem chi tiết</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold">{selected.ho_ten ?? "(Chưa có tên)"}</h1>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="destructive" className="h-8 text-xs"
                  onClick={() => setDeleteTarget(selected)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa
                </Button>
                <Button
                  size="sm" className="h-8 text-xs"
                  onClick={handleSave}
                  disabled={!dirty || updateMut.isPending}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {updateMut.isPending ? "Đang lưu..." : "Lưu"}
                </Button>
              </div>
            </div>

            {/* Thông tin */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Họ tên <span className="text-destructive">*</span></Label>
                <Input
                  className="h-8 text-sm"
                  value={form.ho_ten ?? ""}
                  onChange={(e) => set("ho_ten", e.target.value || null)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Vai trò</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => set("role", v as "admin" | "nhan_vien")}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAI_TRO_OPTS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  Dùng để gửi email trực tiếp từ hệ thống
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Số điện thoại</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="VD: 0901234567"
                  value={form.so_dien_thoai ?? ""}
                  onChange={(e) => set("so_dien_thoai", e.target.value || null)}
                />
              </div>

              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Kích hoạt</p>
                  <p className="text-[11px] text-muted-foreground">Tài khoản có thể đăng nhập</p>
                </div>
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => set("active", v)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                className="text-sm min-h-[80px] resize-none"
                placeholder="Ghi chú thêm..."
                value={form.ghi_chu ?? ""}
                onChange={(e) => set("ghi_chu", e.target.value || null)}
              />
            </div>

            <div className="text-[11px] text-muted-foreground border-t pt-3">
              Ngày tạo: {new Date(selected.created_at).toLocaleDateString("vi-VN")}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa người dùng?</AlertDialogTitle>
            <AlertDialogDescription>
              Xóa <strong>{deleteTarget?.ho_ten}</strong> ({deleteTarget?.email}). Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
