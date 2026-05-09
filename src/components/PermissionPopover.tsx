import { useState } from "react";
import { X, Plus, Shield } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useDoanPermissions,
  useAddDoanPermission,
  useRemoveDoanPermission,
  useUserRoles,
} from "@/hooks/use-doan";
import type { UserRole } from "@/hooks/use-doan";

interface Props {
  doanId: number;
  doanCode: string;
  children: React.ReactNode;
}

export function PermissionPopover({ doanId, doanCode, children }: Props) {
  const { data: permissions, isLoading } = useDoanPermissions(doanId);
  const { data: userRoles } = useUserRoles();
  const addPerm = useAddDoanPermission();
  const removePerm = useRemoveDoanPermission();

  const [selectedUser, setSelectedUser] = useState("");
  const [open, setOpen] = useState(false);

  const existingUserIds = new Set(permissions?.map((p) => p.user_id) ?? []);
  const availableUsers = userRoles?.filter((u) => !existingUserIds.has(u.user_id)) ?? [];

  const handleAdd = async () => {
    if (!selectedUser) return;
    const user = userRoles?.find((u) => u.user_id === selectedUser);
    if (!user) return;
    await addPerm.mutateAsync({
      doan_id: doanId,
      user_id: user.user_id,
      ho_ten: user.ho_ten,
    });
    setSelectedUser("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border/40">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-[hsl(var(--brand))]" />
            Phân quyền đoàn
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{doanCode}</p>
        </div>

        <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Đang tải...</p>
          ) : permissions?.length === 0 ? (
            <p className="text-xs text-muted-foreground">Chưa có ai được phân quyền.</p>
          ) : (
            permissions?.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                    {(p.ho_ten || "?").charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm truncate">{p.ho_ten || p.user_id.substring(0, 8)}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant="secondary" className="text-[10px]">{p.quyen}</Badge>
                  <button
                    onClick={() => removePerm.mutate({ id: p.id, doan_id: doanId })}
                    className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-border/40">
          <div className="flex items-center gap-2">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <span>{availableUsers.find((u) => u.user_id === selectedUser)?.ho_ten ?? "Chọn người..."}</span>
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.ho_ten}
                  </SelectItem>
                ))}
                {availableUsers.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Không còn người khả dụng</div>
                )}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 shrink-0"
              disabled={!selectedUser || addPerm.isPending}
              onClick={handleAdd}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Thêm
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
