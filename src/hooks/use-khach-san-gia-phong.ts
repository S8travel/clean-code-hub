import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";
import type { GiaPhongRow } from "@/lib/khach-san-gia-phong";

export type { GiaPhongRow };

const QK = "khach_san_gia_phong";

/** Danh sách dòng giá phòng của 1 khách sạn. Dòng "Mặc định" (không cận ngày)
 *  xếp trước, rồi theo tu_ngay. */
export function useKhachSanGiaPhong(ksId?: number | null) {
  return useQuery({
    queryKey: [QK, ksId],
    enabled: !!ksId,
    queryFn: async (): Promise<GiaPhongRow[]> => {
      const { data, error } = await externalSupabase
        .from("khach_san_gia_phong")
        .select("*")
        .eq("khach_san_id", ksId!)
        .order("tu_ngay", { ascending: true, nullsFirst: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return data as GiaPhongRow[];
    },
  });
}

export function useCreateGiaPhong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TablesInsert<"khach_san_gia_phong">) => {
      const { data, error } = await externalSupabase
        .from("khach_san_gia_phong")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as GiaPhongRow;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: [QK, vars.khach_san_id] }),
  });
}

export function useUpdateGiaPhong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: number; khach_san_id: number } & Omit<TablesUpdate<"khach_san_gia_phong">, "id">) => {
      // patch còn khach_san_id (set lại chính nó — vô hại) → tránh biến unused.
      const { error } = await externalSupabase
        .from("khach_san_gia_phong")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: [QK, vars.khach_san_id] }),
  });
}

export function useDeleteGiaPhong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; khach_san_id: number }) => {
      const { error } = await externalSupabase
        .from("khach_san_gia_phong")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: [QK, vars.khach_san_id] }),
  });
}
