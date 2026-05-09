import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface LeadActivity {
  id: number;
  lead_id: number;
  loai: string;
  noi_dung: string | null;
  ket_qua: string | null;
  tep_dinh_kem: string[];
  trang_thai_cu: string | null;
  trang_thai_moi: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LeadActivityInsert {
  lead_id: number;
  loai: string;
  noi_dung?: string | null;
  ket_qua?: string | null;
  tep_dinh_kem?: string[];
  trang_thai_cu?: string | null;
  trang_thai_moi?: string | null;
  created_by?: string | null;
}

export const LEAD_ACTIVITY_LOAI_OPTS: { value: string; label: string }[] = [
  { value: "goi_dien",           label: "Gọi điện" },
  { value: "tin_nhan_zalo",      label: "Tin nhắn Zalo" },
  { value: "tin_nhan_messenger", label: "Tin nhắn Messenger" },
  { value: "email",              label: "Email" },
  { value: "meeting",            label: "Gặp mặt" },
  { value: "gui_bao_gia",        label: "Gửi báo giá" },
  { value: "ghi_chu_noi_bo",     label: "Ghi chú nội bộ" },
  { value: "doi_trang_thai",     label: "Đổi trạng thái" },
];

export const LEAD_KET_QUA_OPTS: { value: string; label: string }[] = [
  { value: "bat_may",    label: "Bắt máy" },
  { value: "khong_bat",  label: "Không bắt" },
  { value: "hen_goi_lai",label: "Hẹn gọi lại" },
  { value: "nham_so",    label: "Nhầm số" },
];

// Sort DESC — newest first for timeline display
export function useLeadActivities(leadId: number | null) {
  return useQuery({
    queryKey: ["lead_activities", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("lead_activity")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LeadActivity[];
    },
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LeadActivityInsert) => {
      const { data, error } = await externalSupabase
        .from("lead_activity")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as LeadActivity;
    },
    onSuccess: (_, vars) => {
      // DB trigger auto-updates lead.ngay_lien_he_cuoi after INSERT
      qc.invalidateQueries({ queryKey: ["lead_activities", vars.lead_id] });
      qc.invalidateQueries({ queryKey: ["lead", vars.lead_id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
