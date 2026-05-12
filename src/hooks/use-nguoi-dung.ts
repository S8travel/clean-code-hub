import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export type VaiTro = "admin" | "giam_doc" | "truong_phong" | "specialist" | "nhan_vien_cao_cap" | "nhan_vien";
export type BoPhan = "dieu_hanh" | "ke_toan" | "sales" | "cong_tac_vien";

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: VaiTro;
  ho_ten: string | null;
  email: string | null;
  so_dien_thoai: string | null;
  bo_phan: BoPhan | null;
  van_phong_id: number | null;
  phan_loai_tour: string[] | null;
  ghi_chu: string | null;
  active: boolean;
  password_hash: string | null;
  created_at: string;
}

export function useNguoiDungList() {
  return useQuery({
    queryKey: ["nguoi-dung-list"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .select("*")
        .order("ho_ten");
      if (error) throw error;
      return data as UserRoleRow[];
    },
  });
}

export function useNguoiDungByEmail(email: string | null) {
  return useQuery({
    queryKey: ["nguoi-dung-email", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .select("*")
        .eq("email", email!)
        .maybeSingle();
      if (error) throw error;
      return data as UserRoleRow | null;
    },
  });
}

export function useNguoiDungByUserId(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["nguoi-dung-uid", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as UserRoleRow | null;
    },
  });
}

export function useNguoiDungByEmailFull(email: string | null) {
  return useQuery({
    queryKey: ["nguoi-dung-email-full", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .select("*")
        .eq("email", email!)
        .maybeSingle();
      if (error) throw error;
      return data as UserRoleRow | null;
    },
  });
}

export function useCreateNguoiDung() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<UserRoleRow, "id" | "created_at">) => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as UserRoleRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nguoi-dung-list"] });
    },
  });
}

export function useUpdateNguoiDung() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<UserRoleRow> & { id: string }) => {
      const { data, error } = await externalSupabase
        .from("user_roles")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as UserRoleRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nguoi-dung-list"] });
      qc.invalidateQueries({ queryKey: ["nguoi-dung-email"] });
    },
  });
}

export function useSetUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hash }: { id: string; hash: string }) => {
      const { error } = await externalSupabase
        .from("user_roles")
        .update({ password_hash: hash })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nguoi-dung-list"] });
      qc.invalidateQueries({ queryKey: ["nguoi-dung-email"] });
    },
  });
}

export function useDeleteNguoiDung() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await externalSupabase
        .from("user_roles")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nguoi-dung-list"] });
    },
  });
}

export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ho_ten, so_dien_thoai }: { userId: string; ho_ten: string; so_dien_thoai: string | null }) => {
      const { error } = await externalSupabase
        .from("user_roles")
        .update({ ho_ten, so_dien_thoai })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["nguoi-dung-uid", vars.userId] });
      qc.invalidateQueries({ queryKey: ["current-user-profile"] });
      qc.invalidateQueries({ queryKey: ["nguoi-dung-list"] });
    },
  });
}
