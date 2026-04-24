import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface TeamRow {
  id: number;
  ten_team: string;
  created_at: string;
}

export interface TeamAgentRow {
  id: number;
  team_id: number;
  agent_id: number;
}

export interface TeamTaskAssignmentRow {
  id: number;
  team_id: number;
  task_type: string;
  user_id: string;
  created_at: string;
}

const QK = {
  teams: ["teams"] as const,
  teamAgents: (teamId: number) => ["team_agents", teamId] as const,
  allTeamAgents: ["all_team_agents"] as const,
  teamTaskAssignments: (teamId: number) => ["team_task_assignments", teamId] as const,
  myAssignments: (userId: string) => ["my_team_assignments", userId] as const,
};

export function useTeamList() {
  return useQuery({
    queryKey: QK.teams,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("teams")
        .select("id, ten_team, created_at")
        .order("id");
      if (error) throw error;
      return data as TeamRow[];
    },
  });
}

export function useTeamAgents(teamId?: number) {
  return useQuery({
    queryKey: teamId ? QK.teamAgents(teamId) : (["team_agents_none"] as const),
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("team_agents")
        .select("id, team_id, agent_id")
        .eq("team_id", teamId!);
      if (error) throw error;
      return data as TeamAgentRow[];
    },
  });
}

export function useAllTeamAgents() {
  return useQuery({
    queryKey: QK.allTeamAgents,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("team_agents")
        .select("team_id, agent_id");
      if (error) throw error;
      return data as { team_id: number; agent_id: number }[];
    },
  });
}

export function useTeamTaskAssignments(teamId?: number) {
  return useQuery({
    queryKey: teamId ? QK.teamTaskAssignments(teamId) : (["team_task_assignments_none"] as const),
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("team_task_assignments")
        .select("id, team_id, task_type, user_id, created_at")
        .eq("team_id", teamId!);
      if (error) throw error;
      return data as TeamTaskAssignmentRow[];
    },
  });
}

export function useMyTeamAssignments(userId?: string) {
  return useQuery({
    queryKey: userId ? QK.myAssignments(userId) : (["my_team_assignments_none"] as const),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("team_task_assignments")
        .select("team_id, task_type")
        .eq("user_id", userId!);
      if (error) throw error;
      return data as { team_id: number; task_type: string }[];
    },
  });
}

export function useAddTeamAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ team_id, agent_id }: { team_id: number; agent_id: number }) => {
      const { error } = await externalSupabase
        .from("team_agents")
        .insert({ team_id, agent_id });
      if (error) throw error;
    },
    onSuccess: (_, { team_id }) => {
      qc.invalidateQueries({ queryKey: QK.teamAgents(team_id) });
      qc.invalidateQueries({ queryKey: QK.allTeamAgents });
    },
  });
}

export function useDeleteTeamAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, team_id }: { id: number; team_id: number }) => {
      const { error } = await externalSupabase
        .from("team_agents")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { team_id }) => {
      qc.invalidateQueries({ queryKey: QK.teamAgents(team_id) });
      qc.invalidateQueries({ queryKey: QK.allTeamAgents });
    },
  });
}

export function useAddTeamTaskAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ team_id, task_type, user_id }: { team_id: number; task_type: string; user_id: string }) => {
      const { error } = await externalSupabase
        .from("team_task_assignments")
        .insert({ team_id, task_type, user_id });
      if (error) throw error;
    },
    onSuccess: (_, { team_id }) => {
      qc.invalidateQueries({ queryKey: QK.teamTaskAssignments(team_id) });
      qc.invalidateQueries({ queryKey: QK.allTeamAgents });
    },
  });
}

export function useDeleteTeamTaskAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, team_id }: { id: number; team_id: number }) => {
      const { error } = await externalSupabase
        .from("team_task_assignments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { team_id }) => {
      qc.invalidateQueries({ queryKey: QK.teamTaskAssignments(team_id) });
    },
  });
}
