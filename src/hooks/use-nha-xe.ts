import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface NhaXe {
  id: number;
  ten: string;
  dia_diem: string | null;
  email: string | null;
  so_dien_thoai: string | null;
  tai_khoan_thanh_toan: string | null;
  nguoi_thanh_toan: string | null;
  ghi_chu: string | null;
  nha_cung_cap_id: number | null;
}

export interface LoaiXe {
  id: number;
  nha_xe_id: number;
  ten_xe: string;
  so_cho: number | null;
  gia: number | null;
  don_vi: string | null;
  ghi_chu: string | null;
}

const QK = "nha_xe_list";
const QK_LOAI = "nha_xe_loai_xe";

// ── Nhà xe ──

export function useNhaXeList() {
  return useQuery<NhaXe[]>({
    queryKey: [QK],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_xe")
        .select("*")
        .order("ten", { ascending: true });
      if (error) throw error;
      return data as NhaXe[];
    },
  });
}

export function useCreateNhaXe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ten: string; nha_cung_cap_id?: number; dia_diem?: string }) => {
      const { data, error } = await externalSupabase
        .from("nha_xe")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as NhaXe;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateNhaXe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<NhaXe> & { id: number }) => {
      const { error } = await externalSupabase
        .from("nha_xe")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteNhaXe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("nha_xe")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// ── Loại xe ──

export function useLoaiXeList(nhaXeId: number | null) {
  return useQuery<LoaiXe[]>({
    queryKey: [QK_LOAI, nhaXeId],
    enabled: !!nhaXeId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_xe_loai_xe")
        .select("*")
        .eq("nha_xe_id", nhaXeId!)
        .order("id", { ascending: true });
      if (error) throw error;
      return data as LoaiXe[];
    },
  });
}

export function useCreateLoaiXe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { nha_xe_id: number; ten_xe: string; so_cho?: number | null; gia?: number | null; don_vi?: string | null; ghi_chu?: string | null }) => {
      const { data, error } = await externalSupabase
        .from("nha_xe_loai_xe")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as LoaiXe;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_LOAI, v.nha_xe_id] }),
  });
}

export function useUpdateLoaiXe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nha_xe_id, ...payload }: Partial<LoaiXe> & { id: number; nha_xe_id: number }) => {
      const { error } = await externalSupabase
        .from("nha_xe_loai_xe")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_LOAI, v.nha_xe_id] }),
  });
}

export function useDeleteLoaiXe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nha_xe_id }: { id: number; nha_xe_id: number }) => {
      const { error } = await externalSupabase
        .from("nha_xe_loai_xe")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_LOAI, v.nha_xe_id] }),
  });
}
