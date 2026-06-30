import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@/lib/database.types";
import { sumRosterPax, type KhachLePax } from "@/lib/khach-le-calc";

export type DoanKhachLe = Database["public"]["Tables"]["doan_khach_le"]["Row"];
export type DoanKhachLeInsert = Database["public"]["Tables"]["doan_khach_le"]["Insert"];
export type DoanKhachLePatch = Omit<Database["public"]["Tables"]["doan_khach_le"]["Update"], "id">;

const QK = "doan_khach_le";

export function useDoanKhachLeList(doanId: number | null | undefined) {
  return useQuery<DoanKhachLe[]>({
    queryKey: [QK, doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_khach_le")
        .select("*")
        .eq("doan_id", doanId!)
        .order("id", { ascending: true });
      if (error) throw error;
      return data as DoanKhachLe[];
    },
  });
}

export function useCreateDoanKhachLe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DoanKhachLeInsert) => {
      const { data, error } = await externalSupabase
        .from("doan_khach_le")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as DoanKhachLe;
    },
    onSuccess: (row) => qc.invalidateQueries({ queryKey: [QK, row.doan_id] }),
  });
}

export function useUpdateDoanKhachLe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doanId: _doanId, ...patch }: DoanKhachLePatch & { id: number; doanId: number }) => {
      void _doanId;
      const { error } = await externalSupabase.from("doan_khach_le").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: [QK, vars.doanId] }),
  });
}

export function useDeleteDoanKhachLe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; doanId: number }) => {
      const { error } = await externalSupabase.from("doan_khach_le").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: [QK, vars.doanId] }),
  });
}

// Đọc tươi roster → tổng số khách theo loại (để sync doan.so_khach_*).
export async function fetchRosterPax(
  doanId: number,
): Promise<{ lon: number; em1: number; em2: number }> {
  const { data, error } = await externalSupabase
    .from("doan_khach_le")
    .select("so_khach_lon, so_khach_em1, so_khach_em2")
    .eq("doan_id", doanId);
  if (error) throw error;
  return sumRosterPax((data ?? []) as KhachLePax[]);
}

// Sync doan.so_khach_* = tổng roster khách lẻ. Plain update (KHÔNG cascade chi phí —
// đoàn ghép chia chi phí riêng, làm phase sau). T/L (so_khach_tl) giữ nguyên.
// CHỈ dùng cho đoàn ghép (roster là nguồn duy nhất của số khách) — nếu không sẽ
// ghi đè số khách nhập tay của đoàn trọn gói.
export async function syncDoanPaxFromRoster(doanId: number): Promise<void> {
  const pax = await fetchRosterPax(doanId);
  const { data: d } = await externalSupabase
    .from("doan")
    .select("so_khach_tl")
    .eq("id", doanId)
    .maybeSingle();
  const tl = d?.so_khach_tl ?? 0;
  const { error } = await externalSupabase
    .from("doan")
    .update({
      so_khach_lon: pax.lon,
      so_khach_em1: pax.em1,
      so_khach_em2: pax.em2,
      so_khach: pax.lon + pax.em1 + pax.em2 + tl,
    })
    .eq("id", doanId);
  if (error) throw error;
}
