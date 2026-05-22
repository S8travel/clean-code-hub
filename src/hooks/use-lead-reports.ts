import { externalSupabase } from "@/lib/supabase-external";
import { useQuery } from "@tanstack/react-query";

export interface LeadReportFilter {
  from: string;        // 'YYYY-MM-DD'
  to: string;          // 'YYYY-MM-DD'
  loai_tour?: string | null;
  van_phong_id?: number | null;
}

export interface FunnelRow      { trang_thai: string; cnt: number; }
export interface NguonRow       { nguon: string; total_lead: number; chot_deal: number; }
export interface SalesRow {
  user_id: string;
  ho_ten: string | null;
  total_lead: number;
  dang_xu_ly: number;
  chot_deal: number;
  mat_khach: number;
}
export interface LyDoMatRow     { ly_do: string; cnt: number; }

const rpcParams = (
  f: LeadReportFilter,
): { p_from: string; p_to: string; p_loai_tour?: string; p_van_phong_id?: number } => ({
  p_from:         f.from,
  p_to:           f.to,
  p_loai_tour:    (f.loai_tour || null) as string | undefined,
  p_van_phong_id: (f.van_phong_id ?? null) as number | undefined,
});

export function useLeadFunnel(filter: LeadReportFilter | null) {
  return useQuery({
    queryKey: ["lead_funnel", filter],
    enabled: !!filter,
    queryFn: async () => {
      const { data, error } = await externalSupabase.rpc("get_lead_funnel", rpcParams(filter!));
      if (error) throw error;
      return (data ?? []).map((r) => ({ trang_thai: r.trang_thai, cnt: Number(r.cnt) })) as FunnelRow[];
    },
  });
}

export function useLeadByNguon(filter: LeadReportFilter | null) {
  return useQuery({
    queryKey: ["lead_by_nguon", filter],
    enabled: !!filter,
    queryFn: async () => {
      const { data, error } = await externalSupabase.rpc("get_lead_by_nguon", rpcParams(filter!));
      if (error) throw error;
      return (data ?? []).map((r) => ({
        nguon: r.nguon,
        total_lead: Number(r.total_lead),
        chot_deal: Number(r.chot_deal),
      })) as NguonRow[];
    },
  });
}

export function useLeadBySales(filter: LeadReportFilter | null) {
  return useQuery({
    queryKey: ["lead_by_sales", filter],
    enabled: !!filter,
    queryFn: async () => {
      const { data, error } = await externalSupabase.rpc("get_lead_by_sales", rpcParams(filter!));
      if (error) throw error;
      return (data ?? []).map((r) => ({
        user_id:    r.user_id,
        ho_ten:     r.ho_ten,
        total_lead: Number(r.total_lead),
        dang_xu_ly: Number(r.dang_xu_ly),
        chot_deal:  Number(r.chot_deal),
        mat_khach:  Number(r.mat_khach),
      })) as SalesRow[];
    },
  });
}

export function useLeadLyDoMat(filter: LeadReportFilter | null) {
  return useQuery({
    queryKey: ["lead_ly_do_mat", filter],
    enabled: !!filter,
    queryFn: async () => {
      const { data, error } = await externalSupabase.rpc("get_lead_ly_do_mat", rpcParams(filter!));
      if (error) throw error;
      return (data ?? []).map((r) => ({ ly_do: r.ly_do, cnt: Number(r.cnt) })) as LyDoMatRow[];
    },
  });
}
