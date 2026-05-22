import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TravelGroup {
  id: string;
  name: string;
  created_at: string;
  // Named columns used by the (currently unused) GroupDrawer/GroupTable views.
  // Declared explicitly so consumers type-check without an `any` index signature.
  ten_doan: string;
  hdv: string | null;
  so_khach: number | null;
  ngay_di: string | null;
  ngay_ve: string | null;
  ghi_chu: string | null;
  [key: string]: unknown;
}
// `ten_doan` stays required so consumers (GroupDrawer form state) can call
// string methods on it without an undefined check.
export type TravelGroupInsert = Partial<TravelGroup> & { ten_doan: string };
export type TravelGroupUpdate = Partial<TravelGroup>;

// `travel_groups` is not present in the generated Database types; use an
// untyped client view so these queries type-check without an `any` schema.
const db = externalSupabase as unknown as SupabaseClient;

export function useTravelGroups() {
  return useQuery({
    queryKey: ["travel_groups"],
    queryFn: async () => {
      const { data, error } = await db
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
      const { data, error } = await db.from("travel_groups").insert(group).select().single();
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
      const { data, error } = await db.from("travel_groups").update(updates).eq("id", id).select().single();
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
      const { error } = await db.from("travel_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["travel_groups"] }),
  });
}
