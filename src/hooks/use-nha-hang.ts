import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface NhaHang {
  id: number;
  ten: string;
  dia_chi: string | null;
  dia_diem: string | null;
  tai_khoan_thanh_toan: string | null;
  thong_tin_chung: string | null;
  foc_khach: number | null;
  foc_mien: number | null;
  nguoi_thanh_toan: string | null;
  email: string | null;
  website: string | null;
  hinh_anh: string | null;
  nha_cung_cap_id: number | null;
  ten_zh: string | null;
  dia_diem_zh: string | null;
  chiet_khau_phan_tram: number | null;
  tinh_suat_tl: boolean | null;
  /** Đoàn MỚI tự đánh dấu chi phí nhà hàng này là định kỳ — xem lib/nh-dinh-ky.ts */
  thanh_toan_dinh_ky_mac_dinh: boolean;
  loai: string; // 'nha_hang' | 'tau_ngay'
}

export interface SetMenu {
  id: number;
  nha_hang_id: number;
  ten_set: string;
  gia: number | null;
  don_vi: string;
  ghi_chu: string | null;
  loai_gia: string; // 'set_menu' | 'buffet' | 'tron_goi'
  gia_thue_tau: number;
}

export interface SetMenuMon {
  id: number;
  set_menu_id: number;
  ten_mon: string;
  ten_mon_trung: string | null;
  thu_tu: number;
}

const QK = "nha_hang_list";
const QK_SET = "nha_hang_set_menu";
const QK_MON = "nha_hang_set_menu_mon";

export function useNhaHangList() {
  return useQuery({
    queryKey: [QK],
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_hang")
        .select("*")
        .order("ten", { ascending: true });
      if (error) throw error;
      return data as NhaHang[];
    },
  });
}

export function useCreateNhaHang() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ten: string; dia_diem?: string; email?: string; nha_cung_cap_id?: number | null }) => {
      const { data, error } = await externalSupabase
        .from("nha_hang")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as NhaHang;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateNhaHang() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<NhaHang> & { id: number }) => {
      const { error } = await externalSupabase
        .from("nha_hang")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteNhaHang() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("nha_hang")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

// ── Set menu ──

export function useSetMenus(nhaHangId: number | null) {
  return useQuery({
    queryKey: [QK_SET, nhaHangId],
    enabled: !!nhaHangId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_hang_set_menu")
        .select("*")
        .eq("nha_hang_id", nhaHangId!)
        .order("id", { ascending: true });
      if (error) throw error;
      return data as SetMenu[];
    },
  });
}

export function useAllSetMenus() {
  return useQuery<SetMenu[]>({
    queryKey: [QK_SET, "all"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_hang_set_menu")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      return data as SetMenu[];
    },
  });
}

export function useCreateSetMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { nha_hang_id: number; ten_set: string }) => {
      const { data, error } = await externalSupabase
        .from("nha_hang_set_menu")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as SetMenu;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_SET, v.nha_hang_id] }),
  });
}

export function useUpdateSetMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nha_hang_id, ...payload }: Partial<SetMenu> & { id: number; nha_hang_id: number }) => {
      const { error } = await externalSupabase
        .from("nha_hang_set_menu")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_SET, v.nha_hang_id] }),
  });
}

export function useDeleteSetMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nha_hang_id }: { id: number; nha_hang_id: number }) => {
      const { error } = await externalSupabase
        .from("nha_hang_set_menu")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_SET, v.nha_hang_id] }),
  });
}

// ── Món ──

export function useSetMenuMons(setMenuId: number | null) {
  return useQuery({
    queryKey: [QK_MON, setMenuId],
    enabled: !!setMenuId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_hang_set_menu_mon")
        .select("*")
        .eq("set_menu_id", setMenuId!)
        .order("thu_tu", { ascending: true });
      if (error) throw error;
      return data as SetMenuMon[];
    },
  });
}

export function useCreateMon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { set_menu_id: number; ten_mon: string; thu_tu: number }) => {
      const { data, error } = await externalSupabase
        .from("nha_hang_set_menu_mon")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as SetMenuMon;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_MON, v.set_menu_id] }),
  });
}

export function useUpdateMon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, set_menu_id, ...payload }: Partial<SetMenuMon> & { id: number; set_menu_id: number }) => {
      const { error } = await externalSupabase
        .from("nha_hang_set_menu_mon")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_MON, v.set_menu_id] }),
  });
}

export function useDeleteMon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, set_menu_id }: { id: number; set_menu_id: number }) => {
      const { error } = await externalSupabase
        .from("nha_hang_set_menu_mon")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_MON, v.set_menu_id] }),
  });
}

export function useBatchUpdateMonOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { id: number; thu_tu: number; set_menu_id: number }[]) => {
      for (const item of items) {
        const { error } = await externalSupabase
          .from("nha_hang_set_menu_mon")
          .update({ thu_tu: item.thu_tu })
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: (_, items) => {
      if (items.length) qc.invalidateQueries({ queryKey: [QK_MON, items[0].set_menu_id] });
    },
  });
}

export function useReplaceMonList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ set_menu_id, items }: { set_menu_id: number; items: { ten_mon: string; ten_mon_trung?: string | null; thu_tu: number }[] }) => {
      // Delete all existing
      const { error: delErr } = await externalSupabase
        .from("nha_hang_set_menu_mon")
        .delete()
        .eq("set_menu_id", set_menu_id);
      if (delErr) throw delErr;
      // Insert new list
      if (items.length > 0) {
        const { error: insErr } = await externalSupabase
          .from("nha_hang_set_menu_mon")
          .insert(items.map((it) => ({ set_menu_id, ten_mon: it.ten_mon, ten_mon_trung: it.ten_mon_trung ?? null, thu_tu: it.thu_tu })));
        if (insErr) throw insErr;
      }
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK_MON, v.set_menu_id] }),
  });
}
