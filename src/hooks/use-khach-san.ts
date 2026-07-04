import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface KhachSan {
  id: number;
  ten: string;
  dia_chi: string | null;
  dia_diem: string | null;
  email: string | null;
  so_dien_thoai: string | null;
  website: string | null;
  tai_khoan_thanh_toan: string | null;
  thong_tin_chung: string | null;
  nguoi_thanh_toan: string | null;
  foc_khach: number | null;
  foc_mien: number | null;
  nha_cung_cap_id: number | null;
  ten_zh: string | null;
  dia_diem_zh: string | null;
  thanh_toan_dinh_ky_mac_dinh: boolean;
}

const QK = "khach_san_list";

export function useKhachSanList() {
  return useQuery<KhachSan[]>({
    queryKey: [QK],
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("khach_san")
        .select("*")
        .order("ten", { ascending: true });
      if (error) throw error;
      return data as KhachSan[];
    },
  });
}

export function useCreateKhachSan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ten: string; nha_cung_cap_id?: number; dia_diem?: string }) => {
      const { data, error } = await externalSupabase
        .from("khach_san")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as KhachSan;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateKhachSan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<KhachSan> & { id: number }) => {
      const { error } = await externalSupabase
        .from("khach_san")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteKhachSan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("khach_san")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}
