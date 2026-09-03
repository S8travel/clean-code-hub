import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { externalSupabase, EXTERNAL_SUPABASE_URL } from "@/lib/supabase-external";
import type { BaoGomBuaAn } from "@/lib/bao-gia-ai-resolve";

// Bảng bao_gia_rule còn mới (chưa vào database.types) → client untyped cục bộ,
// giống pattern use-bao-gia-aliases.
const db = externalSupabase as unknown as SupabaseClient;

const QK = "bao_gia_rules";

/** 1 quy tắc đã dạy (bảng bao_gia_rule) + tên KS join để hiển thị. */
export interface BaoGiaRuleRow {
  id: number;
  loai: string;
  khach_san_id: number | null;
  bua: BaoGomBuaAn | null;
  gia_phong: number | null;
  mo_ta_goc: string | null;
  dien_giai: string | null;
  tao_luc: string;
  khach_san: { ten: string } | null;
}

/** Danh sách quy tắc đang hiệu lực (mới nhất trước). */
export function useBaoGiaRuleList(enabled = true) {
  return useQuery({
    queryKey: [QK],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<BaoGiaRuleRow[]> => {
      const { data, error } = await db
        .from("bao_gia_rule")
        .select("id, loai, khach_san_id, bua, gia_phong, mo_ta_goc, dien_giai, tao_luc, khach_san:khach_san_id(ten)")
        .eq("active", true)
        .order("tao_luc", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BaoGiaRuleRow[];
    },
  });
}

// Ba hook GHI quy tắc (dạy qua chat, lưu, ngưng dùng) đã gỡ 03/09/2026 cùng với
// khung chat trong màn AI import: bảng bao_gia_rule chưa từng có dòng nào sau
// nhiều tháng chạy, tức là không ai dùng được nó. Bảng, edge fn `bao-gia-teach-rule`
// và `applyKsBuaRules` vẫn còn — quy tắc nào có sẵn thì vẫn được áp bình thường.
