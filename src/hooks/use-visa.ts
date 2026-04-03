import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface DonViVisa {
  id: number;
  ten: string;
  email: string | null;
  so_dien_thoai: string | null;
  dia_chi: string | null;
  tai_khoan_thanh_toan: string | null;
  ghi_chu: string | null;
  nha_cung_cap_id: number | null;
  created_at: string;
}

export interface LoaiVisa {
  id: number;
  don_vi_visa_id: number;
  quoc_gia: string;
  loai: string | null;
  thoi_han: string | null;
  gia: number | null;
  don_vi: string | null;
  ghi_chu: string | null;
}

const QK = "don_vi_visa_list";
const QK_LOAI = "loai_visa_list";

// ── Đơn vị visa ──

export function useDonViVisaList() {
  return useQuery<DonViVisa[]>({
    queryKey: [QK],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("don_vi_visa")
        .select("*")
        .order("ten", { ascending: true });
      if (error) throw error;
      return data as DonViVisa[];
    },
  });
}

export function useCreateDonViVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ten: string; nha_cung_cap_id?: number | null }) => {
      const { data, error } = await externalSupabase
        .from("don_vi_visa")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as DonViVisa;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateDonViVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<DonViVisa> & { id: number }) => {
      const { error } = await externalSupabase
        .from("don_vi_visa")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteDonViVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("don_vi_visa")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// ── Loại visa ──

export function useLoaiVisaList(donViVisaId: number | null) {
  return useQuery<LoaiVisa[]>({
    queryKey: [QK_LOAI, donViVisaId],
    enabled: !!donViVisaId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("loai_visa")
        .select("*")
        .eq("don_vi_visa_id", donViVisaId!)
        .order("quoc_gia", { ascending: true });
      if (error) throw error;
      return data as LoaiVisa[];
    },
  });
}

export function useCreateLoaiVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      don_vi_visa_id: number;
      quoc_gia: string;
      loai?: string | null;
      thoi_han?: string | null;
      gia?: number | null;
      don_vi?: string | null;
      ghi_chu?: string | null;
    }) => {
      const { data, error } = await externalSupabase
        .from("loai_visa")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as LoaiVisa;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_LOAI, v.don_vi_visa_id] }),
  });
}

export function useUpdateLoaiVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, don_vi_visa_id, ...payload }: Partial<LoaiVisa> & { id: number; don_vi_visa_id: number }) => {
      const { error } = await externalSupabase
        .from("loai_visa")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_LOAI, v.don_vi_visa_id] }),
  });
}

export function useDeleteLoaiVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, don_vi_visa_id }: { id: number; don_vi_visa_id: number }) => {
      const { error } = await externalSupabase
        .from("loai_visa")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_LOAI, v.don_vi_visa_id] }),
  });
}
