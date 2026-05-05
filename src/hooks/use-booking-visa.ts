import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface BookingVisaRow {
  id: number;
  doan_id: number;
  don_vi_visa_id: number | null;
  booking_status: string; // chua_dat | cho_xac_nhan | da_xac_nhan | da_huy
  ghi_chu: string | null;
  sent_at: string | null;
  sent_by: string | null;
  confirm_at: string | null;
  email_thread_id: string | null;
  deadline: string | null;
  updated_at: string;
}

const QK = (doanId: number) => ["doan_booking_visa", doanId];

export function useBookingVisaList(doanId: number | undefined) {
  return useQuery<BookingVisaRow[]>({
    queryKey: QK(doanId!),
    enabled: !!doanId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_booking_visa")
        .select("*")
        .eq("doan_id", doanId!)
        .order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BookingVisaRow[];
    },
  });
}

export function useUpsertBookingVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<BookingVisaRow> & { doan_id: number }) => {
      const { error } = await externalSupabase
        .from("doan_booking_visa")
        .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: QK(v.doan_id) }),
  });
}

export function useInsertBookingVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { doan_id: number; don_vi_visa_id?: number | null; ghi_chu?: string | null }) => {
      const { error } = await externalSupabase
        .from("doan_booking_visa")
        .insert({ ...payload, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: QK(v.doan_id) }),
  });
}

export function useDeleteBookingVisa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doan_id }: { id: number; doan_id: number }) => {
      const { error } = await externalSupabase
        .from("doan_booking_visa")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { doan_id };
    },
    onSuccess: (res) => qc.invalidateQueries({ queryKey: QK(res.doan_id) }),
  });
}
