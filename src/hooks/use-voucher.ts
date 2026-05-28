import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

// Voucher GIÁ-BIẾN-THIÊN (1 voucher đổi 1 bữa/DV, giá trị = giá lúc dùng).
// Theo dõi SỐ LƯỢNG (không quy tiền) — khác cong_no. Tồn = so_luong - SUM(đã dùng).
export interface VoucherRow {
  id: number;
  nha_cung_cap_id: number | null;
  ten: string | null;
  so_luong: number | null;
  ghi_chu: string | null;
  active: boolean | null;
  ngay_tao: string | null;
  // Derived from view
  so_luong_da_dung: number;
  so_luong_con_lai: number;
  tong_gia_tri_da_dung: number;
  // Joined
  ten_ncc?: string;
}

export interface VoucherRedemptionRow {
  id: number;
  voucher_id: number;
  doan_id: number | null;
  chi_phi_id: number | null;
  so_luong: number;
  gia_tri: number;
  ngay_dung: string | null;
  ghi_chu: string | null;
  // Joined
  ten_doan?: string;
}

// Danh sách voucher + tồn (trang /voucher quản lý)
export function useVoucherList() {
  return useQuery({
    queryKey: ["voucher"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("voucher_with_status")
        .select("*, nha_cung_cap:nha_cung_cap_id(ten)")
        .order("active", { ascending: false })
        .order("ten", { ascending: true });
      if (error) throw error;
      return (data || []).map((row) => {
        const r = row as typeof row & { nha_cung_cap?: { ten?: string | null } | null };
        return { ...r, ten_ncc: r.nha_cung_cap?.ten || "" };
      }) as VoucherRow[];
    },
  });
}

// Voucher CÒN TỒN của 1 NCC — dùng cho modal "Dùng voucher" (lọc đúng NCC).
export function useVoucherByNCC(nccId: number | null | undefined) {
  return useQuery({
    queryKey: ["voucher-by-ncc", nccId],
    enabled: !!nccId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("voucher_with_status")
        .select("*")
        .eq("nha_cung_cap_id", nccId!)
        .eq("active", true)
        .gt("so_luong_con_lai", 0)
        .order("ngay_tao", { ascending: true });
      if (error) throw error;
      return (data || []) as VoucherRow[];
    },
  });
}

// Các lần dùng voucher của 1 đoàn — NH/DV section đọc để biết dòng nào đã phủ voucher.
export function useRedemptionsByDoan(doanId: number | null | undefined) {
  return useQuery({
    queryKey: ["voucher-su-dung-by-doan", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("voucher_su_dung")
        .select("*, voucher:voucher_id(ten)")
        .eq("doan_id", doanId!);
      if (error) throw error;
      return (data || []) as (VoucherRedemptionRow & { voucher?: { ten?: string | null } | null })[];
    },
  });
}

// Log dùng của 1 voucher (modal chi tiết ở trang /voucher)
export function useVoucherRedemptions(voucherId: number | null | undefined) {
  return useQuery({
    queryKey: ["voucher-redemptions", voucherId],
    enabled: !!voucherId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("voucher_su_dung")
        .select("*, doan:doan_id(ten_doan)")
        .eq("voucher_id", voucherId!)
        .order("ngay_dung", { ascending: false });
      if (error) throw error;
      return (data || []).map((row) => {
        const r = row as typeof row & { doan?: { ten_doan?: string | null } | null };
        return { ...r, ten_doan: r.doan?.ten_doan || "" };
      }) as VoucherRedemptionRow[];
    },
  });
}

export function useCreateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      nha_cung_cap_id: number | null;
      ten: string;
      so_luong: number;
      ghi_chu?: string | null;
    }) => {
      const { data, error } = await externalSupabase
        .from("voucher")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voucher"] }),
  });
}

export function useUpdateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: number;
      nha_cung_cap_id?: number | null;
      ten?: string;
      so_luong?: number;
      ghi_chu?: string | null;
      active?: boolean;
    }) => {
      const { error } = await externalSupabase.from("voucher").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voucher"] });
      qc.invalidateQueries({ queryKey: ["voucher-by-ncc"] });
    },
  });
}

export function useDeleteVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      // FK voucher_su_dung.voucher_id = ON DELETE RESTRICT → DB chặn nếu đã dùng.
      const { error } = await externalSupabase.from("voucher").delete().eq("id", id);
      if (error) {
        throw new Error("Không xóa được: voucher này đã có lượt dùng. Hãy đặt 'Ngưng' thay vì xóa.");
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voucher"] }),
  });
}

// Ghi nhận 1 lần dùng voucher cho 1 dòng chi phí. (Side-effect phủ chi_phi về 0
// nằm ở NH/DV section — xem useRedeemVoucherOnChiPhi khi tích hợp.)
export function useRedeemVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      voucher_id: number;
      doan_id: number | null;
      chi_phi_id: number | null;
      so_luong: number;
      gia_tri: number;
      ghi_chu?: string | null;
    }) => {
      const { data: auth } = await externalSupabase.auth.getUser();
      const { data, error } = await externalSupabase
        .from("voucher_su_dung")
        .insert({ ...payload, tao_boi: auth?.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["voucher"] });
      qc.invalidateQueries({ queryKey: ["voucher-by-ncc"] });
      qc.invalidateQueries({ queryKey: ["voucher-redemptions", vars.voucher_id] });
      if (vars.doan_id) qc.invalidateQueries({ queryKey: ["voucher-su-dung-by-doan", vars.doan_id] });
    },
  });
}

export function useUndoRedemption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; voucherId?: number; doanId?: number | null }) => {
      const { error } = await externalSupabase.from("voucher_su_dung").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["voucher"] });
      qc.invalidateQueries({ queryKey: ["voucher-by-ncc"] });
      if (vars.voucherId) qc.invalidateQueries({ queryKey: ["voucher-redemptions", vars.voucherId] });
      if (vars.doanId) qc.invalidateQueries({ queryKey: ["voucher-su-dung-by-doan", vars.doanId] });
    },
  });
}
