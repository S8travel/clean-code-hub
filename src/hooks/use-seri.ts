import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

// ── Types ──

export interface SeriTour {
  id: number;
  ten_seri: string;
  mo_ta: string | null;
  created_at: string;
}

export interface SeriNgay {
  id: number;
  seri_id: number;
  ngay_so: number;
  thanh_pho: string | null;
  an_trua_nha_hang_id: number | null;
  an_trua_set_menu_id: number | null;
  an_toi_nha_hang_id: number | null;
  an_toi_set_menu_id: number | null;
  khach_san_id: number | null;
  ks_loai_phong: string | null;
  ks_ma_code: string | null;
}

export interface SeriNgayItem {
  id: number;
  seri_ngay_id: number;
  canh_diem_id: number;
  thu_tu: number;
  co_phi: boolean | null;
  don_gia: number | null;
  nguoi_thanh_toan: string | null;
  ghi_chu: string | null;
}

// ── Seri CRUD ──

export function useSeriList() {
  return useQuery({
    queryKey: ["seri_tour"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("seri_tour")
        .select("*")
        .order("ten_seri");
      if (error) throw error;
      return data as SeriTour[];
    },
  });
}

export function useCreateSeri() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ten_seri: string; mo_ta?: string }) => {
      const { data, error } = await externalSupabase
        .from("seri_tour")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as SeriTour;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seri_tour"] }),
  });
}

export function useUpdateSeri() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; ten_seri: string; mo_ta?: string }) => {
      const { data, error } = await externalSupabase
        .from("seri_tour")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as SeriTour;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seri_tour"] }),
  });
}

export function useDeleteSeri() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase.from("seri_tour").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seri_tour"] }),
  });
}

// ── Seri Ngay CRUD ──

export function useSeriNgayList(seriId: number | null) {
  return useQuery({
    queryKey: ["seri_tour_ngay", seriId],
    enabled: !!seriId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("seri_tour_ngay")
        .select("*")
        .eq("seri_id", seriId!)
        .order("ngay_so");
      if (error) throw error;
      return data as SeriNgay[];
    },
  });
}

export function useAddSeriNgay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ seri_id, ngay_so }: { seri_id: number; ngay_so: number }) => {
      const { data, error } = await externalSupabase
        .from("seri_tour_ngay")
        .insert({ seri_id, ngay_so })
        .select()
        .single();
      if (error) throw error;
      return data as SeriNgay;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay", vars.seri_id] }),
  });
}

export function useUpdateSeriNgay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, seri_id, ...payload }: Partial<SeriNgay> & { id: number; seri_id: number }) => {
      const { error } = await externalSupabase
        .from("seri_tour_ngay")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay", vars.seri_id] }),
  });
}

export function useDeleteSeriNgay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, seri_id }: { id: number; seri_id: number }) => {
      const { error } = await externalSupabase.from("seri_tour_ngay").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay", vars.seri_id] }),
  });
}

// ── Seri Ngay Item CRUD ──

export function useSeriNgayItems(seriId: number | null) {
  return useQuery({
    queryKey: ["seri_tour_ngay_item", seriId],
    enabled: !!seriId,
    queryFn: async () => {
      // Fetch all items for all ngay of this seri in one query
      const { data: ngayRows, error: e1 } = await externalSupabase
        .from("seri_tour_ngay")
        .select("id")
        .eq("seri_id", seriId!);
      if (e1) throw e1;
      if (!ngayRows || ngayRows.length === 0) return [] as SeriNgayItem[];

      const ngayIds = ngayRows.map((r: any) => r.id);
      const { data, error: e2 } = await externalSupabase
        .from("seri_tour_ngay_item")
        .select("*")
        .in("seri_ngay_id", ngayIds)
        .order("thu_tu");
      if (e2) throw e2;
      return (data ?? []) as SeriNgayItem[];
    },
  });
}

export function useAddSeriNgayItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      seri_ngay_id: number;
      seri_id: number;
      canh_diem_id: number;
      thu_tu: number;
      co_phi: boolean;
      don_gia: number;
      nguoi_thanh_toan: string | null;
      ghi_chu: string | null;
    }) => {
      const { seri_id, ...insert } = payload;
      const { data, error } = await externalSupabase
        .from("seri_tour_ngay_item")
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay_item", vars.seri_id] }),
  });
}

export function useDeleteSeriNgayItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, seri_id }: { id: number; seri_id: number }) => {
      const { error } = await externalSupabase.from("seri_tour_ngay_item").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay_item", vars.seri_id] }),
  });
}

// ── Apply seri to doan ──

export function useApplySeriToDoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      doanId,
      seriId,
      ngayDi,
    }: {
      doanId: number;
      seriId: number;
      ngayDi: string; // "yyyy-MM-dd"
    }) => {
      // 1. Fetch seri ngay
      const { data: seriNgayRows, error: e1 } = await externalSupabase
        .from("seri_tour_ngay")
        .select("*")
        .eq("seri_id", seriId)
        .order("ngay_so");
      if (e1) throw e1;
      if (!seriNgayRows || seriNgayRows.length === 0) return;

      const thuMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      const baseDate = new Date(ngayDi + "T00:00:00");

      // 2. Insert doan_ngay rows
      const ngayInserts = seriNgayRows.map((sn: any) => {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + sn.ngay_so - 1);
        const dateStr = d.toISOString().split("T")[0];
        return {
          doan_id: doanId,
          ngay_so: sn.ngay_so,
          ngay_date: dateStr,
          thu: thuMap[d.getDay()],
          thanh_pho: sn.thanh_pho,
          an_trua_nha_hang_id: sn.an_trua_nha_hang_id,
          an_trua_set_menu_id: sn.an_trua_set_menu_id,
          an_toi_nha_hang_id: sn.an_toi_nha_hang_id,
          an_toi_set_menu_id: sn.an_toi_set_menu_id,
          khach_san_id: sn.khach_san_id,
          ks_loai_phong: sn.ks_loai_phong,
          ks_ma_code: sn.ks_ma_code,
        };
      });

      const { data: insertedNgay, error: e2 } = await externalSupabase
        .from("doan_ngay")
        .insert(ngayInserts)
        .select("id, ngay_so");
      if (e2) throw e2;

      // 3. Fetch seri items
      const seriNgayIds = seriNgayRows.map((r: any) => r.id);
      const { data: seriItems, error: e3 } = await externalSupabase
        .from("seri_tour_ngay_item")
        .select("*")
        .in("seri_ngay_id", seriNgayIds);
      if (e3) throw e3;
      if (!seriItems || seriItems.length === 0) return;

      // Map seri_ngay.id → ngay_so → doan_ngay.id
      const seriNgayToNgaySo = new Map<number, number>(
        seriNgayRows.map((r: any) => [r.id, r.ngay_so])
      );
      const ngaySoToDoanNgayId = new Map<number, number>(
        (insertedNgay ?? []).map((r: any) => [r.ngay_so, r.id])
      );

      const itemInserts = seriItems
        .map((si: any) => {
          const ngaySo = seriNgayToNgaySo.get(si.seri_ngay_id);
          if (ngaySo === undefined) return null;
          const doanNgayId = ngaySoToDoanNgayId.get(ngaySo);
          if (!doanNgayId) return null;
          return {
            doan_ngay_id: doanNgayId,
            doan_id: doanId,
            canh_diem_id: si.canh_diem_id,
            thu_tu: si.thu_tu,
            co_phi: si.co_phi,
            don_gia: si.don_gia,
            nguoi_thanh_toan: si.nguoi_thanh_toan,
            ghi_chu: si.ghi_chu,
          };
        })
        .filter(Boolean);

      if (itemInserts.length > 0) {
        const { error: e4 } = await externalSupabase
          .from("doan_ngay_item")
          .insert(itemInserts);
        if (e4) throw e4;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["doan_ngay", vars.doanId] });
      qc.invalidateQueries({ queryKey: ["doan_ngay_item", vars.doanId] });
    },
  });
}

// ── Hook for set menu options per nha_hang ──
export function useSetMenuByNhaHang(nhaHangId: number | null) {
  return useQuery({
    queryKey: ["set_menu", nhaHangId],
    enabled: !!nhaHangId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_hang_set_menu")
        .select("id, ten_set, gia, don_vi")
        .eq("nha_hang_id", nhaHangId!)
        .order("ten_set");
      if (error) throw error;
      return data as { id: number; ten_set: string; gia: number | null; don_vi: string }[];
    },
  });
}
