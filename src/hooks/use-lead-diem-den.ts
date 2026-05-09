import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface LeadDiemDen {
  id: number;
  lead_id: number;
  diem_den: string;
  created_at: string;
}

export function useLeadDiemDen(leadId: number | null) {
  return useQuery({
    queryKey: ["lead_diem_den", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead_diem_den")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at");
      if (error) throw error;
      return data as LeadDiemDen[];
    },
  });
}

// Replace full list atomically: delete all → insert new
export function useReplaceDiemDen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      diemDenList,
    }: {
      leadId: number;
      diemDenList: string[];
    }) => {
      const { error: delErr } = await externalSupabase
        .from("lead_diem_den")
        .delete()
        .eq("lead_id", leadId);
      if (delErr) throw delErr;

      if (diemDenList.length > 0) {
        const rows = diemDenList.map((diem_den) => ({ lead_id: leadId, diem_den }));
        const { error: insErr } = await externalSupabase
          .from("lead_diem_den")
          .insert(rows);
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["lead_diem_den", vars.leadId] });
      // Invalidate lead detail so diem_den join refreshes
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
