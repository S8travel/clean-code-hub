import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TablesUpdate } from "@/lib/database.types";

export interface ChuyenBay {
  id: number;
  ma_bay: string;
  hang_bay: string | null;
  chang: string | null;
  gio_di: string | null;
  gio_den: string | null;
  ghi_chu: string | null;
  created_at: string;
}

const QK = "chuyen_bay_list";

/** Chuỗi snapshot điền vào doan.chuyen_bay_don/tien khi OP chọn — vd "BR397 19:00 - 20:55". */
export function formatChuyenBay(cb: Pick<ChuyenBay, "ma_bay" | "gio_di" | "gio_den">): string {
  const gio = [cb.gio_di, cb.gio_den].filter(Boolean).join(" - ");
  return [cb.ma_bay, gio].filter(Boolean).join(" ").trim();
}

/** Nhãn hiển thị trong dropdown — gồm cả hãng/chặng cho dễ chọn. */
export function chuyenBayLabel(cb: ChuyenBay): string {
  return [cb.ma_bay, cb.hang_bay, cb.chang, formatChuyenBay(cb) !== cb.ma_bay ? [cb.gio_di, cb.gio_den].filter(Boolean).join("-") : ""]
    .filter(Boolean)
    .join(" · ");
}

export function useChuyenBayList() {
  return useQuery<ChuyenBay[]>({
    queryKey: [QK],
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("chuyen_bay")
        .select("*")
        .order("ma_bay", { ascending: true });
      if (error) throw error;
      return data as ChuyenBay[];
    },
  });
}

export function useCreateChuyenBay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      ma_bay: string;
      hang_bay?: string | null;
      chang?: string | null;
      gio_di?: string | null;
      gio_den?: string | null;
      ghi_chu?: string | null;
    }) => {
      const { data, error } = await externalSupabase
        .from("chuyen_bay")
        .insert({
          ma_bay: params.ma_bay,
          hang_bay: params.hang_bay || null,
          chang: params.chang || null,
          gio_di: params.gio_di || null,
          gio_den: params.gio_den || null,
          ghi_chu: params.ghi_chu || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ChuyenBay;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateChuyenBay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; updates: TablesUpdate<"chuyen_bay"> }) => {
      const { error } = await externalSupabase
        .from("chuyen_bay")
        .update(params.updates)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteChuyenBay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase.from("chuyen_bay").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}
