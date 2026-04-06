import { useQuery, useMutation } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { useAuth } from "@/hooks/use-auth";

export type ActivityAction =
  | "tao"
  | "sua"
  | "xoa"
  | "duyet"
  | "tu_choi"
  | "thanh_toan";

export interface ActivityLogRow {
  id: number;
  user_id: string | null;
  ho_ten: string | null;
  action: ActivityAction;
  table_name: string;
  record_id: string | null;
  mo_ta: string | null;
  created_at: string;
}

export interface LogActivityVars {
  action: ActivityAction;
  table_name: string;
  record_id?: string | number | null;
  mo_ta: string;
}

export interface ActivityLogFilters {
  fromDate?: string | null;
  toDate?: string | null;
  userId?: string | null;
  action?: ActivityAction | null;
  tableName?: string | null;
}

// ── Hook để ghi log ──
export function useLogActivity() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (vars: LogActivityVars) => {
      const { error } = await externalSupabase.from("activity_log").insert({
        user_id: user?.id ?? null,
        ho_ten: user?.ho_ten ?? null,
        action: vars.action,
        table_name: vars.table_name,
        record_id: vars.record_id != null ? String(vars.record_id) : null,
        mo_ta: vars.mo_ta,
      });
      if (error) throw error;
    },
  });
}

// ── Hook để đọc log (cho admin) ──
export function useActivityLogList(filters: ActivityLogFilters = {}) {
  return useQuery({
    queryKey: ["activity_log", filters],
    queryFn: async () => {
      let q = externalSupabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters.fromDate) q = q.gte("created_at", filters.fromDate);
      if (filters.toDate) q = q.lte("created_at", filters.toDate + "T23:59:59");
      if (filters.userId) q = q.eq("user_id", filters.userId);
      if (filters.action) q = q.eq("action", filters.action);
      if (filters.tableName) q = q.eq("table_name", filters.tableName);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ActivityLogRow[];
    },
    staleTime: 30_000,
  });
}
