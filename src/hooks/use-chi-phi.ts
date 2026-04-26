import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { recalcChiPhiStatus } from "@/hooks/use-dntt";

export interface ChiPhiRow {
  id: number;
  doan_id: number;
  ngay_so: number | null;
  loai: string;
  danh_muc: string;
  ref_doan_ngay_item_id: number | null;
  ref_doan_ngay_id: number | null;
  mo_ta: string | null;
  don_gia: number;
  so_luong: number;
  thanh_tien: number;
  trang_thai_thanh_toan: string;
  ngay_thanh_toan: string | null;
  created_at: string;
  tien_cong_ty: number;
  tien_hdv: number;
  nha_cung_cap_id: number | null;
  trang_thai_dntt: string;
  de_nghi_tt_id: number | null;
  so_tien_da_dntt: number;
  so_tien_da_tt: number;
  thanh_tien_thuc_te: number | null;
  thanh_toan_dinh_ky: boolean;
}

export interface DNTTRow {
  id: number;
  doan_id: number;
  loai: string;
  mo_ta: string | null;
  nha_cung_cap_id: number | null;
  ten_nha_cung_cap: string | null;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
  so_tien: number;
  la_coc: boolean;
  la_thu_hoi: boolean;
  hdv_id: number | null;
  ty_le_coc: number | null;
  trang_thai_duyet: string;
  trang_thai_thanh_toan: string;
  ref_loai: string | null;
  ref_id: number | null;
  created_at: string;
  so_tien_con_lai: number | null;
  ngay_thanh_toan: string | null;
  ghi_chu: string | null;
  sent_at: string | null;
  sent_by: string | null;
  ngay_can_thanh_toan: string | null;
}

// ── Queries ──

export function useChiPhiList(doanId?: number) {
  return useQuery({
    queryKey: ["doan_chi_phi", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_chi_phi")
        .select("*")
        .eq("doan_id", doanId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ChiPhiRow[];
    },
  });
}

export function useDNTTList(doanId?: number) {
  return useQuery({
    queryKey: ["de_nghi_thanh_toan", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("*")
        .eq("doan_id", doanId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DNTTRow[];
    },
  });
}

// KS data from doan_ngay + khach_san + nha_cung_cap
// Also includes KS referenced in DNTT records (even if removed from tour schedule)
export function useChiPhiKSData(doanId?: number) {
  return useQuery({
    queryKey: ["chi_phi_ks_data", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data: ngayRows, error: e1 } = await externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date, khach_san_id, ks_ma_code, ks_loai_phong")
        .eq("doan_id", doanId!)
        .not("khach_san_id", "is", null)
        .order("ngay_date", { ascending: true });
      if (e1) throw e1;

      // Also collect KS ids from DNTT records (hoan_tien/cong_no may reference removed KS)
      const { data: dnttRows } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("ref_id")
        .eq("doan_id", doanId!)
        .eq("ref_loai", "khach_san")
        .not("ref_id", "is", null);

      const ksIdsFromNgay = new Set((ngayRows || []).map((r: any) => r.khach_san_id));
      const ksIdsFromDntt = new Set((dnttRows || []).map((r: any) => r.ref_id));
      const allKsIds = [...new Set([...ksIdsFromNgay, ...ksIdsFromDntt])];
      // Track which KS ids are "orphaned" (in DNTT but no longer in tour schedule)
      const orphanedKsIds = [...ksIdsFromDntt].filter((id) => !ksIdsFromNgay.has(id));

      if (allKsIds.length === 0) return { ngayRows: [], khachSanMap: {}, orphanedKsIds: [] };

      const { data: ksList, error: e2 } = await externalSupabase
        .from("khach_san")
        .select("id, ten, foc_khach, foc_mien, dia_diem, nha_cung_cap_id, nguoi_thanh_toan, tai_khoan_thanh_toan")
        .in("id", allKsIds);
      if (e2) throw e2;

      const nccIds = [
        ...new Set((ksList || []).filter((k: any) => k.nha_cung_cap_id).map((k: any) => k.nha_cung_cap_id)),
      ];
      let nccMap: Record<number, any> = {};
      if (nccIds.length > 0) {
        const { data: nccList } = await externalSupabase
          .from("nha_cung_cap")
          .select("id, ten, so_tai_khoan, ngan_hang")
          .in("id", nccIds);
        (nccList || []).forEach((n: any) => {
          nccMap[n.id] = n;
        });
      }

      const khachSanMap: Record<number, any> = {};
      (ksList || []).forEach((ks: any) => {
        const ncc = ks.nha_cung_cap_id ? nccMap[ks.nha_cung_cap_id] : null;
        khachSanMap[ks.id] = {
          ...ks,
          ten_ncc: ncc?.ten || null,
          ncc_so_tai_khoan: ncc?.so_tai_khoan || null,
          ncc_ngan_hang: ncc?.ngan_hang || null,
        };
      });

      const filteredNgayRows = (ngayRows || []).filter(
        (r: any) => khachSanMap[r.khach_san_id]?.nguoi_thanh_toan !== "khach"
      );
      return { ngayRows: filteredNgayRows, khachSanMap, orphanedKsIds };
    },
  });
}

// NH data from doan_ngay
export function useChiPhiNHData(doanId?: number) {
  return useQuery({
    queryKey: ["chi_phi_nh_data", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data: ngayRows, error: e1 } = await externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date, an_trua_nha_hang_id, an_toi_nha_hang_id")
        .eq("doan_id", doanId!)
        .order("ngay_date", { ascending: true });
      if (e1) throw e1;

      const nhIds = new Set<number>();
      (ngayRows || []).forEach((r: any) => {
        if (r.an_trua_nha_hang_id) nhIds.add(r.an_trua_nha_hang_id);
        if (r.an_toi_nha_hang_id) nhIds.add(r.an_toi_nha_hang_id);
      });
      if (nhIds.size === 0) return { meals: [], nhaHangMap: {} };

      const { data: nhList, error: e2 } = await externalSupabase
        .from("nha_hang")
        .select("id, ten, dia_chi")
        .in("id", [...nhIds]);
      if (e2) throw e2;

      const nhaHangMap: Record<number, any> = {};
      (nhList || []).forEach((nh: any) => {
        nhaHangMap[nh.id] = nh;
      });

      const meals: any[] = [];
      (ngayRows || []).forEach((r: any) => {
        if (r.an_trua_nha_hang_id) {
          meals.push({
            doan_ngay_id: r.id,
            ngay_date: r.ngay_date,
            bua_an: "trua",
            nha_hang_id: r.an_trua_nha_hang_id,
          });
        }
        if (r.an_toi_nha_hang_id) {
          meals.push({ doan_ngay_id: r.id, ngay_date: r.ngay_date, bua_an: "toi", nha_hang_id: r.an_toi_nha_hang_id });
        }
      });

      const { data: bookings } = await externalSupabase
        .from("doan_booking_nh")
        .select("doan_ngay_id, bua_an, ten_set_snapshot, gia_snapshot")
        .eq("doan_id", doanId!);

      const bookingMap: Record<string, any> = {};
      (bookings || []).forEach((b: any) => {
        bookingMap[`${b.doan_ngay_id}_${b.bua_an}`] = b;
      });

      return { meals, nhaHangMap, bookingMap };
    },
  });
}

// ── Mutations ──

export function useUpsertChiPhi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<ChiPhiRow> & { doan_id: number }) => {
      const { thanh_tien, ...clean } = payload as any;
      if (clean.id) {
        const { id, ...rest } = clean;
        const { data, error } = await externalSupabase
          .from("doan_chi_phi")
          .update(rest)
          .eq("id", id)
          .select("id")
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await externalSupabase.from("doan_chi_phi").insert(clean).select("id").single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", variables.doan_id] });
    },
  });
}

export function useDeleteChiPhi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doanId }: { id: number; doanId: number }) => {
      const { error } = await externalSupabase.from("doan_chi_phi").delete().eq("id", id);
      if (error) throw error;
      return doanId;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
    },
  });
}

export interface AllocationRow {
  chi_phi_id: number;
  so_tien: number;
  ghi_chu?: string;
}

export function useInsertDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, any> & { doan_id: number; allocations?: AllocationRow[] }) => {
      const { allocations, ...dnttPayload } = payload;
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert(dnttPayload)
        .select("id")
        .single();
      if (error) throw error;

      const chiPhiIds: number[] = [];
      if (allocations && allocations.length > 0) {
        const rows = allocations.map((a) => ({
          dntt_id: data.id,
          chi_phi_id: a.chi_phi_id,
          so_tien: a.so_tien,
          ghi_chu: a.ghi_chu ?? null,
        }));
        const { error: allocErr } = await externalSupabase
          .from("dntt_allocations")
          .insert(rows);
        if (allocErr) throw allocErr;
        chiPhiIds.push(...allocations.map((a) => a.chi_phi_id));
      }

      await recalcChiPhiStatus(chiPhiIds);
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", v.doan_id] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", v.doan_id] });
    },
  });
}

export function useDNTTAllocations(dnttId: number | null | undefined) {
  return useQuery({
    queryKey: ["dntt_allocations", dnttId],
    enabled: !!dnttId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("dntt_allocations")
        .select("id, chi_phi_id, so_tien, ghi_chu, created_at")
        .eq("dntt_id", dnttId!);
      if (error) throw error;
      return data as { id: number; chi_phi_id: number; so_tien: number; ghi_chu: string | null; created_at: string }[];
    },
  });
}

export function useChiPhiAllocations(chiPhiId: number | null | undefined) {
  return useQuery({
    queryKey: ["chi_phi_allocations", chiPhiId],
    enabled: !!chiPhiId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("dntt_allocations")
        .select("id, dntt_id, so_tien, ghi_chu, de_nghi_thanh_toan:dntt_id(so_tien, trang_thai_duyet, trang_thai_thanh_toan, mo_ta)")
        .eq("chi_phi_id", chiPhiId!);
      if (error) throw error;
      return data as unknown as {
        id: number;
        dntt_id: number;
        so_tien: number;
        ghi_chu: string | null;
        de_nghi_thanh_toan: {
          so_tien: number;
          trang_thai_duyet: string;
          trang_thai_thanh_toan: string;
          mo_ta: string | null;
        };
      }[];
    },
  });
}

export function useDeleteDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doanId }: { id: number; doanId: number; refId?: number | null }) => {
      // Lấy chi_phi_ids trước khi xóa (allocations sẽ bị cascade delete)
      const { data: allocBefore } = await externalSupabase
        .from("dntt_allocations")
        .select("chi_phi_id")
        .eq("dntt_id", id);
      const chiPhiIds = (allocBefore || []).map((r: any) => r.chi_phi_id as number);

      const { error } = await externalSupabase.from("de_nghi_thanh_toan").delete().eq("id", id);
      if (error) throw error;

      await recalcChiPhiStatus(chiPhiIds);
      return doanId;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
    },
  });
}

export function useUpdateDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doanId, ...rest }: { id: number; doanId: number } & Record<string, any>) => {
      const { error } = await externalSupabase.from("de_nghi_thanh_toan").update(rest).eq("id", id);
      if (error) throw error;

      return doanId;
    },
    onSuccess: (doanId) => {
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
    },
  });
}
