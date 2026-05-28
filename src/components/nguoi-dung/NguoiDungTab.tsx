import { useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useNguoiDungList,
  useCreateNguoiDung,
} from "@/hooks/use-nguoi-dung";
import { THI_TRUONG_OPTS } from "@/hooks/use-doan";
import { useVanPhongList } from "@/hooks/use-van-phong";
import { useLogActivity } from "@/hooks/use-activity-log";
import { toast } from "sonner";
import { t, useTranslate } from "@/lib/i18n";
import { VAI_TRO_LABEL, BO_PHAN_OPTS, emptyForm } from "./constants";
import { UserDetailPanel } from "./UserDetailPanel";

export function NguoiDungTab() {
  useTranslate();
  const { data: list = [], isLoading } = useNguoiDungList();
  const { data: vanPhongList } = useVanPhongList();
  const createMut = useCreateNguoiDung();
  const logActivity = useLogActivity();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const filtered = list.filter((u) =>
    (u.ho_ten ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const selected = list.find((u) => u.id === selectedId) ?? null;

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
                placeholder={t("Email...")}
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
                        {u.phan_loai_tour.map((tt) => THI_TRUONG_OPTS.find((o) => o.value === tt)?.label ?? tt).join(", ")}
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
        <UserDetailPanel
          key={selected.id}
          selected={selected}
          vanPhongList={vanPhongList ?? []}
          onDeleted={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
