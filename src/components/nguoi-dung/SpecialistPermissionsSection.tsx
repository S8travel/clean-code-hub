import { useState, useEffect, Fragment } from "react";
import { Shield, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useUserPermissions, useUpsertUserPermissions,
  type UserPermission, type Resource,
} from "@/hooks/use-permissions";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";
import { RESOURCES, RESOURCE_SECTIONS } from "./constants";

// Ref ổn định cho default rỗng — tránh tạo [] mới mỗi render (loop effect).
const EMPTY_USER_PERMS: UserPermission[] = [];

export function SpecialistPermissionsSection({ userId }: { userId: string }) {
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
      toast.error(t("Lỗi: ") + (errMsg(err) || t("Không lưu được")));
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
                <TableHead className="py-2">{t("Resource")}</TableHead>
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
