import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface DoanLogRow {
  id: number;
  doan_id: number;
  loai: "gia" | "su_co" | "ghi_chu";
  tieu_de: string;
  noi_dung: string | null;
  so_tien: number | null;
  is_resolved: boolean;
  created_by: string | null;
  created_by_ten: string | null;
  created_at: string;
}

export interface DoanLogGlobal extends DoanLogRow {
  doan_ten: string | null;
}

const QK = "doan_log";

export function useDoanLogList(doanId: number | undefined) {
  return useQuery<DoanLogRow[]>({
    queryKey: [QK, doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_log")
        .select("*")
        .eq("doan_id", doanId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DoanLogRow[];
    },
  });
}

export function useDoanLogGia() {
  return useQuery<DoanLogGlobal[]>({
    queryKey: [QK, "global", "gia"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_log")
        .select("*, doan:doan_id(ten_doan)")
        .eq("loai", "gia")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({ ...r, doan_ten: r.doan?.ten_doan ?? null }));
    },
  });
}

export function useDoanLogSuCo() {
  return useQuery<DoanLogGlobal[]>({
    queryKey: [QK, "global", "su_co"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_log")
        .select("*, doan:doan_id(ten_doan)")
        .eq("loai", "su_co")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({ ...r, doan_ten: r.doan?.ten_doan ?? null }));
    },
  });
}

export function useDoanLogGhiChu(userId: string | null | undefined) {
  return useQuery<DoanLogGlobal[]>({
    queryKey: [QK, "ghi_chu", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_log")
        .select("*, doan:doan_id(ten_doan)")
        .eq("loai", "ghi_chu")
        .eq("created_by", userId!)
        .eq("is_resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({ ...r, doan_ten: r.doan?.ten_doan ?? null }));
    },
  });
}

export function useCreateDoanLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      doan_id: number;
      doan_ten?: string;
      loai: "gia" | "su_co" | "ghi_chu";
      tieu_de: string;
      noi_dung?: string;
      so_tien?: number | null;
      created_by_ten?: string;
      created_by?: string;
    }) => {
      const { doan_ten, ...logPayload } = payload;
      const { data, error } = await externalSupabase
        .from("doan_log")
        .insert(logPayload)
        .select()
        .single();
      if (error) throw error;

      // Tạo thông báo cho giam_doc và admin (chỉ loai gia và su_co)
      if (payload.loai === "gia" || payload.loai === "su_co") {
        const { data: managers } = await externalSupabase
          .from("user_roles")
          .select("user_id")
          .in("vai_tro", ["giam_doc", "admin"]);

        if (managers && managers.length > 0) {
          const notifications = managers.map((m: any) => ({
            user_id: m.user_id,
            log_id: data.id,
            doan_id: payload.doan_id,
            doan_ten: doan_ten ?? null,
            loai: payload.loai,
            tieu_de: payload.tieu_de,
            noi_dung: payload.noi_dung ?? null,
          }));
          await externalSupabase.from("thong_bao").insert(notifications);
        }
      }

      return data as DoanLogRow;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: [QK, v.doan_id] });
      qc.invalidateQueries({ queryKey: [QK, "global", v.loai] });
      qc.invalidateQueries({ queryKey: [QK, "ghi_chu"] });
      qc.invalidateQueries({ queryKey: ["thong_bao"] });
    },
  });
}

export function useToggleResolved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doan_id, loai, is_resolved }: { id: number; doan_id: number; loai: string; is_resolved: boolean }) => {
      const { error } = await externalSupabase
        .from("doan_log")
        .update({ is_resolved })
        .eq("id", id);
      if (error) throw error;
      return { doan_id, loai };
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: [QK, v.doan_id] });
      qc.invalidateQueries({ queryKey: [QK, "global", v.loai] });
      qc.invalidateQueries({ queryKey: [QK, "ghi_chu"] });
    },
  });
}
