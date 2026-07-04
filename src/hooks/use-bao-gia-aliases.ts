import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { externalSupabase } from "@/lib/supabase-external";
import type { AliasEntry, AliasLearnInput, MatchTable } from "@/lib/bao-gia-ai-resolve";

// Bảng bao_gia_match_alias còn mới (chưa vào database.types) → dùng client
// untyped cục bộ cho 2 truy vấn này. KHÔNG đụng phần code typed khác.
const db = externalSupabase as unknown as SupabaseClient;

interface AliasRow {
  text_key: string;
  loai: AliasEntry["loai"];
  match_table: MatchTable | null;
  target_id: number | null;
  set_menu_id: number | null;
  ten_hien_thi: string | null;
  gia_override: number | null;
}

/** Bộ nhớ alias đã học → Map<`${text_key}::${loai}`, AliasEntry>. Khớp aliasKeyOf. */
export function useBaoGiaAliasMap(enabled = true) {
  return useQuery({
    queryKey: ["bao_gia_aliases"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, AliasEntry>> => {
      const { data, error } = await db
        .from("bao_gia_match_alias")
        .select("text_key, loai, match_table, target_id, set_menu_id, ten_hien_thi, gia_override");
      if (error) throw error;
      const map = new Map<string, AliasEntry>();
      for (const row of (data ?? []) as AliasRow[]) {
        map.set(`${row.text_key}::${row.loai}`, {
          loai: row.loai,
          match_table: row.match_table,
          target_id: row.target_id,
          set_menu_id: row.set_menu_id,
          ten_hien_thi: row.ten_hien_thi,
          gia_override: row.gia_override,
        });
      }
      return map;
    },
  });
}

/** Học (upsert) nhiều alias 1 lần qua RPC learn_bao_gia_aliases. */
export function useLearnAliases() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: AliasLearnInput[]) => {
      if (!items.length) return;
      const { error } = await db.rpc("learn_bao_gia_aliases", { items });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bao_gia_aliases"] }); },
  });
}
