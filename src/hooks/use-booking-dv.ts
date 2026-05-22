import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BOOKING_CC } from "@/lib/booking-cc";
import type { TablesUpdate } from "@/lib/database.types";

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
  deadline: string | null;
  mail_content_hash: string | null;
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
      return (data ?? []).map((r) => ({
        ...r,
        dich_vu_list: (Array.isArray(r.dich_vu_list) ? r.dich_vu_list : []) as unknown as DichVuItem[],
      })) as BookingDVRow[];
    },
  });
}

export function useUpdateBookingDV() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: number;
      doan_id: number;
      updates: Record<string, unknown>;
    }) => {
      const { error } = await externalSupabase
        .from("doan_booking_dv")
        .update(params.updates as TablesUpdate<"doan_booking_dv">)
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
const SUPABASE_ANON_KEY = "sb_publishable_NDWgz5PzI38R-ouTHShYaw_6YhYjOIw";

export async function callSendBookingEmail(params: {
  to: string;
  cc?: readonly string[] | string[];
  subject: string;
  html: string;
  replyTo?: string;
  messageId?: string;
  inReplyTo?: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<string | null> {
  const res = await fetch(`${SUPABASE_EDGE_URL}/send-booking-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ...params, replyTo: params.replyTo || (await externalSupabase.auth.getSession()).data.session?.user?.email || undefined }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || "Lỗi gửi email qua server");
  }
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  return data.id ?? null;
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
      // mode='update' → giữ nguyên booking_status, chỉ update sent_at/by + email_thread_id
      mode?: "first" | "update";
      mailContentHash?: string;
    }) => {
      const isFirst = !params.emailThreadId;
      const newThreadId = isFirst ? crypto.randomUUID() : null;

      // KHÔNG pass messageId/inReplyTo: Resend ghi đè Message-ID → custom In-Reply-To invalid
      // → Gmail tạo thread mới. Bỏ → Gmail group theo Subject + From.
      // email_thread_id vẫn lưu (UUID) làm flag "đã gửi" để show nút "Gửi cập nhật".
      await callSendBookingEmail({
        to: params.to,
        cc: BOOKING_CC.dv,
        subject: params.subject, html: params.html, replyTo: params.replyTo,
      });

      const threadId = isFirst ? newThreadId : params.emailThreadId;

      const updatePayload: TablesUpdate<"doan_booking_dv"> = {
        sent_at: new Date().toISOString(),
        sent_by: params.sentBy,
        email_thread_id: threadId,
        email_subject: params.subject,
      };
      if (params.mode !== "update") updatePayload.booking_status = "cho_xac_nhan";
      if (params.mailContentHash !== undefined) updatePayload.mail_content_hash = params.mailContentHash;

      const { error: updateErr } = await externalSupabase
        .from("doan_booking_dv")
        .update(updatePayload)
        .eq("id", params.bookingId);
      if (updateErr) throw updateErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["doan_booking_dv", vars.doanId] });
    },
  });
}
