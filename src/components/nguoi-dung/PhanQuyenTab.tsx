import { useState, useEffect, Fragment } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  useRolePermissions, useUpsertRolePermissions,
  type RolePermission,
} from "@/hooks/use-permissions";
import { toast } from "sonner";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";
import { VAI_TRO_OPTS, RESOURCES, ACTIONS, RESOURCE_SECTIONS } from "./constants";

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

export function PhanQuyenTab() {
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
      onError: (e: unknown) => toast.error(t("Lỗi: ") + errMsg(e)),
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
              <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/40 w-[260px] z-20">{t("Resource")}</th>
              {VAI_TRO_OPTS.map((role) => (
                <th key={role.value} colSpan={4} className="px-2 py-2 font-medium text-center border-l whitespace-nowrap">
                  {t(role.label)}
                  {role.value === "admin" && <span className="ml-1 text-[10px] text-muted-foreground">{t("(tất cả)")}</span>}
                  {role.value === "specialist" && <span className="ml-1 text-[10px] text-muted-foreground">{t("(per-user)")}</span>}
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
