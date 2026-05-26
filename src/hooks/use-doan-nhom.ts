import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";

/**
 * Hook quản lý nhóm trong đoàn (1 đoàn → N nhóm).
 *
 * Phase 2: cho phép user thêm nhóm 2 (vd "Tham quan 75 khách" + "Golf 25 khách").
 * Mỗi nhóm có lịch trình `doan_ngay` riêng.
 *
 * Khi đoàn chỉ có 1 nhóm "Toàn đoàn" (mặc định), UI ẩn tabs — UX hệt như cũ.
 */

export interface DoanNhomRow {
  id: number;
  doan_id: number;
  ten_nhom: string;
  thu_tu: number;
  so_khach_lon: number | null;
  so_khach_em1: number | null;
  so_khach_em2: number | null;
  so_khach_tl: number | null;
  hdv_id: number | null;
  xe_id: number | null;
  ghi_chu: string | null;
  created_at: string;
  updated_at: string;
}

const QK = "doan_nhom";

export function useDoanNhomList(doanId?: number | null) {
  return useQuery({
    queryKey: [QK, doanId],
    enabled: !!doanId,
    queryFn: async (): Promise<DoanNhomRow[]> => {
      const { data, error } = await externalSupabase
        .from("doan_nhom")
        .select("*")
        .eq("doan_id", doanId!)
        .order("thu_tu", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DoanNhomRow[];
    },
  });
}

/**
 * Tạo nhóm mới cho đoàn. thu_tu auto = max(thu_tu hiện tại) + 1.
 * Default ten_nhom = "Nhóm N".
 */
export function useCreateDoanNhom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      doanId: number;
      tenNhom?: string;
      soKhachLon?: number | null;
      soKhachEm1?: number | null;
      soKhachEm2?: number | null;
      soKhachTl?: number | null;
      hdvId?: number | null;
      xeId?: number | null;
      ghiChu?: string | null;
    }): Promise<DoanNhomRow> => {
      const { doanId } = params;
      const { data: existing } = await externalSupabase
        .from("doan_nhom")
        .select("thu_tu")
        .eq("doan_id", doanId)
        .order("thu_tu", { ascending: false })
        .limit(1);
      const nextThuTu = ((existing?.[0]?.thu_tu ?? 0) as number) + 1;

      const payload: TablesInsert<"doan_nhom"> = {
        doan_id: doanId,
        ten_nhom: params.tenNhom?.trim() || `Nhóm ${nextThuTu}`,
        thu_tu: nextThuTu,
        so_khach_lon: params.soKhachLon ?? null,
        so_khach_em1: params.soKhachEm1 ?? null,
        so_khach_em2: params.soKhachEm2 ?? null,
        so_khach_tl: params.soKhachTl ?? null,
        hdv_id: params.hdvId ?? null,
        xe_id: params.xeId ?? null,
        ghi_chu: params.ghiChu ?? null,
      };
      const { data, error } = await externalSupabase
        .from("doan_nhom")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as DoanNhomRow;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QK, vars.doanId] });
    },
  });
}

export function useUpdateDoanNhom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: number;
      doanId: number;
      updates: Omit<TablesUpdate<"doan_nhom">, "id" | "doan_id" | "created_at" | "updated_at">;
    }) => {
      const { error } = await externalSupabase
        .from("doan_nhom")
        .update(params.updates)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QK, vars.doanId] });
    },
  });
}

/**
 * Xóa nhóm. CASCADE sẽ xóa toàn bộ doan_ngay của nhóm đó (qua FK).
 * KHÔNG cho phép xóa nhóm cuối cùng (đoàn phải có ít nhất 1 nhóm).
 */
export function useDeleteDoanNhom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; doanId: number }) => {
      // Guard: phải còn ít nhất 1 nhóm sau khi xóa
      const { count } = await externalSupabase
        .from("doan_nhom")
        .select("id", { count: "exact", head: true })
        .eq("doan_id", params.doanId);
      if ((count ?? 0) <= 1) {
        throw new Error("Đoàn phải có ít nhất 1 nhóm — không thể xóa nhóm cuối cùng");
      }
      const { error } = await externalSupabase
        .from("doan_nhom")
        .delete()
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QK, vars.doanId] });
    },
  });
}
