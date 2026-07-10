import { useQuery, useMutation } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { useAuth } from "@/hooks/use-auth";

// activity_log.action là cột text, KHÔNG có CHECK constraint (đã kiểm trên prod)
// → thêm giá trị mới an toàn. NhatKyTab render qua ACTION_LABEL[x] ?? x nên
// giá trị lạ cũng không vỡ UI.
export type ActivityAction =
  | "tao"
  | "sua"
  | "xoa"
  | "huy"
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
  doan_id: number | null;
  mo_ta: string | null;
  created_at: string;
}

export interface LogActivityVars {
  action: ActivityAction;
  table_name: string;
  record_id?: string | number | null;
  doan_id?: number | null;
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
        user_id: user?.user_id ?? null,
        ho_ten: user?.ho_ten ?? null,
        action: vars.action,
        table_name: vars.table_name,
        record_id: vars.record_id != null ? String(vars.record_id) : null,
        doan_id: vars.doan_id ?? null,
        mo_ta: vars.mo_ta,
      });
      if (error) throw error;
    },
  });
}

// ── Query log theo đoàn ──
export function useDoanActivityLog(doanId: number | undefined) {
  return useQuery({
    queryKey: ["activity_log", "doan", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("activity_log")
        .select("*")
        .eq("doan_id", doanId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ActivityLogRow[];
    },
    staleTime: 15_000,
  });
}

// ── Fire-and-forget audit log (dùng trong onSuccess của mutations) ──
export function buildAuditLogger(userId: string | null | undefined, hoTen: string | null | undefined) {
  return (vars: { doan_id: number; action: ActivityAction; table_name: string; record_id?: number | string | null; mo_ta: string }) => {
    // PostgrestBuilder là thenable LAZY: không await/.then thì request KHÔNG BAO GIỜ
    // được gửi. Trước đây thiếu .then → toàn bộ log chi phí im lặng không ghi gì.
    void externalSupabase
      .from("activity_log")
      .insert({
        user_id: userId ?? null,
        ho_ten: hoTen ?? null,
        doan_id: vars.doan_id,
        action: vars.action,
        table_name: vars.table_name,
        record_id: vars.record_id != null ? String(vars.record_id) : null,
        mo_ta: vars.mo_ta,
      })
      .then(({ error }) => {
        if (error) console.warn("[audit-log] ghi thất bại:", error.message);
      });
  };
}

// ── Hook tiện dụng: trả về logger fire-and-forget gắn sẵn user hiện tại ──
// Dùng trong các section (KS/NH/DV) để khỏi lặp useAuth + buildAuditLogger.
export function useAuditLogger() {
  const { user } = useAuth();
  return buildAuditLogger(user?.user_id, user?.ho_ten);
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
