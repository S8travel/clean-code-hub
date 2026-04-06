import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { KhachSanItem } from "./use-dieu-tour";

export interface BookingKSRow {
  id: number;
  doan_id: number;
  khach_san_id: number;
  ks_dat_truoc: string | null;
  ks_dat_truoc_status: string;
  ks_dat_truoc_sent_at: string | null;
  ks_dat_truoc_sent_by: string | null;
  ks_dat_truoc_confirm_at: string | null;
  ks_final: string | null;
  ks_final_status: string;
  ks_final_sent_at: string | null;
  ks_final_sent_by: string | null;
  ks_final_confirm_at: string | null;
  ks_ghi_chu_booking: string | null;
  email_thread_id: string | null;
}

export interface BookingKSDisplay extends BookingKSRow {
  khach_san_ten: string;
  khach_san_email: string | null;
  khach_san_dia_chi: string | null;
  khach_san_dia_diem: string | null;
  khach_san_so_dien_thoai: string | null;
  khach_san_website: string | null;
  so_dem: number;
  ngay_dates: string[];
  ks_ma_codes: string[];
  /** true if this hotel is still present in doan_ngay */
  con_trong_dieu_tour: boolean;
}

// Fetch ALL booking rows for a doan + aggregate day info from doan_ngay
export function useBookingKS(doanId: number | undefined) {
  return useQuery({
    queryKey: ["doan_booking_ks", doanId],
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    enabled: !!doanId,
    queryFn: async () => {
      // 1. Get ALL booking rows for this doan (never filter by current doan_ngay)
      const { data: bookings, error: e1 } = await externalSupabase
        .from("doan_booking_ks")
        .select("*")
        .eq("doan_id", doanId!)
        .order("id", { ascending: true });
      if (e1) throw e1;
      if (!bookings || bookings.length === 0) return [];

      // 2. Get current doan_ngay with khach_san assigned (for date tags)
      const { data: ngayRows, error: e2 } = await externalSupabase
        .from("doan_ngay")
        .select("khach_san_id, ngay_date, ks_ma_code")
        .eq("doan_id", doanId!)
        .not("khach_san_id", "is", null)
        .order("ngay_date");
      if (e2) throw e2;

      // Group ngay by khach_san_id
      const grouped = new Map<number, { dates: string[]; codes: string[] }>();
      for (const r of ngayRows || []) {
        const ksId = r.khach_san_id as number;
        if (!grouped.has(ksId)) grouped.set(ksId, { dates: [], codes: [] });
        const g = grouped.get(ksId)!;
        if (r.ngay_date) g.dates.push(r.ngay_date);
        if (r.ks_ma_code) g.codes.push(r.ks_ma_code);
      }

      // 3. Fetch khach_san info for all booking rows
      const allKsIds = [...new Set(bookings.map((b: any) => b.khach_san_id))];
      const { data: ksList, error: e3 } = await externalSupabase
        .from("khach_san")
        .select("id, ten, email, dia_chi, dia_diem, so_dien_thoai, website")
        .in("id", allKsIds);
      if (e3) throw e3;

      const ksMap = new Map((ksList || []).map((k: any) => [k.id, k]));

      // 4. Merge
      return (bookings as any[]).map((b): BookingKSDisplay => {
        const ks = ksMap.get(b.khach_san_id) || ({} as any);
        const g = grouped.get(b.khach_san_id) || { dates: [], codes: [] };
        return {
          ...b,
          khach_san_ten: ks.ten || "—",
          khach_san_email: ks.email || null,
          khach_san_dia_chi: ks.dia_chi || null,
          khach_san_dia_diem: ks.dia_diem || null,
          khach_san_so_dien_thoai: ks.so_dien_thoai || null,
          khach_san_website: ks.website || null,
          so_dem: g.dates.length,
          ngay_dates: g.dates,
          ks_ma_codes: [...new Set(g.codes.filter(Boolean))],
          con_trong_dieu_tour: grouped.has(b.khach_san_id),
        };
      });
    },
  });
}

// Update a single booking row field
export function useUpdateBookingKS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fields }: { id: number; fields: Partial<BookingKSRow> }) => {
      const { error } = await externalSupabase
        .from("doan_booking_ks")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doan_booking_ks"] });
    },
  });
}

// Delete a booking row
export function useDeleteBookingKS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase
        .from("doan_booking_ks")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doan_booking_ks"] });
    },
  });
}

const SUPABASE_EDGE_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHNid29xem1ia256ZHBhZXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDAzNzcsImV4cCI6MjA4OTI3NjM3N30.RLsKYfH6XZw3Mcmk2fm1R6rKKzrtm0MLrYhtjIT--T0";

// loai: 'dat_truoc' | 'final' | 'huy'
export function useSendKSBookingEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      bookingId: number;
      loai: "dat_truoc" | "final" | "huy";
      to: string;
      subject: string;
      html: string;
      sentBy: string;
      replyTo?: string;
      emailThreadId?: string | null;
    }) => {
      const threadId = params.emailThreadId ?? crypto.randomUUID();
      const isFirst = !params.emailThreadId;

      const res = await fetch(`${SUPABASE_EDGE_URL}/send-booking-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: params.to, subject: params.subject, html: params.html,
          replyTo: params.replyTo || localStorage.getItem("crm_current_user_email") || undefined,
          ...(isFirst ? { messageId: threadId } : { inReplyTo: threadId }),
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Lỗi gửi email qua server");
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);

      // Cập nhật trạng thái tương ứng
      const now = new Date().toISOString();
      let fields: Partial<BookingKSRow> = { email_thread_id: threadId };
      if (params.loai === "dat_truoc") {
        fields = {
          ...fields,
          ks_dat_truoc_status: "cho_ks_xac_nhan",
          ks_dat_truoc_sent_at: now,
          ks_dat_truoc_sent_by: params.sentBy,
        };
      } else if (params.loai === "final") {
        fields = {
          ...fields,
          ks_final_status: "cho_ks_xac_nhan",
          ks_final_sent_at: now,
          ks_final_sent_by: params.sentBy,
        };
      } else {
        // huy
        fields = {
          ...fields,
          ks_final_status: "cho_ks_xac_nhan_huy",
          ks_final_sent_at: now,
          ks_final_sent_by: params.sentBy,
        };
      }

      const { error } = await externalSupabase
        .from("doan_booking_ks")
        .update(fields)
        .eq("id", params.bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doan_booking_ks"] });
    },
  });
}

// Update doan.booking_status based on all booking rows
export async function syncBookingStatus(doanId: number) {
  const { data: rows } = await externalSupabase
    .from("doan_booking_ks")
    .select("ks_dat_truoc_status, ks_final_status")
    .eq("doan_id", doanId);

  if (!rows || rows.length === 0) return;

  const allFinal = rows.every((r: any) => r.ks_final_status === "ks_xac_nhan_final");
  const hasCancel = rows.some(
    (r: any) => r.ks_final_status === "cho_ks_xac_nhan_huy" || r.ks_final_status === "ks_xac_nhan_huy"
  );

  const status = allFinal ? "da_booking" : hasCancel ? "co_huy" : "dang_booking";
  await externalSupabase.from("doan").update({ booking_status: status }).eq("id", doanId);
}
