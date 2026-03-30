import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";

type TravelGroup = Database["public"]["Tables"]["travel_groups"]["Row"];
type TravelGroupInsert = Database["public"]["Tables"]["travel_groups"]["Insert"];
type TravelGroupUpdate = Database["public"]["Tables"]["travel_groups"]["Update"];

export type { TravelGroup, TravelGroupInsert, TravelGroupUpdate };

export function useTravelGroups() {
  return useQuery({
    queryKey: ["travel_groups"],
    queryFn: async () => {
      const { data, error } = await supabase
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
      const { data, error } = await supabase.from("travel_groups").insert(group).select().single();
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
      const { data, error } = await supabase.from("travel_groups").update(updates).eq("id", id).select().single();
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
      const { error } = await supabase.from("travel_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["travel_groups"] }),
  });
}
