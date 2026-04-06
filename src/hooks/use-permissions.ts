import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { useAuth } from "@/hooks/use-auth";

export type PermAction = "view" | "create" | "edit" | "delete";
export type Resource =
  | "doan"
  | "chi_phi"
  | "dntt"
  | "danh_muc"
  | "seri"
  | "thanh_toan_dk"
  | "cong_no"
  | "hoa_don_unc"
  | "nguoi_dung";

export interface RolePermission {
  id: number;
  role: string;
  resource: Resource;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export function useRolePermissions() {
  return useQuery({
    queryKey: ["role_permissions"],
    staleTime: 1000 * 60 * 5, // 5 phút
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("role_permissions")
        .select("*")
        .order("role")
        .order("resource");
      if (error) throw error;
      return data as RolePermission[];
    },
  });
}

/** Trả về true/false cho action của current user trên resource */
export function usePermission(resource: Resource, action: PermAction): boolean {
  const { user } = useAuth();
  const { data: perms = [] } = useRolePermissions();

  if (!user) return false;
  if (user.role === "admin") return true;

  const row = perms.find((p) => p.role === user.role && p.resource === resource);
  if (!row) return false;

  if (action === "view") return row.can_view;
  if (action === "create") return row.can_create;
  if (action === "edit") return row.can_edit;
  if (action === "delete") return row.can_delete;
  return false;
}

/** Mutation để admin lưu toàn bộ matrix quyền */
export function useUpsertRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Omit<RolePermission, "id">[]) => {
      const { error } = await externalSupabase
        .from("role_permissions")
        .upsert(rows, { onConflict: "role,resource" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role_permissions"] }),
  });
}
