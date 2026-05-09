import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface LeadCampaign {
  id: number;
  ten: string;
  nguon: string | null;
  loai_tour: string | null;
  ngay_bat_dau: string | null;
  ngay_ket_thuc: string | null;
  ngan_sach: number | null;
  ghi_chu: string | null;
  active: boolean;
  created_at: string;
}

export interface LeadCampaignInsert {
  ten: string;
  nguon?: string | null;
  loai_tour?: string | null;
  ngay_bat_dau?: string | null;
  ngay_ket_thuc?: string | null;
  ngan_sach?: number | null;
  ghi_chu?: string | null;
  active?: boolean;
}

export function useCampaignList(params?: { active?: boolean }) {
  return useQuery({
    queryKey: ["lead_campaigns", params ?? null],
    queryFn: async () => {
      let query = externalSupabase
        .from("lead_campaign")
        .select("*")
        .order("ngay_bat_dau", { ascending: false });

      if (params?.active !== undefined) {
        query = query.eq("active", params.active);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as LeadCampaign[];
    },
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LeadCampaignInsert) => {
      const { data, error } = await externalSupabase
        .from("lead_campaign")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as LeadCampaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_campaigns"] }),
  });
}

export function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadCampaignInsert> & { id: number }) => {
      const { data, error } = await externalSupabase
        .from("lead_campaign")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as LeadCampaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_campaigns"] }),
  });
}
