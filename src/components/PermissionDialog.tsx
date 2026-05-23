import { useState } from "react";
import { X, Plus, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import {
  useDoanPermissions,
  useAddDoanPermission,
  useRemoveDoanPermission,
  useUserRoles,
} from "@/hooks/use-doan";
import { t, useTranslate } from "@/lib/i18n";

const QUYEN_LABELS: Record<string, string> = {
  view: "Xem",
  edit: "Chỉnh sửa",
  admin: "Admin",
};

const QUYEN_COLORS: Record<string, string> = {
  view: "bg-muted text-muted-foreground",
  edit: "bg-primary/10 text-primary",
  admin: "bg-amber-100 text-amber-700",
};

const AVATAR_BG = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500",
  "bg-pink-500", "bg-cyan-500", "bg-orange-500", "bg-red-500",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface Props {
  doanId: number;
  doanCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PermissionDialog({ doanId, doanCode, open, onOpenChange }: Props) {
  useTranslate();
  const { data: permissions, isLoading } = useDoanPermissions(doanId);
  const { data: userRoles } = useUserRoles();
  const addPerm = useAddDoanPermission();
  const removePerm = useRemoveDoanPermission();

  const [selectedUser, setSelectedUser] = useState("");
  const [selectedQuyen, setSelectedQuyen] = useState("view");

  const existingUserIds = new Set(permissions?.map((p) => p.user_id) ?? []);
  const availableUsers = (userRoles ?? []).filter((u) => !existingUserIds.has(u.user_id));
  const userOptions = availableUsers.map((u) => ({ value: u.user_id, label: u.ho_ten }));

  const handleAdd = async () => {
    if (!selectedUser) return;
    const user = userRoles?.find((u) => u.user_id === selectedUser);
    if (!user) return;
    await addPerm.mutateAsync({
      doan_id: doanId,
      user_id: user.user_id,
      ho_ten: user.ho_ten,
      quyen: selectedQuyen,
    });
    setSelectedUser("");
    setSelectedQuyen("view");
    toast.success(t("Đã cập nhật phân quyền"));
  };

  const handleRemove = async (id: number) => {
    await removePerm.mutateAsync({ id, doan_id: doanId });
    toast.success(t("Đã cập nhật phân quyền"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0" onClick={(e) => e.stopPropagation()}>
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            {t("Phân quyền đoàn")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground truncate">{doanCode}</p>
        </DialogHeader>

        {/* Current permissions list */}
        <div className="px-5 py-4 space-y-2 max-h-[280px] overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">{t("Đang tải...")}</p>
          ) : permissions?.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">{t("Chưa có ai được phân quyền.")}</p>
          ) : (
            permissions?.map((p) => {
              const initials = (p.ho_ten || "?")
                .split(" ")
                .map((w) => w.charAt(0))
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const bg = AVATAR_BG[hashStr(p.ho_ten || "?") % AVATAR_BG.length];

              return (
                <div key={p.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`h-7 w-7 rounded-full ${bg} text-white flex items-center justify-center text-[10px] font-bold shrink-0`}>
                      {initials}
                    </div>
                    <span className="text-sm truncate">{p.ho_ten || p.user_id.substring(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className={`text-[10px] px-2 ${QUYEN_COLORS[p.quyen] || ""}`}>
                      {t(QUYEN_LABELS[p.quyen] || p.quyen)}
                    </Badge>
                    <button
                      onClick={() => handleRemove(p.id)}
                      className="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title={t("Xóa quyền")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Add new permission */}
        <div className="px-5 py-4 border-t border-border/40 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase">{t("Thêm người")}</p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <SearchableSelect
                options={userOptions}
                value={selectedUser}
                onChange={setSelectedUser}
                placeholder={t("Chọn người...")}
                emptyText={t("Không còn người khả dụng")}
              />
            </div>
            <div className="w-[120px] space-y-1">
              <Select value={selectedQuyen} onValueChange={setSelectedQuyen}>
                <SelectTrigger className="h-10 rounded-lg text-xs">
                  <span>{selectedQuyen === "view" ? t("Xem") : selectedQuyen === "edit" ? t("Chỉnh sửa") : ""}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">{t("Xem")}</SelectItem>
                  <SelectItem value="edit">{t("Chỉnh sửa")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="h-10 shrink-0"
              disabled={!selectedUser || addPerm.isPending}
              onClick={handleAdd}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("Thêm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
