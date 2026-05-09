import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface LeadTask {
  id: number;
  lead_id: number;
  mo_ta: string;
  deadline: string | null;
  hoan_thanh: boolean;
  hoan_thanh_luc: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LeadTaskWithLead extends LeadTask {
  lead: { id: number; ho_ten: string; so_dien_thoai: string | null } | null;
}

export interface LeadTaskInsert {
  lead_id: number;
  mo_ta: string;
  deadline?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
}

// Tasks for a specific lead — pending first, then by deadline ASC
export function useLeadTasks(leadId: number | null) {
  return useQuery({
    queryKey: ["lead_tasks", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead_task")
        .select("*")
        .eq("lead_id", leadId!)
        .order("hoan_thanh", { ascending: true })
        .order("deadline", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as LeadTask[];
    },
  });
}

// My open tasks across all leads — overdue float to top via deadline ASC nulls last
export function useMyOpenTasks(userId: string | null) {
  return useQuery({
    queryKey: ["my_open_tasks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead_task")
        .select("*, lead:lead_id(id, ho_ten, so_dien_thoai)")
        .eq("assigned_to", userId!)
        .eq("hoan_thanh", false)
        .order("deadline", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data as LeadTaskWithLead[];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LeadTaskInsert) => {
      const { data, error } = await externalSupabase
        .from("lead_task")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as LeadTask;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead_tasks", vars.lead_id] });
      if (vars.assigned_to) {
        qc.invalidateQueries({ queryKey: ["my_open_tasks", vars.assigned_to] });
      }
    },
  });
}

export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      hoan_thanh,
    }: {
      id: number;
      hoan_thanh: boolean;
      lead_id: number;
      assigned_to: string | null;
    }) => {
      const { error } = await externalSupabase
        .from("lead_task")
        .update({
          hoan_thanh,
          hoan_thanh_luc: hoan_thanh ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead_tasks", vars.lead_id] });
      if (vars.assigned_to) {
        qc.invalidateQueries({ queryKey: ["my_open_tasks", vars.assigned_to] });
      }
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: number;
      lead_id: number;
      assigned_to: string | null;
    }) => {
      const { error } = await externalSupabase.from("lead_task").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead_tasks", vars.lead_id] });
      if (vars.assigned_to) {
        qc.invalidateQueries({ queryKey: ["my_open_tasks", vars.assigned_to] });
      }
    },
  });
}
