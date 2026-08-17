import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { LopVon } from "@/lib/bao-gia-phien-ban";
import type { PortalBaoGiaSnapshot } from "@/lib/portal-payload";

// Phiên bản báo giá: mỗi lần bấm Gửi là một dòng, chỉ ghi thêm.
// Bảng bị khoá bất biến ở tầng DB (trigger + không cấp UPDATE/DELETE) nên ở đây
// KHÔNG có hàm sửa/xoá — cố viết cũng sẽ bị DB từ chối.

export interface PhienBanRow {
  id: number;
  bao_gia_id: number;
  so_phien_ban: number;
  ma_hien_thi: string;
  noi_dung_chao: PortalBaoGiaSnapshot;
  /** Lớp vốn — chỉ đọc trong CRM. Bản backfill cũ không có. */
  noi_dung_von: LopVon | null;
  chao_ngay: string;
  hieu_luc_den: string | null;
  ly_do: string | null;
  gui_boi_ten: string | null;
  gui_luc: string;
}

export interface BaoGiaLogRow {
  id: number;
  bao_gia_id: number;
  loai: "gui_ban" | "mo_phien_ban" | "thu_hoi" | string;
  noi_dung: string | null;
  tao_boi_ten: string | null;
  tao_luc: string;
}

const QK_PB = "bao_gia_phien_ban";
const QK_LOG = "bao_gia_log";

export function usePhienBanList(baoGiaId?: number) {
  return useQuery({
    queryKey: [QK_PB, baoGiaId],
    enabled: !!baoGiaId,
    queryFn: async (): Promise<PhienBanRow[]> => {
      const { data, error } = await externalSupabase
        .from("bao_gia_phien_ban")
        .select("*")
        .eq("bao_gia_id", baoGiaId!)
        .order("so_phien_ban", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PhienBanRow[];
    },
  });
}

export function useBaoGiaLog(baoGiaId?: number) {
  return useQuery({
    queryKey: [QK_LOG, baoGiaId],
    enabled: !!baoGiaId,
    queryFn: async (): Promise<BaoGiaLogRow[]> => {
      const { data, error } = await externalSupabase
        .from("bao_gia_log")
        .select("*")
        .eq("bao_gia_id", baoGiaId!)
        .order("tao_luc", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BaoGiaLogRow[];
    },
  });
}

/** Chốt một bản chào. RPC khoá dòng báo giá rồi mới cấp số nên bấm hai lần
 *  không ra hai phiên bản trùng số. */
export function useTaoPhienBan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      baoGiaId, chao, von, lyDo,
    }: {
      baoGiaId: number;
      chao: PortalBaoGiaSnapshot;
      von: LopVon;
      lyDo?: string;
    }): Promise<number> => {
      const { data, error } = await externalSupabase.rpc("tao_phien_ban_bao_gia", {
        p_bao_gia_id: baoGiaId,
        p_chao: chao as unknown as never,
        p_von: von as unknown as never,
        p_ly_do: lyDo ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as number;
    },
    onSuccess: (_id, { baoGiaId }) => {
      qc.invalidateQueries({ queryKey: ["bao_gia"] });
      qc.invalidateQueries({ queryKey: ["bao_gia", baoGiaId] });
      qc.invalidateQueries({ queryKey: [QK_PB, baoGiaId] });
      qc.invalidateQueries({ queryKey: [QK_LOG, baoGiaId] });
    },
  });
}
