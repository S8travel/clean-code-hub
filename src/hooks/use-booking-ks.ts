import { externalSupabase } from "@/lib/supabase-external";
import { edgeAuthHeaders } from "@/lib/edge-fn-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BOOKING_CC } from "@/lib/booking-cc";
import type { KhachSanItem } from "./use-dieu-tour";
import type { TablesUpdate } from "@/lib/database.types";

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
  deadline: string | null;
  mail_content_hash: string | null;
  /** Subject mail đặt-trước/final đã gửi — mail hủy dùng `Re: <subject>` để cùng thread Gmail. */
  email_subject: string | null;
  // Vòng đời booking (Tầng 2, migration 20260708_ks_booking_lifecycle.sql)
  trang_thai: string | null;
  phi_huy: number | null;
  ly_do_huy: string | null;
  huy_luc: string | null;
  huy_boi: string | null;
  cong_no_id: number | null;
}

export interface BookingKSDisplay extends BookingKSRow {
  khach_san_ten: string;
  khach_san_email: string | null;
  khach_san_dia_chi: string | null;
  khach_san_dia_diem: string | null;
  khach_san_dia_diem_zh: string | null;
  khach_san_so_dien_thoai: string | null;
  khach_san_website: string | null;
  so_dem: number;
  ngay_dates: string[];
  /** Ngày KS được dùng dạng day-use (qua wrapper canh_diem), tách khỏi ngay_dates qua đêm */
  day_use_dates: string[];
  ks_ma_codes: string[];
  /** true if this hotel is still present in doan_ngay or used as day-use wrapper */
  con_trong_dieu_tour: boolean;
}

// Fetch ALL booking rows for a doan + aggregate day info from doan_ngay
export function useBookingKS(doanId: number | undefined) {
  return useQuery({
    queryKey: ["doan_booking_ks", doanId],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    enabled: !!doanId,
    queryFn: async () => {
      // 1. Get ALL booking rows for this doan (never filter by current doan_ngay).
      //    Booking đã hủy (Tầng 2 lifecycle) → hiện ở dải "Đã hủy" tab Chi phí,
      //    KHÔNG hiện ở tab Booking KS (khỏi gửi mail nhầm cho KS đã bỏ).
      const { data: bookings, error: e1 } = await externalSupabase
        .from("doan_booking_ks")
        .select("*")
        .eq("doan_id", doanId!)
        .neq("trang_thai", "da_huy")
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

      // Group ngay by khach_san_id (KS qua đêm)
      const grouped = new Map<number, { dates: string[]; codes: string[]; dayUseDates: string[] }>();
      for (const r of ngayRows || []) {
        const ksId = r.khach_san_id as number;
        if (!grouped.has(ksId)) grouped.set(ksId, { dates: [], codes: [], dayUseDates: [] });
        const g = grouped.get(ksId)!;
        if (r.ngay_date) g.dates.push(r.ngay_date);
        if (r.ks_ma_code) g.codes.push(r.ks_ma_code);
      }

      // 2b. Day-use KS: doan_ngay_item link đến canh_diem có khach_san_id
      const { data: itemRows, error: e2b } = await externalSupabase
        .from("doan_ngay_item")
        .select("doan_ngay_id, canh_diem:canh_diem_id (khach_san_id), doan_ngay:doan_ngay_id (ngay_date)")
        .eq("doan_id", doanId!);
      if (e2b) throw e2b;
      for (const it of itemRows || []) {
        // Joined relation: PostgREST trả object (single FK) — narrow an toàn.
        const canhDiem = it.canh_diem as { khach_san_id: number | null } | null;
        const doanNgay = it.doan_ngay as { ngay_date: string | null } | null;
        const ksId = canhDiem?.khach_san_id;
        const date = doanNgay?.ngay_date;
        if (!ksId || !date) continue;
        if (!grouped.has(ksId)) grouped.set(ksId, { dates: [], codes: [], dayUseDates: [] });
        grouped.get(ksId)!.dayUseDates.push(date);
      }

      // 3. Fetch khach_san info for all booking rows
      const allKsIds = [...new Set(bookings.map((b) => b.khach_san_id))];
      const { data: ksList, error: e3 } = await externalSupabase
        .from("khach_san")
        .select("id, ten, email, dia_chi, dia_diem, dia_diem_zh, so_dien_thoai, website, nguoi_thanh_toan")
        .in("id", allKsIds);
      if (e3) throw e3;

      const ksMap = new Map((ksList || []).map((k) => [k.id, k]));

      // 4. Merge — show all existing booking records regardless of current nguoi_thanh_toan
      // (preventing new creation for "khach" KS is handled in use-dieu-tour.ts)
      return bookings.map((b): BookingKSDisplay => {
        const ks = ksMap.get(b.khach_san_id);
        const g = grouped.get(b.khach_san_id) || { dates: [], codes: [], dayUseDates: [] };
        const uniqueDayUse = [...new Set(g.dayUseDates)];
        // Dedup ngày: 2 nhóm cùng KS cùng đêm → doan_ngay 2 rows cùng ngay_date.
        // KS book chung cho cả đoàn → đếm số đêm DISTINCT (không nhân đôi theo nhóm).
        const uniqueDates = [...new Set(g.dates)];
        return {
          ...b,
          khach_san_ten: ks?.ten || "—",
          khach_san_email: ks?.email || null,
          khach_san_dia_chi: ks?.dia_chi || null,
          khach_san_dia_diem: ks?.dia_diem || null,
          khach_san_dia_diem_zh: ks?.dia_diem_zh || null,
          khach_san_so_dien_thoai: ks?.so_dien_thoai || null,
          khach_san_website: ks?.website || null,
          so_dem: uniqueDates.length,
          ngay_dates: uniqueDates,
          day_use_dates: uniqueDayUse,
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
        .update(fields as TablesUpdate<"doan_booking_ks">)
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

// loai: 'dat_truoc' | 'final' | 'huy' | 'update'
// 'update' = gửi cập nhật, KHÔNG đổi status — chỉ update sent_at + sent_by + email_thread_id
export function useSendKSBookingEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      bookingId: number;
      loai: "dat_truoc" | "final" | "huy" | "update";
      to: string;
      subject: string;
      html: string;
      sentBy: string;
      replyTo?: string;
      emailThreadId?: string | null;
      mailContentHash?: string;
    }) => {
      const isFirst = !params.emailThreadId;
      const newThreadId = isFirst ? crypto.randomUUID() : null;

      // KHÔNG pass messageId/inReplyTo: Resend ghi đè Message-ID nên In-Reply-To custom invalid
      // → Gmail tạo thread mới. Bỏ → Gmail group theo Subject + From.
      // email_thread_id vẫn lưu (UUID) làm flag "đã gửi" để show nút "Gửi cập nhật".
      const res = await fetch(`${SUPABASE_EDGE_URL}/send-booking-email`, {
        method: "POST",
        headers: await edgeAuthHeaders(),
        body: JSON.stringify({
          to: params.to,
          cc: BOOKING_CC.ks,
          subject: params.subject, html: params.html,
          replyTo: params.replyTo || (await externalSupabase.auth.getSession()).data.session?.user?.email || undefined,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Lỗi gửi email qua server");
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);

      const threadId = isFirst ? newThreadId : params.emailThreadId;

      // Cập nhật trạng thái tương ứng
      const now = new Date().toISOString();
      let fields: Partial<BookingKSRow> = { email_thread_id: threadId };
      if (params.mailContentHash !== undefined) fields.mail_content_hash = params.mailContentHash;
      // Lưu subject để mail UNC sau này có thể vào cùng thread (Gmail group by subject).
      // Chỉ lưu cho 'final'/'dat_truoc' (mail chính). 'huy'/'update' sẽ vào cùng thread cũ.
      if (params.loai === "final" || params.loai === "dat_truoc") {
        fields.email_subject = params.subject;
      }
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
      } else if (params.loai === "huy") {
        fields = {
          ...fields,
          ks_final_status: "cho_ks_xac_nhan_huy",
          ks_final_sent_at: now,
          ks_final_sent_by: params.sentBy,
        };
      } else {
        // 'update' — gửi email cập nhật, KHÔNG đổi status. Chỉ update timestamp gần nhất.
        // (email_thread_id đã set ở fields phía trên — đảm bảo Resend In-Reply-To threading.)
        fields = {
          ...fields,
          ks_dat_truoc_sent_at: now,
          ks_dat_truoc_sent_by: params.sentBy,
        };
      }

      const { error } = await externalSupabase
        .from("doan_booking_ks")
        .update(fields as TablesUpdate<"doan_booking_ks">)
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

  const allFinal = rows.every((r) => r.ks_final_status === "ks_xac_nhan_final");
  const hasCancel = rows.some(
    (r) => r.ks_final_status === "cho_ks_xac_nhan_huy" || r.ks_final_status === "ks_xac_nhan_huy"
  );

  const status = allFinal ? "da_booking" : hasCancel ? "co_huy" : "dang_booking";
  await externalSupabase.from("doan").update({ booking_status: status }).eq("id", doanId);
}
