import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ThongBaoRow {
  id: number;
  user_id: string;
  log_id: number | null;
  doan_id: number | null;
  doan_ten: string | null;
  loai: string;
  tieu_de: string;
  noi_dung: string | null;
  is_read: boolean;
  created_at: string;
}

const QK = "thong_bao";

export function useThongBaoList(userId: string | null | undefined) {
  return useQuery<ThongBaoRow[]>({
    queryKey: [QK, userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("thong_bao")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ThongBaoRow[];
    },
  });
}

export function useThongBaoCount(userId: string | null | undefined, loai?: string) {
  return useQuery<number>({
    queryKey: [QK, "count", userId, loai],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = externalSupabase
        .from("thong_bao")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("is_read", false);
      if (loai) q = q.eq("loai", loai);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkThongBaoRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, loai }: { userId: string; loai?: string }) => {
      let q = externalSupabase
        .from("thong_bao")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
      if (loai) q = q.eq("loai", loai);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}
