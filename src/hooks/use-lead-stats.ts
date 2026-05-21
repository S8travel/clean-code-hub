import { externalSupabase } from "@/lib/supabase-external";
import { useQuery } from "@tanstack/react-query";

export interface LeadStats {
  lead_moi_today: number;
  follow_up_today: number;
  follow_up_overdue: number;
}

const ZERO: LeadStats = { lead_moi_today: 0, follow_up_today: 0, follow_up_overdue: 0 };

// Single-RPC stats — không fetch hết lead list
export function useLeadStats(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["lead_stats", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await externalSupabase.rpc("get_lead_stats", { p_user_id: userId! });
      if (error) throw error;
      const row = (data as LeadStats[] | null)?.[0];
      if (!row) return ZERO;
      return {
        lead_moi_today:    Number(row.lead_moi_today    ?? 0),
        follow_up_today:   Number(row.follow_up_today   ?? 0),
        follow_up_overdue: Number(row.follow_up_overdue ?? 0),
      } as LeadStats;
    },
  });
}
