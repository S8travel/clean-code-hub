import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DoanInsert } from "@/hooks/use-doan";
import { syncNextAction } from "@/hooks/use-lead-next-action";

export type LeadTrangThai =
  | "moi"
  | "da_lien_he"
  | "dang_tu_van"
  | "da_bao_gia"
  | "cho_chot"
  | "chot_deal"
  | "mat_khach";

export interface Lead {
  id: number;
  ho_ten: string;
  so_dien_thoai: string | null;
  email: string | null;
  facebook_url: string | null;
  nguon: string;
  campaign_id: number | null;
  loai_tour: string;
  loai_khach: string | null;
  ten_to_chuc: string | null;
  chuc_vu: string | null;
  so_nguoi_lon: number;
  so_nguoi_em: number;
  ngay_di_du_kien: string | null;
  ngay_ve_du_kien: string | null;
  thang_du_kien: string | null;
  so_ngay: number | null;
  ngan_sach_per_khach: number | null;
  phong_cach: string | null;
  yeu_cau_dac_biet: string | null;
  trang_thai: LeadTrangThai;
  ly_do_mat: string | null;
  uu_tien: string;
  assigned_to: string | null;
  ngay_follow_up_tiep: string | null;
  ngay_lien_he_cuoi: string | null;
  referral_lead_id: number | null;
  doan_id: number | null;
  khach_hang_id: number | null;
  ghi_chu: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  campaign?: { id: number; ten: string } | null;
  diem_den?: { id: number; diem_den: string }[];
}

export interface LeadInsert {
  ho_ten: string;
  so_dien_thoai?: string | null;
  email?: string | null;
  facebook_url?: string | null;
  nguon: string;
  campaign_id?: number | null;
  loai_tour: string;
  loai_khach?: string | null;
  ten_to_chuc?: string | null;
  chuc_vu?: string | null;
  so_nguoi_lon?: number;
  so_nguoi_em?: number;
  ngay_di_du_kien?: string | null;
  ngay_ve_du_kien?: string | null;
  thang_du_kien?: string | null;
  so_ngay?: number | null;
  ngan_sach_per_khach?: number | null;
  phong_cach?: string | null;
  yeu_cau_dac_biet?: string | null;
  trang_thai?: LeadTrangThai;
  ly_do_mat?: string | null;
  uu_tien?: string;
  assigned_to?: string | null;
  ngay_follow_up_tiep?: string | null;
  referral_lead_id?: number | null;
  khach_hang_id?: number | null;
  ghi_chu?: string | null;
  created_by?: string | null;
}

export interface LeadsFilter {
  trang_thai?: LeadTrangThai | null;
  assigned_to?: string | null;
  nguon?: string | null;
  loai_tour?: string | null;
  loai_khach?: string | null;
  search?: string | null;
}

export const LEAD_TRANG_THAI_OPTS: { value: LeadTrangThai; label: string; color: string }[] = [
  { value: "moi",          label: "Mới",           color: "bg-slate-100 text-slate-700" },
  { value: "da_lien_he",   label: "Đã liên hệ",    color: "bg-blue-100 text-blue-700" },
  { value: "dang_tu_van",  label: "Đang tư vấn",   color: "bg-yellow-100 text-yellow-700" },
  { value: "da_bao_gia",   label: "Đã báo giá",    color: "bg-orange-100 text-orange-700" },
  { value: "cho_chot",     label: "Chờ chốt",      color: "bg-purple-100 text-purple-700" },
  { value: "chot_deal",    label: "Chốt deal",     color: "bg-green-100 text-green-700" },
  { value: "mat_khach",    label: "Mất khách",     color: "bg-red-100 text-red-700" },
];

export const LEAD_NGUON_OPTS: { value: string; label: string }[] = [
  { value: "web_form",          label: "Form web public" },
  { value: "facebook_ads",      label: "Facebook Ads" },
  { value: "zalo_oa",           label: "Zalo OA" },
  { value: "website",           label: "Website" },
  { value: "hotline",           label: "Hotline" },
  { value: "walk_in",           label: "Walk-in" },
  { value: "referral",          label: "Giới thiệu" },
  { value: "doi_tac",           label: "Đối tác" },
];

export const LEAD_LOAI_KHACH_OPTS: { value: string; label: string }[] = [
  { value: "ca_nhan",       label: "Cá nhân" },
  { value: "gia_dinh",      label: "Gia đình" },
  { value: "nhom_ban",      label: "Nhóm bạn" },
  { value: "cong_ty",       label: "Công ty" },
  { value: "truong_hoc",    label: "Trường học" },
  { value: "agent_doi_tac", label: "Agent / Đối tác" },
];

export const LEAD_PHONG_CACH_OPTS: { value: string; label: string }[] = [
  { value: "tiet_kiem",  label: "Tiết kiệm" },
  { value: "tieu_chuan", label: "Tiêu chuẩn" },
  { value: "cao_cap",    label: "Cao cấp" },
  { value: "luxury",     label: "Luxury" },
];

export const LEAD_UU_TIEN_OPTS: { value: string; label: string }[] = [
  { value: "cao",        label: "Cao" },
  { value: "trung_binh", label: "Trung bình" },
  { value: "thap",       label: "Thấp" },
];

export function useLeadsList(filter?: LeadsFilter) {
  return useQuery({
    queryKey: ["leads", filter ?? null],
    queryFn: async () => {
      let query = externalSupabase
        .from("lead")
        .select(`
          *,
          campaign:campaign_id(id, ten),
          diem_den:lead_diem_den(id, diem_den)
        `)
        .order("created_at", { ascending: false });

      if (filter?.trang_thai)  query = query.eq("trang_thai", filter.trang_thai);
      if (filter?.assigned_to) query = query.eq("assigned_to", filter.assigned_to);
      if (filter?.nguon)       query = query.eq("nguon", filter.nguon);
      if (filter?.loai_tour)   query = query.eq("loai_tour", filter.loai_tour);
      if (filter?.loai_khach)  query = query.eq("loai_khach", filter.loai_khach);
      if (filter?.search) {
        const s = filter.search.trim();
        query = query.or(
          `ho_ten.ilike.%${s}%,so_dien_thoai.ilike.%${s}%,ten_to_chuc.ilike.%${s}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Lead[];
    },
  });
}

export function useLead(id: number | null) {
  return useQuery({
    queryKey: ["lead", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead")
        .select(`
          *,
          campaign:campaign_id(id, ten),
          diem_den:lead_diem_den(id, diem_den)
        `)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as Lead;
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LeadInsert) => {
      const { data, error } = await externalSupabase
        .from("lead")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: async (created) => {
      await syncNextAction(created.id).catch(() => {});
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead_next_action", created.id] });
      qc.invalidateQueries({ queryKey: ["my_next_actions"] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LeadInsert> & { id: number }) => {
      const { data, error } = await externalSupabase
        .from("lead")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Lead;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.id] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase.from("lead").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

// Atomic: update trang_thai + log activity via RPC (PostgreSQL transaction)
export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      trang_thai_moi,
      ly_do_mat,
      created_by,
    }: {
      id: number;
      trang_thai_moi: LeadTrangThai;
      ly_do_mat?: string | null;
      created_by?: string | null;
    }) => {
      const { error } = await externalSupabase.rpc("update_lead_status", {
        p_lead_id:        id,
        p_trang_thai_moi: trang_thai_moi,
        p_ly_do_mat:      (ly_do_mat ?? null) as string | undefined,
        p_created_by:     (created_by ?? null) as string | undefined,
      });
      if (error) throw error;
    },
    onSuccess: async (_, vars) => {
      await syncNextAction(vars.id).catch(() => {});
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.id] });
      qc.invalidateQueries({ queryKey: ["lead_activities", vars.id] });
      qc.invalidateQueries({ queryKey: ["lead_next_action", vars.id] });
      qc.invalidateQueries({ queryKey: ["my_next_actions"] });
    },
  });
}

// Creates a doan from a chot_deal lead, then links lead.doan_id
export function useConvertLeadToDoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      leadId,
      doanData,
      currentUserId,
    }: {
      leadId: number;
      doanData: DoanInsert;
      currentUserId: string | null;
    }) => {
      const { data: doan, error: doanErr } = await externalSupabase
        .from("doan")
        .insert({ ...doanData, created_by: currentUserId })
        .select()
        .single();
      if (doanErr) throw doanErr;

      const doanId = (doan as { id: number }).id;

      const { error: leadErr } = await externalSupabase
        .from("lead")
        .update({ doan_id: doanId, trang_thai: "chot_deal" })
        .eq("id", leadId);
      if (leadErr) throw leadErr;

      await externalSupabase.from("lead_activity").insert({
        lead_id:        leadId,
        loai:           "doi_trang_thai",
        trang_thai_cu:  null,
        trang_thai_moi: "chot_deal",
        noi_dung:       `Chốt deal → tạo đoàn #${doanId}`,
        created_by:     currentUserId,
      });

      return doan as { id: number };
    },
    onSuccess: async (_, vars) => {
      await syncNextAction(vars.leadId).catch(() => {});
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["lead_activities", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["lead_next_action", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["my_next_actions"] });
      qc.invalidateQueries({ queryKey: ["doan"] });
    },
  });
}
