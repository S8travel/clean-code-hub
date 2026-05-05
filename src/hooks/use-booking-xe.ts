import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface BookingXeRow {
  id: number;
  doan_id: number;
  booking_status: string; // chua_dat | cho_xac_nhan | da_xac_nhan | da_huy
  sent_at: string | null;
  sent_by: string | null;
  confirm_at: string | null;
  email_thread_id: string | null;
  deadline: string | null;
  ghi_chu: string | null;
  updated_at: string;
}

const QK = (doanId: number) => ["doan_booking_xe", doanId];

export function useBookingXe(doanId: number | undefined) {
  return useQuery<BookingXeRow | null>({
    queryKey: QK(doanId!),
    enabled: !!doanId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_booking_xe")
        .select("*")
        .eq("doan_id", doanId!)
        .maybeSingle();
      if (error) throw error;
      return data as BookingXeRow | null;
    },
  });
}

export function useUpsertBookingXe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<BookingXeRow> & { doan_id: number }) => {
      const { error } = await externalSupabase
        .from("doan_booking_xe")
        .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "doan_id" });
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: QK(v.doan_id) }),
  });
}
