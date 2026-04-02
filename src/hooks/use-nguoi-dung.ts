import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export type VaiTro = "admin" | "truong_phong" | "giam_doc" | "nhan_vien_cao_cap" | "nhan_vien";
export type BoPhan = "dieu_hanh" | "ke_toan";

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: VaiTro;
  ho_ten: string | null;
  email: string | null;
  so_dien_thoai: string | null;
  bo_phan: BoPhan | null;
  ghi_chu: string | null;
  active: boolean;
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
