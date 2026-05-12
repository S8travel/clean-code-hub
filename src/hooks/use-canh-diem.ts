import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface CanhDiem {
  id: number;
  ten: string;
  dia_diem: string | null;
  gia_mac_dinh: number | null;
  don_vi: string | null;
  co_phi: boolean | null;
  ghi_chu: string | null;
  thong_tin_chung: string | null;
  nguoi_thanh_toan: string | null;
  icon: string | null;
  loai: string | null;
  ten_nha_cung_cap: string | null;
  so_dien_thoai: string | null;
  email: string | null;
  tai_khoan_thanh_toan: string | null;
  nha_cung_cap_id: number | null;
  khach_san_id: number | null;
  created_at: string;
}

const QK = "canh_diem_list";

export function useCanhDiemList() {
  return useQuery<CanhDiem[]>({
    queryKey: [QK],
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("canh_diem")
        .select("*")
        .order("ten", { ascending: true });
      if (error) throw error;
      return data as CanhDiem[];
    },
  });
}

export function useCreateCanhDiem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { ten: string; loai?: string; dia_diem?: string; nha_cung_cap_id?: number | null }) => {
      const { data, error } = await externalSupabase
        .from("canh_diem")
        .insert({
          ten: params.ten,
          loai: params.loai || "canh_diem",
          dia_diem: params.dia_diem || null,
          nha_cung_cap_id: params.nha_cung_cap_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as CanhDiem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateCanhDiem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; updates: Record<string, any> }) => {
      const { error } = await externalSupabase
        .from("canh_diem")
        .update(params.updates)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteCanhDiem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("canh_diem")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}
