import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface DichVuItem {
  ten_dv: string;
  ngay_date: string;
  so_khach: number;
  don_gia: number;
}

export interface BookingDVRow {
  id: number;
  doan_id: number;
  ten_nha_cung_cap: string;
  email_nha_cung_cap: string | null;
  dich_vu_list: DichVuItem[];
  ghi_chu: string | null;
  booking_status: string;
  sent_at: string | null;
  sent_by: string | null;
  confirm_at: string | null;
  created_at: string;
  email_thread_id: string | null;
}

export function useBookingDVList(doanId: number | undefined) {
  return useQuery<BookingDVRow[]>({
    queryKey: ["doan_booking_dv", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_booking_dv")
        .select("*")
        .eq("doan_id", doanId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        dich_vu_list: Array.isArray(r.dich_vu_list) ? r.dich_vu_list : [],
      }));
    },
  });
}

export function useUpdateBookingDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: number;
      doan_id: number;
      updates: Record<string, any>;
    }) => {
      const { error } = await externalSupabase
        .from("doan_booking_dv")
        .update(params.updates)
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["doan_booking_dv", vars.doan_id] });
    },
  });
}

export function useDeleteBookingDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; doan_id: number }) => {
      const { error } = await externalSupabase
        .from("doan_booking_dv")
        .delete()
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["doan_booking_dv", vars.doan_id] });
    },
  });
}

const SUPABASE_EDGE_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHNid29xem1ia256ZHBhZXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDAzNzcsImV4cCI6MjA4OTI3NjM3N30.RLsKYfH6XZw3Mcmk2fm1R6rKKzrtm0MLrYhtjIT--T0";

export async function callSendBookingEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
}): Promise<void> {
  const res = await fetch(`${SUPABASE_EDGE_URL}/send-booking-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ...params, replyTo: params.replyTo || localStorage.getItem("crm_current_user_email") || undefined }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Lỗi gửi email qua server");
  }
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
}

export function useSendBookingEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      bookingId: number;
      doanId: number;
      to: string;
      subject: string;
      html: string;
      sentBy: string;
      replyTo?: string;
      emailThreadId?: string | null;
    }) => {
      const threadId = params.emailThreadId ?? crypto.randomUUID();
      const isFirst = !params.emailThreadId;

      await callSendBookingEmail({
        to: params.to, subject: params.subject, html: params.html, replyTo: params.replyTo,
        ...(isFirst ? { messageId: threadId } : { inReplyTo: threadId }),
      });

      const { error: updateErr } = await externalSupabase
        .from("doan_booking_dv")
        .update({
          booking_status: "cho_xac_nhan",
          sent_at: new Date().toISOString(),
          sent_by: params.sentBy,
          email_thread_id: threadId,
        })
        .eq("id", params.bookingId);
      if (updateErr) throw updateErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["doan_booking_dv", vars.doanId] });
    },
  });
}
