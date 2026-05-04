import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface VanPhongRow {
  id: number;
  ten: string;
  dia_chi: string | null;
  ghi_chu: string | null;
  active: boolean;
}

export function useVanPhongList() {
  return useQuery({
    queryKey: ["van_phong"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("van_phong")
        .select("*")
        .order("ten");
      if (error) throw error;
      return data as VanPhongRow[];
    },
  });
}

export function useCreateVanPhong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<VanPhongRow, "id">) => {
      const { data, error } = await externalSupabase
        .from("van_phong")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as VanPhongRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["van_phong"] }),
  });
}

export function useUpdateVanPhong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<VanPhongRow> & { id: number }) => {
      const { data, error } = await externalSupabase
        .from("van_phong")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as VanPhongRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["van_phong"] }),
  });
}

export function useDeleteVanPhong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("van_phong")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["van_phong"] });
      qc.invalidateQueries({ queryKey: ["nguoi-dung-list"] });
    },
  });
}
