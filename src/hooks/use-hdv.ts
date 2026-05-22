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

export interface HdvMailInfo {
  id: number;
  ten: string;
  so_dien_thoai: string | null;
}

/** Lấy danh sách HDV (chính + phụ) của đoàn — empty array nếu chưa gán. */
export function useHdvsByDoanId(doanId: number | null | undefined) {
  return useQuery({
    queryKey: ["hdvs-by-doan", doanId],
    enabled: !!doanId,
    staleTime: 60_000,
    queryFn: async (): Promise<HdvMailInfo[]> => {
      const { data: doan, error: e1 } = await externalSupabase
        .from("doan")
        .select("huong_dan_vien_id, huong_dan_vien_id_2")
        .eq("id", doanId!)
        .maybeSingle();
      if (e1) throw e1;
      const ids = [doan?.huong_dan_vien_id, doan?.huong_dan_vien_id_2].filter(Boolean) as number[];
      if (ids.length === 0) return [];
      const { data, error } = await externalSupabase
        .from("huong_dan_vien")
        .select("id, ten, so_dien_thoai")
        .in("id", ids);
      if (error) throw error;
      // Giữ thứ tự HDV chính trước, phụ sau
      const byId = new Map((data ?? []).map((h) => [h.id, h as HdvMailInfo]));
      return ids.map((id) => byId.get(id)).filter(Boolean) as HdvMailInfo[];
    },
  });
}

/** Format 1 HDV: "Tên — SĐT" | "Tên" */
function formatOneHdv(hdv: HdvMailInfo): string {
  const sdt = hdv.so_dien_thoai?.trim();
  return sdt ? `${hdv.ten} — ${sdt}` : hdv.ten;
}

/** Format HDV (chính + phụ) cho email/Word: ghép bằng " | ". Empty → "Bổ sung sau". */
export function formatHdvsForEmail(hdvs: HdvMailInfo[] | null | undefined): string {
  if (!hdvs || hdvs.length === 0) return "Bổ sung sau";
  return hdvs.map(formatOneHdv).join(" | ");
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
