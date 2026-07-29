import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { useAuth } from "@/hooks/use-auth";

export type PermAction = "view" | "create" | "edit" | "delete";
export type Resource =
  // Khách hàng
  | "lead"
  | "bao_cao_lead"
  // Quản lý đoàn
  | "dashboard"
  | "my_job"
  | "so_tay"
  | "doan"
  | "theo_doi"
  | "xep_hdv"
  | "lock_phong"
  | "invoice"
  | "bao_gia"
  | "chi_phi"
  // Danh mục
  | "danh_muc"
  | "seri"
  // Hệ thống
  | "dntt"
  | "hoan_ung"
  | "thanh_toan_dk"
  | "hoa_don_unc"
  | "cong_no"
  | "nguoi_dung"
  | "agent"
  | "phan_cong_team";

export interface RolePermission {
  id: number;
  role: string;
  resource: Resource;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface UserPermission {
  id: string;
  user_id: string;
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

/** Quyền per-user (chỉ áp dụng cho role=specialist) */
export function useUserPermissions(userId?: string | null) {
  return useQuery({
    queryKey: ["user_permissions", userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("user_permissions")
        .select("*")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data || []) as UserPermission[];
    },
  });
}

/** Trả về true/false cho action của current user trên resource */
export function usePermission(resource: Resource, action: PermAction): boolean {
  const { user } = useAuth();
  const { data: perms = [] } = useRolePermissions();
  const { data: userPerms = [] } = useUserPermissions(
    user?.role === "specialist" ? user.user_id : null,
  );

  if (!user) return false;
  if (user.role === "admin") return true;

  // Specialist: chỉ check user_permissions (per-user override), KHÔNG dùng role matrix
  if (user.role === "specialist") {
    const row = userPerms.find((p) => p.resource === resource);
    if (!row) return false;
    if (action === "view") return row.can_view;
    if (action === "create") return row.can_create;
    if (action === "edit") return row.can_edit;
    if (action === "delete") return row.can_delete;
    return false;
  }

  const row = perms.find((p) => p.role === user.role && p.resource === resource);
  if (!row) return false;

  if (action === "view") return row.can_view;
  if (action === "create") return row.can_create;
  if (action === "edit") return row.can_edit;
  if (action === "delete") return row.can_delete;
  return false;
}

/**
 * Tài khoản chỉ xem (`user_roles.chi_xem`) — mọi thao tác ghi bị khóa.
 *
 * Khác `usePermission(x, "edit")`: cờ này là lớp CHẶN toàn cục, độc lập ma trận
 * quyền, và được enforce thật ở DB (RLS restrictive + guard RPC). Dùng nó để
 * disable UI cho đúng, đừng dùng nó làm lớp bảo mật.
 */
export function useIsReadOnly(): boolean {
  const { user } = useAuth();
  return !!user?.chi_xem;
}

const ROLE_LEVELS: Record<string, number> = {
  nhan_vien: 1,
  nhan_vien_cao_cap: 2,
  specialist: 3,       // mới — giữa nv_cao_cap và truong_phong
  truong_phong: 4,
  giam_doc: 5,
  admin: 6,
};

/**
 * Tài khoản chỉ xem được nâng lên tầm nhìn `giam_doc` cho 2 cổng theo vai trò
 * (`useRoleAtLeast` / `useBoPhan`).
 *
 * Lý do: 2 cổng đó chỉ dùng để gate QUYỀN XEM TRANG (Tổng quan, Theo dõi, Xếp
 * HDV, Invoice, Báo cáo Lead, ĐNTT, HĐ&UNC) và menu tương ứng — không chỗ nào
 * dùng chúng để gate thao tác. Tài khoản chỉ xem không ghi được gì (RLS chặn ở
 * DB), nên để nó rớt ở cổng vai trò chỉ khiến "được xem toàn bộ" thành sai.
 * Cổng thật của tài khoản này là ma trận resource (`usePermission`).
 *
 * KHÔNG nâng tới `admin`: đó là quyền quản trị thật (vd trang Voucher), giữ
 * nguyên để menu và trang không lệch nhau.
 */
const CHI_XEM_LEVEL = 5; // = giam_doc

/** Trả về true nếu role của user >= minRole trong hierarchy */
export function useRoleAtLeast(minRole: string): boolean {
  const { user } = useAuth();
  if (!user) return false;
  const level = Math.max(
    ROLE_LEVELS[user.role] ?? 0,
    user.chi_xem ? CHI_XEM_LEVEL : 0,
  );
  return level >= (ROLE_LEVELS[minRole] ?? 999);
}

/** Trả về true nếu user thuộc boPhan chỉ định, hoặc là admin / tài khoản chỉ xem */
export function useBoPhan(boPhan: string): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.chi_xem) return true;
  return user.bo_phan === boPhan;
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

/** Mutation lưu quyền per-user cho 1 specialist (full upsert / delete missing) */
export function useUpsertUserPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, rows }: { userId: string; rows: Omit<UserPermission, "id" | "user_id">[] }) => {
      // Xóa hết rồi insert lại — đơn giản, đảm bảo không còn record cũ thừa
      const { error: delErr } = await externalSupabase
        .from("user_permissions")
        .delete()
        .eq("user_id", userId);
      if (delErr) throw delErr;
      const inserts = rows
        .filter((r) => r.can_view || r.can_create || r.can_edit || r.can_delete)
        .map((r) => ({ user_id: userId, ...r }));
      if (inserts.length === 0) return;
      const { error } = await externalSupabase.from("user_permissions").insert(inserts);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["user_permissions", vars.userId] });
    },
  });
}
