import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TablesUpdate } from "@/lib/database.types";
import { isFkViolation } from "@/lib/error";

// NCC vừa chọn đã bị xóa (danh sách trong form bị stale) → DB chặn FK. Làm mới list
// + báo người dùng chọn lại thay vì toast "Lỗi khi lưu" chung chung.
const NCC_STALE_MSG =
  "Nhà cung cấp vừa chọn không còn tồn tại. Danh sách đã được làm mới — vui lòng chọn lại.";

export interface CanhDiem {
  id: number;
  ten: string;
  dia_diem: string | null;
  gia_mac_dinh: number | null;
  don_vi: string | null;
  co_phi: boolean | null;
  foc_khach: number | null;
  foc_mien: number | null;
  ghi_chu: string | null;
  thong_tin_chung: string | null;
  nguoi_thanh_toan: string | null;
  icon: string | null;
  loai: string | null;
  ten_nha_cung_cap: string | null;
  so_dien_thoai: string | null;
  email: string | null;
  tai_khoan_thanh_toan: string | null;
  nha_cung_cap_id: number | null;
  khach_san_id: number | null;
  created_at: string;
}

const QK = "canh_diem_list";

export function useCanhDiemList() {
  return useQuery<CanhDiem[]>({
    queryKey: [QK],
    staleTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("canh_diem")
        .select("*")
        .order("ten", { ascending: true });
      if (error) throw error;
      return data as CanhDiem[];
    },
  });
}

export function useCreateCanhDiem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { ten: string; loai?: string; dia_diem?: string; nha_cung_cap_id?: number | null }) => {
      const { data, error } = await externalSupabase
        .from("canh_diem")
        .insert({
          ten: params.ten,
          loai: params.loai || "canh_diem",
          dia_diem: params.dia_diem || null,
          nha_cung_cap_id: params.nha_cung_cap_id || null,
        })
        .select()
        .single();
      if (error) {
        if (isFkViolation(error)) {
          qc.invalidateQueries({ queryKey: ["nha_cung_cap_list"] });
          throw new Error(NCC_STALE_MSG);
        }
        throw error;
      }
      return data as CanhDiem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useUpdateCanhDiem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; updates: TablesUpdate<"canh_diem"> }) => {
      const { error } = await externalSupabase
        .from("canh_diem")
        .update(params.updates)
        .eq("id", params.id);
      if (error) {
        if (isFkViolation(error)) {
          qc.invalidateQueries({ queryKey: ["nha_cung_cap_list"] });
          throw new Error(NCC_STALE_MSG);
        }
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}

export function useDeleteCanhDiem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("canh_diem")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QK] }),
  });
}
