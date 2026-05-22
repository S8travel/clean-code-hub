import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  computeNextAction, CHANNEL_TO_LOAI, TERMINAL_STAGES,
  type CadenceRow, type LnaOutcome,
} from "@/lib/lead-next-action";

export interface NextAction {
  id: number;
  lead_id: number;
  channel: string;
  reason: string | null;
  due_at: string;
  priority: string;
  suggested_script: string | null;
  source: string; // auto | manual
  status: string; // pending | snoozed | done | skipped
  done_at: string | null;
  outcome: string | null;
  outcome_note: string | null;
  created_at: string;
}

const ACTIVE = ["pending", "snoozed"];

// ── Cadence config (đọc 1 lần, ít đổi) ──────────────────────────────────────
export function useCadence() {
  return useQuery({
    queryKey: ["lead_cadence"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead_cadence").select("*").eq("active", true);
      if (error) throw error;
      return data as CadenceRow[];
    },
  });
}

// ── Next action active của 1 lead ───────────────────────────────────────────
export function useNextAction(leadId: number | null) {
  return useQuery({
    queryKey: ["lead_next_action", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead_next_action")
        .select("*")
        .eq("lead_id", leadId!)
        .in("status", ACTIVE)
        .order("due_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as NextAction) ?? null;
    },
  });
}

// ── "Việc hôm nay": next action active của lead mình phụ trách ──────────────
export interface MyNextActionRow extends NextAction {
  lead: {
    id: number; ho_ten: string; so_dien_thoai: string | null;
    trang_thai: string; assigned_to: string | null;
  };
}
export function useMyNextActions(userId: string | null) {
  return useQuery({
    queryKey: ["my_next_actions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead_next_action")
        .select("*, lead:lead_id!inner(id, ho_ten, so_dien_thoai, trang_thai, assigned_to)")
        .in("status", ACTIVE)
        .eq("lead.assigned_to", userId!)
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MyNextActionRow[];
    },
  });
}

export function useMyOverdueCount(userId: string | null) {
  return useQuery({
    queryKey: ["my_next_actions_overdue", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await externalSupabase
        .from("lead_next_action")
        .select("id, lead:lead_id!inner(assigned_to)", { count: "exact", head: true })
        .in("status", ACTIVE)
        .eq("lead.assigned_to", userId!)
        .lt("due_at", new Date().toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// ── Sync engine (THUẦN async, không phải hook) — dùng cả ở mutation & lifecycle
// Tạo/làm mới 1 next action active cho lead. Tôn trọng source='manual'.
export async function syncNextAction(leadId: number): Promise<void> {
  const { data: lead } = await externalSupabase
    .from("lead")
    .select("trang_thai, do_not_contact, ngay_lien_he_cuoi, created_at")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;

  const { data: existing } = await externalSupabase
    .from("lead_next_action")
    .select("id, source, status")
    .eq("lead_id", leadId)
    .in("status", ACTIVE)
    .maybeSingle();

  // Sale đã tự tạo/sửa → engine KHÔNG đụng
  if (existing && existing.source === "manual") return;

  const deactivate = async () => {
    if (existing) {
      await externalSupabase
        .from("lead_next_action")
        .update({ status: "skipped" })
        .eq("id", existing.id);
    }
  };

  if (lead.do_not_contact || TERMINAL_STAGES.includes(lead.trang_thai)) {
    await deactivate();
    return;
  }

  const { data: cadence } = await externalSupabase
    .from("lead_cadence").select("*").eq("active", true);

  // Mốc bắt đầu stage: ngay_lien_he_cuoi → activity đổi-status mới nhất → created_at
  let stageStartAt: string = lead.ngay_lien_he_cuoi || lead.created_at || new Date().toISOString();
  const { data: lastStatusAct } = await externalSupabase
    .from("lead_activity")
    .select("created_at")
    .eq("lead_id", leadId)
    .eq("loai", "doi_trang_thai")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastStatusAct?.created_at && !lead.ngay_lien_he_cuoi) {
    stageStartAt = lastStatusAct.created_at;
  }

  // Số touch outbound trong stage hiện tại (kể từ stageStart)
  const { count: touchCount } = await externalSupabase
    .from("lead_activity")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("direction", "outbound")
    .gte("created_at", stageStartAt);

  // Outcome gần nhất (từ action đã done)
  const { data: lastDone } = await externalSupabase
    .from("lead_next_action")
    .select("outcome")
    .eq("lead_id", leadId)
    .eq("status", "done")
    .order("done_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const draft = computeNextAction({
    trangThai: lead.trang_thai,
    doNotContact: !!lead.do_not_contact,
    touchesInStage: touchCount ?? 0,
    stageStartAt,
    lastOutcome: (lastDone?.outcome as LnaOutcome) ?? null,
    cadence: (cadence ?? []) as CadenceRow[],
  });

  if (!draft) {
    await deactivate();
    return;
  }

  await deactivate();
  await externalSupabase.from("lead_next_action").insert({
    lead_id: leadId,
    channel: draft.channel,
    reason: draft.reason,
    due_at: draft.due_at,
    priority: draft.priority,
    suggested_script: draft.suggested_script,
    source: "auto",
    status: "pending",
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return (leadId: number) => {
    qc.invalidateQueries({ queryKey: ["lead_next_action", leadId] });
    qc.invalidateQueries({ queryKey: ["my_next_actions"] });
    qc.invalidateQueries({ queryKey: ["my_next_actions_overdue"] });
    qc.invalidateQueries({ queryKey: ["lead_activities", leadId] });
    qc.invalidateQueries({ queryKey: ["lead", leadId] });
  };
}

// Hoàn tất action + log activity + cập nhật counter + sync action kế tiếp
export function useCompleteAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: {
      actionId: number; leadId: number; channel: string;
      outcome: LnaOutcome; note?: string | null;
      durationSeconds?: number | null; createdBy?: string | null;
    }) => {
      await externalSupabase.from("lead_next_action").update({
        status: "done", done_at: new Date().toISOString(),
        outcome: p.outcome, outcome_note: p.note ?? null,
      }).eq("id", p.actionId);

      await externalSupabase.from("lead_activity").insert({
        lead_id: p.leadId,
        loai: CHANNEL_TO_LOAI[p.channel] ?? "ghi_chu_noi_bo",
        noi_dung: p.note ?? null,
        channel: p.channel,
        direction: "outbound",
        outcome: p.outcome,
        duration_seconds: p.durationSeconds ?? null,
        next_action_id: p.actionId,
        created_by: p.createdBy ?? null,
      });

      // Counter (đọc rồi cộng — đủ cho Phase A, không cần atomic)
      const { data: l } = await externalSupabase
        .from("lead").select("total_touches").eq("id", p.leadId).maybeSingle();
      await externalSupabase.from("lead").update({
        total_touches: (l?.total_touches ?? 0) + 1,
        last_touched_at: new Date().toISOString(),
      }).eq("id", p.leadId);

      await syncNextAction(p.leadId);
    },
    onSuccess: (_, v) => invalidate(v.leadId),
  });
}

export function useSnoozeAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: { actionId: number; leadId: number; days: number; dueAt: string }) => {
      const next = new Date(new Date(p.dueAt).getTime() + p.days * 86400_000).toISOString();
      await externalSupabase.from("lead_next_action")
        .update({ due_at: next, status: "snoozed" }).eq("id", p.actionId);
    },
    onSuccess: (_, v) => invalidate(v.leadId),
  });
}

export function useSkipAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: { actionId: number; leadId: number }) => {
      await externalSupabase.from("lead_next_action")
        .update({ status: "skipped" }).eq("id", p.actionId);
      await syncNextAction(p.leadId);
    },
    onSuccess: (_, v) => invalidate(v.leadId),
  });
}

// Sale tự tạo/đổi — set source='manual' để engine không ghi đè
export function useSetManualAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (p: {
      leadId: number; existingId: number | null;
      channel: string; due_at: string; priority: string; reason: string;
    }) => {
      if (p.existingId) {
        await externalSupabase.from("lead_next_action")
          .update({ status: "skipped" }).eq("id", p.existingId);
      }
      await externalSupabase.from("lead_next_action").insert({
        lead_id: p.leadId, channel: p.channel, reason: p.reason,
        due_at: p.due_at, priority: p.priority,
        source: "manual", status: "pending",
      });
    },
    onSuccess: (_, v) => invalidate(v.leadId),
  });
}

// Tạo lần đầu khi mở drawer mà lead chưa có action (lazy backfill)
export function useEnsureNextAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (leadId: number) => { await syncNextAction(leadId); },
    onSuccess: (_, leadId) => invalidate(leadId),
  });
}
