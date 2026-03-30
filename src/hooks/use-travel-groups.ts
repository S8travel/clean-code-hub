import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface TravelGroup {
  id: string;
  name: string;
  created_at: string;
  [key: string]: any;
}
export type TravelGroupInsert = Partial<TravelGroup>;
export type TravelGroupUpdate = Partial<TravelGroup>;

export function useTravelGroups() {
  return useQuery({
    queryKey: ["travel_groups"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("travel_groups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TravelGroup[];
    },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (group: TravelGroupInsert) => {
      const { data, error } = await externalSupabase.from("travel_groups").insert(group).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["travel_groups"] }),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TravelGroupUpdate & { id: string }) => {
      const { data, error } = await externalSupabase.from("travel_groups").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["travel_groups"] }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await externalSupabase.from("travel_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["travel_groups"] }),
  });
}
