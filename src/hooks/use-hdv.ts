import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";

export interface HDVRow {
  id: number;
  ten: string;
  gioi_tinh: string | null;   // "nam" | "nu" | "khac"
  nam_sinh: number | null;
  kinh_nghiem: string | null;
  chuyen_mon: string | null;
  agent_ids: number[] | null;
  ghi_chu: string | null;
  so_dien_thoai: string | null;
  so_tai_khoan: string | null;
  ngan_hang: string | null;
  active: boolean;
  dia_diem_ids: number[];
  bac: number;  // 1–5, bậc ưu tiên xếp (1 cao nhất)
}

/** Lấy HDV (ten + so_dien_thoai) đã gắn cho 1 đoàn. Trả null nếu doan chưa có HDV. */
export function useHdvByDoanId(doanId: number | null | undefined) {
  return useQuery({
    queryKey: ["hdv-by-doan", doanId],
    enabled: !!doanId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: doan, error: e1 } = await externalSupabase
        .from("doan")
        .select("huong_dan_vien_id")
        .eq("id", doanId!)
        .maybeSingle();
      if (e1) throw e1;
      const hdvId = doan?.huong_dan_vien_id;
      if (!hdvId) return null;
      const { data, error } = await externalSupabase
        .from("huong_dan_vien")
        .select("id, ten, so_dien_thoai")
        .eq("id", hdvId)
        .maybeSingle();
      if (error) throw error;
      return data as { id: number; ten: string; so_dien_thoai: string | null } | null;
    },
  });
}

/** Format HDV cho email: "Tên — SĐT" | "Tên" | "Bổ sung sau". */
export function formatHdvForEmail(hdv: { ten: string; so_dien_thoai: string | null } | null | undefined): string {
  if (!hdv?.ten) return "Bổ sung sau";
  const sdt = hdv.so_dien_thoai?.trim();
  return sdt ? `${hdv.ten} — ${sdt}` : hdv.ten;
}

export function useHDVList() {
  return useQuery({
    queryKey: ["hdv-list"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("huong_dan_vien")
        .select("*")
        .order("ten");
      if (error) throw error;
      return data as HDVRow[];
    },
  });
}

export function useCreateHDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<HDVRow, "id">) => {
      const { data, error } = await externalSupabase
        .from("huong_dan_vien")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as HDVRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hdv-list"] });
      qc.invalidateQueries({ queryKey: ["huong_dan_vien"] });
    },
  });
}

export function useUpdateHDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...rest }: Partial<HDVRow> & { id: number }) => {
      const { data, error } = await externalSupabase
        .from("huong_dan_vien")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as HDVRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hdv-list"] });
      qc.invalidateQueries({ queryKey: ["huong_dan_vien"] });
    },
  });
}

export function useDeleteHDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("huong_dan_vien")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hdv-list"] });
      qc.invalidateQueries({ queryKey: ["huong_dan_vien"] });
    },
  });
}
