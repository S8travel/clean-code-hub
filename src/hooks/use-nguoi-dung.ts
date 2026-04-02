import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface NguoiDungRow {
  id: number;
  ten: string;
  email: string;
  vai_tro: "admin" | "nhan_vien";
  so_dien_thoai: string | null;
  ghi_chu: string | null;
  active: boolean;
  created_at: string;
}

export function useNguoiDungList() {
  return useQuery({
    queryKey: ["nguoi-dung-list"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nguoi_dung")
        .select("*")
        .order("ten");
      if (error) throw error;
      return data as NguoiDungRow[];
    },
  });
}

export function useNguoiDungByEmail(email: string | null) {
  return useQuery({
    queryKey: ["nguoi-dung-email", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nguoi_dung")
        .select("*")
        .eq("email", email!)
        .maybeSingle();
      if (error) throw error;
      return data as NguoiDungRow | null;
    },
  });
}

export function useCreateNguoiDung() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<NguoiDungRow, "id" | "created_at">) => {
      const { data, error } = await externalSupabase
        .from("nguoi_dung")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as NguoiDungRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nguoi-dung-list"] });
    },
  });
}

export function useUpdateNguoiDung() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<NguoiDungRow> & { id: number }) => {
      const { data, error } = await externalSupabase
        .from("nguoi_dung")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as NguoiDungRow;
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
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("nguoi_dung")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nguoi-dung-list"] });
    },
  });
}
