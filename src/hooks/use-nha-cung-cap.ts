import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface NhaCungCap {
  id: number;
  ten: string;
  ma_so_thue: string | null;
  email: string | null;
  so_dien_thoai: string | null;
  dia_diem: string | null;
  dia_chi: string | null;
  ngan_hang: string | null;
  so_tai_khoan: string | null;
  tai_khoan_thanh_toan: string | null;
  ghi_chu: string | null;
  created_at: string;
}

const QK = "nha_cung_cap_list";

export function useNhaCungCapList() {
  return useQuery<NhaCungCap[]>({
    queryKey: [QK],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_cung_cap")
        .select("*")
        .order("ten", { ascending: true });
      if (error) throw error;
      return data as NhaCungCap[];
    },
  });
}

export function useCreateNhaCungCap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ten: string }) => {
      const { data, error } = await externalSupabase
        .from("nha_cung_cap")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as NhaCungCap;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateNhaCungCap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<NhaCungCap> & { id: number }) => {
      const { error } = await externalSupabase
        .from("nha_cung_cap")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteNhaCungCap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("nha_cung_cap")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}
