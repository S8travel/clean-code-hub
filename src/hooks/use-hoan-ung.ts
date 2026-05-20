// Hoàn ứng (tạm ứng): user ứng tiền chi cho công ty (VPP, tiếp khách, taxi...)
// → tạo DNTT với loai='hoan_ung' để kế toán hoàn lại.
// Reuse bảng de_nghi_thanh_toan + flow duyệt sẵn có (DNTTPage).
// 2 field thêm: loai_chi_hoan_ung (enum), nguoi_ung_id (uuid → auth.users).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export const LOAI_CHI_HOAN_UNG_OPTS: { value: string; label: string }[] = [
  { value: "vpp",          label: "Văn phòng phẩm" },
  { value: "tiep_khach",   label: "Tiếp khách" },
  { value: "taxi",         label: "Taxi / Đi lại" },
  { value: "khac",         label: "Khác" },
];

export interface HoanUngRow {
  id: number;
  loai_chi_hoan_ung: string | null;
  nguoi_ung_id: string | null;
  mo_ta: string | null;
  so_tien: number;
  ten_nha_cung_cap: string | null;  // tên người ứng (snapshot)
  so_tai_khoan: string | null;
  ngan_hang: string | null;
  trang_thai_duyet: string;
  ngay_can_thanh_toan: string | null;
  hoa_don_url: string | null;
  tao_boi: string | null;
  tao_luc: string | null;
  duyet_boi: string | null;
  duyet_luc: string | null;
  // Derived
  paid_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  thanh_toan_luc: string | null;
  // Joined
  nguoi_ung_ho_ten?: string | null;
}

export interface HoanUngInsert {
  loai_chi_hoan_ung: string;
  nguoi_ung_id: string;
  ten_nguoi_ung: string;           // snapshot vào ten_nha_cung_cap
  mo_ta: string;
  so_tien: number;
  so_tai_khoan?: string | null;
  ngan_hang?: string | null;
  ngay_can_thanh_toan?: string | null;
  hoa_don_url?: string | null;
  tao_boi: string;
}

// List hoàn ứng — query DNTT view với filter loai='hoan_ung'
export function useHoanUngList(filter?: {
  loai_chi?: string | null;
  trang_thai?: string | null;
  nguoi_ung_id?: string | null;
}) {
  return useQuery({
    queryKey: ["hoan_ung_list", filter ?? null],
    queryFn: async () => {
      let q = externalSupabase
        .from("dntt_with_payment_status")
        .select("*")
        .eq("loai", "hoan_ung")
        .order("tao_luc", { ascending: false });
      if (filter?.loai_chi)     q = q.eq("loai_chi_hoan_ung", filter.loai_chi);
      if (filter?.trang_thai)   q = q.eq("trang_thai_duyet",  filter.trang_thai);
      if (filter?.nguoi_ung_id) q = q.eq("nguoi_ung_id",      filter.nguoi_ung_id);
      const { data, error } = await q;
      if (error) throw error;

      // Lookup ho_ten người ứng từ user_roles
      const ids = [...new Set((data ?? []).map((r: any) => r.nguoi_ung_id).filter(Boolean))];
      const nameMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: roles } = await externalSupabase
          .from("user_roles")
          .select("user_id, ho_ten")
          .in("user_id", ids);
        for (const r of roles ?? []) nameMap[r.user_id] = r.ho_ten;
      }
      return (data ?? []).map((r: any) => ({
        ...r,
        nguoi_ung_ho_ten: r.nguoi_ung_id ? nameMap[r.nguoi_ung_id] ?? null : null,
      })) as HoanUngRow[];
    },
  });
}

// Tạo yêu cầu hoàn ứng — insert DNTT loai='hoan_ung'
export function useCreateHoanUng() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: HoanUngInsert) => {
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert({
          loai: "hoan_ung",
          doan_id: null,
          nha_cung_cap_id: null,
          ten_nha_cung_cap: payload.ten_nguoi_ung,
          loai_chi_hoan_ung: payload.loai_chi_hoan_ung,
          nguoi_ung_id: payload.nguoi_ung_id,
          mo_ta: payload.mo_ta,
          so_tien: payload.so_tien,
          so_tai_khoan: payload.so_tai_khoan ?? null,
          ngan_hang: payload.ngan_hang ?? null,
          ngay_can_thanh_toan: payload.ngay_can_thanh_toan ?? null,
          hoa_don_url: payload.hoa_don_url ?? null,
          tao_boi: payload.tao_boi,
          trang_thai_duyet: "cho_duyet",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hoan_ung_list"] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
    },
  });
}

// Xóa — chỉ cho khi trang_thai_duyet='tu_choi' (giống DNTT thường)
export function useDeleteHoanUng() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hoan_ung_list"] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
    },
  });
}
