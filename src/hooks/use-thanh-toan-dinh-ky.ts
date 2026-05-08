import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { recalcChiPhiStatus, type DNTTRow } from "@/hooks/use-dntt";

export interface DinhKyChiPhiRow {
  id: number;
  doan_id: number;
  ten_doan: string | null;
  ngay_kh_di: string | null;
  danh_muc: string;
  mo_ta: string | null;
  thanh_tien: number;
  thanh_tien_thuc_te: number | null;
  so_tien_da_tt: number;
  trang_thai_thanh_toan: string;
  nha_cung_cap_id: number | null;
  ten_ncc: string | null;
  ncc_so_tai_khoan: string | null;
  ncc_ngan_hang: string | null;
}

export function useDinhKyChiPhiList(filters?: {
  nccId?: number | null;
  tuNgay?: string | null;
  denNgay?: string | null;
}) {
  return useQuery({
    queryKey: ["dinh_ky_chi_phi", filters],
    queryFn: async (): Promise<DinhKyChiPhiRow[]> => {
      // 1. Load chi phí định kỳ chưa thanh toán đủ
      let q = externalSupabase
        .from("doan_chi_phi")
        .select("id, doan_id, danh_muc, mo_ta, thanh_tien, thanh_tien_thuc_te, so_tien_da_tt, trang_thai_thanh_toan, nha_cung_cap_id")
        .eq("thanh_toan_dinh_ky", true)
        .not("trang_thai_thanh_toan", "eq", "paid")
        .not("trang_thai_dntt", "eq", "cong_no")
        .not("trang_thai_dntt", "eq", "hoan_tien")
        .order("doan_id", { ascending: true });

      if (filters?.nccId) q = q.eq("nha_cung_cap_id", filters.nccId);

      const { data: cpRows, error } = await q;
      if (error) throw error;
      if (!cpRows || cpRows.length === 0) return [];

      // 2. Load doan info
      const doanIds = [...new Set(cpRows.map((r: any) => r.doan_id))];
      const { data: doanList } = await externalSupabase
        .from("doan")
        .select("id, ten_doan, ngay_di")
        .in("id", doanIds);
      const doanMap: Record<number, any> = {};
      (doanList || []).forEach((d: any) => { doanMap[d.id] = d; });

      // 3. Load NCC info
      const nccIds = [...new Set(cpRows.filter((r: any) => r.nha_cung_cap_id).map((r: any) => r.nha_cung_cap_id))];
      let nccMap: Record<number, any> = {};
      if (nccIds.length > 0) {
        const { data: nccList } = await externalSupabase
          .from("nha_cung_cap")
          .select("id, ten, so_tai_khoan, ngan_hang")
          .in("id", nccIds);
        (nccList || []).forEach((n: any) => { nccMap[n.id] = n; });
      }

      let rows: DinhKyChiPhiRow[] = cpRows.map((r: any) => {
        const doan = doanMap[r.doan_id] || {};
        const ncc = r.nha_cung_cap_id ? nccMap[r.nha_cung_cap_id] : null;
        return {
          id: r.id,
          doan_id: r.doan_id,
          ten_doan: doan.ten_doan ?? null,
          ngay_kh_di: doan.ngay_di ?? null,
          danh_muc: r.danh_muc,
          mo_ta: r.mo_ta,
          thanh_tien: r.thanh_tien,
          thanh_tien_thuc_te: r.thanh_tien_thuc_te,
          so_tien_da_tt: r.so_tien_da_tt ?? 0,
          trang_thai_thanh_toan: r.trang_thai_thanh_toan,
          nha_cung_cap_id: r.nha_cung_cap_id,
          ten_ncc: ncc?.ten ?? null,
          ncc_so_tai_khoan: ncc?.so_tai_khoan ?? null,
          ncc_ngan_hang: ncc?.ngan_hang ?? null,
        };
      });

      // Filter by date range if provided
      if (filters?.tuNgay || filters?.denNgay) {
        rows = rows.filter((r) => {
          if (!r.ngay_kh_di) return true;
          if (filters.tuNgay && r.ngay_kh_di < filters.tuNgay) return false;
          if (filters.denNgay && r.ngay_kh_di > filters.denNgay) return false;
          return true;
        });
      }

      return rows;
    },
  });
}

export function useCreateBatchDNTT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      nccId: number;
      moTa: string;
      chiPhiIds: number[];
      allocations: { chi_phi_id: number; so_tien: number }[];
      soTien: number;
      laCoc?: boolean;
    }) => {
      // Tạo DNTT gộp — không thuộc 1 đoàn cụ thể → doan_id = null
      const { data: dntt, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert({
          doan_id: null,
          loai: "dinh_ky",
          mo_ta: payload.moTa,
          nha_cung_cap_id: payload.nccId,
          so_tien: payload.soTien,
          la_coc: payload.laCoc ?? false,
          trang_thai_duyet: "cho_duyet",
          ref_loai: "dinh_ky",
          ref_id: null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Insert allocations
      const allocRows = payload.allocations.map((a) => ({
        dntt_id: dntt.id,
        chi_phi_id: a.chi_phi_id,
        so_tien: a.so_tien,
      }));
      const { error: allocErr } = await externalSupabase
        .from("dntt_allocations")
        .insert(allocRows);
      if (allocErr) throw allocErr;

      await recalcChiPhiStatus(payload.chiPhiIds);
      return dntt;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dinh_ky_chi_phi"] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi"] });
    },
  });
}

// ĐNTT định kỳ (loai='dinh_ky') — chưa thanh toán xong, theo NCC
export function useDinhKyDNTTList(filters?: {
  nccId?: number | null;
  includeResolved?: boolean; // default false: ẩn da_huy + tu_choi + paid
}) {
  return useQuery({
    queryKey: ["dinh_ky_dntt_list", filters],
    queryFn: async (): Promise<DNTTRow[]> => {
      let q = externalSupabase
        .from("dntt_with_payment_status")
        .select(`
          *,
          nha_cung_cap:nha_cung_cap_id(ten, so_tai_khoan, ngan_hang)
        `)
        .eq("loai", "dinh_ky")
        .order("created_at", { ascending: false });

      if (filters?.nccId) q = q.eq("nha_cung_cap_id", filters.nccId);

      const { data, error } = await q;
      if (error) throw error;

      let rows = (data || []).map((row: any) => ({
        ...row,
        ten_doan: "",
        ten_ncc: row.nha_cung_cap?.ten || row.ten_nha_cung_cap || "",
        ncc_so_tai_khoan: row.nha_cung_cap?.so_tai_khoan || row.so_tai_khoan || "",
        ncc_ngan_hang: row.nha_cung_cap?.ngan_hang || row.ngan_hang || "",
      })) as DNTTRow[];

      if (!filters?.includeResolved) {
        rows = rows.filter(
          (r) =>
            r.trang_thai_duyet !== "da_huy" &&
            r.trang_thai_duyet !== "tu_choi" &&
            r.payment_status !== "paid",
        );
      }
      return rows;
    },
  });
}

// Lấy allocations + chi phí + đoàn cho 1 ĐNTT định kỳ (xem chi tiết)
export function useDinhKyDNTTAllocations(dnttId: number | null | undefined) {
  return useQuery({
    queryKey: ["dinh_ky_dntt_allocations", dnttId],
    enabled: !!dnttId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("dntt_allocations")
        .select(`
          chi_phi_id, so_tien,
          chi_phi:chi_phi_id (
            id, doan_id, danh_muc, mo_ta, thanh_tien,
            doan:doan_id (id, ten_doan, ngay_di)
          )
        `)
        .eq("dntt_id", dnttId!);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useNccOptions() {
  return useQuery({
    queryKey: ["nha_cung_cap_options"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_cung_cap")
        .select("id, ten")
        .order("ten", { ascending: true });
      if (error) throw error;
      return (data || []) as { id: number; ten: string }[];
    },
  });
}
