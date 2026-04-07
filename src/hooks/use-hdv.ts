import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface HDVRow {
  id: number;
  ten: string;
  gioi_tinh: string | null;   // "nam" | "nu" | "khac"
  nam_sinh: number | null;
  kinh_nghiem: string | null;
  chuyen_mon: string | null;
  agent_ids: number[] | null;
  ghi_chu: string | null;
  so_dien_thoai: string | null;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
}

export function useHDVList() {
  return useQuery({
    queryKey: ["hdv-list"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("huong_dan_vien")
        .select("*")
        .order("ten");
      if (error) throw error;
      return data as HDVRow[];
    },
  });
}

export function useCreateHDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<HDVRow, "id">) => {
      const { data, error } = await externalSupabase
        .from("huong_dan_vien")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as HDVRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hdv-list"] });
      qc.invalidateQueries({ queryKey: ["huong_dan_vien"] });
    },
  });
}

export function useUpdateHDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<HDVRow> & { id: number }) => {
      const { data, error } = await externalSupabase
        .from("huong_dan_vien")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as HDVRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hdv-list"] });
      qc.invalidateQueries({ queryKey: ["huong_dan_vien"] });
    },
  });
}

export function useDeleteHDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("huong_dan_vien")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hdv-list"] });
      qc.invalidateQueries({ queryKey: ["huong_dan_vien"] });
    },
  });
}
