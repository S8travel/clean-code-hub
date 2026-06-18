import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { TablesInsert } from "@/lib/database.types";

export interface BookingXeRow {
  id: number;
  doan_id: number;
  xe_id: number | null;           // loại xe (nha_xe_loai_xe) — mỗi xe 1 booking
  booking_status: string; // chua_dat | cho_xac_nhan | da_xac_nhan | da_huy
  sent_at: string | null;
  sent_by: string | null;
  confirm_at: string | null;
  email_thread_id: string | null;
  deadline: string | null;
  ghi_chu: string | null;
  updated_at: string;
  mail_content_hash: string | null;
}

const QK = (doanId: number) => ["doan_booking_xe", doanId];

/** Tất cả booking xe của đoàn (mỗi nhà xe 1 row). Consumer lọc theo xe_id. */
export function useBookingXe(doanId: number | undefined) {
  return useQuery<BookingXeRow[]>({
    queryKey: QK(doanId!),
    enabled: !!doanId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_booking_xe")
        .select("*")
        .eq("doan_id", doanId!);
      if (error) throw error;
      return (data ?? []) as BookingXeRow[];
    },
  });
}

export function useUpsertBookingXe() {
  const qc = useQueryClient();
  return useMutation({
    // PHẢI truyền xe_id để định danh booking của đúng nhà xe (onConflict doan_id,xe_id).
    mutationFn: async (payload: Partial<BookingXeRow> & { doan_id: number; xe_id: number | null }) => {
      const { error } = await externalSupabase
        .from("doan_booking_xe")
        .upsert(
          { ...payload, updated_at: new Date().toISOString() } as TablesInsert<"doan_booking_xe">,
          { onConflict: "doan_id,xe_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: QK(v.doan_id) }),
  });
}
