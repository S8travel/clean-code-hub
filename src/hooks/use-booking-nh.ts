import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BOOKING_CC } from "@/lib/booking-cc";

export interface BookingNHRow {
  id: number;
  doan_id: number;
  doan_ngay_id: number;
  bua_an: "trua" | "toi";
  nha_hang_id: number | null;
  set_menu_id: number | null;
  ten_set_snapshot: string | null;
  gia_snapshot: number | null;
  don_vi_snapshot: string | null;
  mon_an_snapshot: string[];
  ghi_chu: string | null;
  booking_status: string;
  sent_at: string | null;
  sent_by: string | null;
  email_thread_id: string | null;
  deadline: string | null;
  mail_content_hash: string | null;
  mail_sent_snapshot: Record<string, unknown> | null;
}

export interface MenuDayData {
  doan_ngay_id: number;
  ngay_so: number;
  ngay_date: string | null;
  thu: string | null;
  an_trua_nha_hang_id: number | null;
  an_trua_nha_hang_ten: string | null;
  an_trua_nha_hang_email: string | null;
  an_trua_nha_hang_loai: string | null;
  an_trua_set_menu_id: number | null;
  an_toi_nha_hang_id: number | null;
  an_toi_nha_hang_ten: string | null;
  an_toi_nha_hang_email: string | null;
  an_toi_nha_hang_loai: string | null;
  an_toi_set_menu_id: number | null;
  booking_trua: BookingNHRow | null;
  booking_toi: BookingNHRow | null;
  /** false khi nhà hàng đã bị xóa khỏi điều tour nhưng booking vẫn còn */
  trua_con_trong_tour: boolean;
  toi_con_trong_tour: boolean;
  /** Booking cũ còn đang gửi khi NH bị thay bằng NH khác */
  orphan_trua: { booking: BookingNHRow; nha_hang_id: number; nha_hang_ten: string | null; nha_hang_email: string | null } | null;
  orphan_toi:  { booking: BookingNHRow; nha_hang_id: number; nha_hang_ten: string | null; nha_hang_email: string | null } | null;
}

const QK = "doan_booking_nh";

export function useBookingNH(doanId: number | undefined) {
  return useQuery({
    queryKey: [QK, doanId],
    enabled: !!doanId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<MenuDayData[]> => {
      // 1. Get doan_ngay rows
      const { data: ngayRows, error: e1 } = await externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date, thu, an_trua_nha_hang_id, an_toi_nha_hang_id, an_trua_set_menu_id, an_toi_set_menu_id")
        .eq("doan_id", doanId!)
        .order("ngay_so", { ascending: true });
      if (e1) throw e1;
      if (!ngayRows?.length) return [];

      // 2. Get booking_nh rows (before nhIds so we can include orphaned nha_hang ids)
      const { data: bookings, error: e3 } = await externalSupabase
        .from("doan_booking_nh")
        .select("*")
        .eq("doan_id", doanId!);
      if (e3) throw e3;

      const bookingMap = new Map<string, BookingNHRow>();
      for (const b of bookings || []) {
        bookingMap.set(`${b.doan_ngay_id}_${b.bua_an}`, b as BookingNHRow);
      }

      // 3. Collect nha_hang ids: current assignments + orphaned booking nha_hang_ids
      const nhIds = new Set<number>();
      for (const r of ngayRows) {
        if (r.an_trua_nha_hang_id) nhIds.add(r.an_trua_nha_hang_id);
        if (r.an_toi_nha_hang_id) nhIds.add(r.an_toi_nha_hang_id);
      }
      for (const b of bookings || []) {
        if (b.nha_hang_id) nhIds.add(b.nha_hang_id);
      }

      let nhMap = new Map<number, { ten: string; email: string | null; nguoi_thanh_toan: string | null; loai: string }>();
      if (nhIds.size > 0) {
        const { data: nhList } = await externalSupabase
          .from("nha_hang")
          .select("id, ten, email, nguoi_thanh_toan, loai")
          .in("id", [...nhIds]);
        if (nhList) {
          nhMap = new Map(nhList.map((n: any) => [n.id, { ten: n.ten, email: n.email, nguoi_thanh_toan: n.nguoi_thanh_toan, loai: n.loai ?? 'nha_hang' }]));
        }
      }

      // 4. Merge — dùng effective nha_hang_id (assignment hiện tại hoặc orphaned booking)
      return ngayRows.map((r: any): MenuDayData => {
        const bkgTruaRaw = bookingMap.get(`${r.id}_trua`) || null;
        const bkgToiRaw  = bookingMap.get(`${r.id}_toi`)  || null;

        // Kiểm tra NH có bị đổi không (NH hiện tại khác với NH trong booking)
        const truaChanged = !!(r.an_trua_nha_hang_id && bkgTruaRaw && bkgTruaRaw.nha_hang_id !== r.an_trua_nha_hang_id);
        const toiChanged  = !!(r.an_toi_nha_hang_id  && bkgToiRaw  && bkgToiRaw.nha_hang_id  !== r.an_toi_nha_hang_id);

        // Nếu NH đổi: slot mới bắt đầu sạch, booking cũ lưu sang orphan (nếu đã gửi)
        const bkgTrua = truaChanged ? null : bkgTruaRaw;
        const bkgToi  = toiChanged  ? null : bkgToiRaw;

        // Orphan: booking cũ đã gửi (không phải chua_gui) khi NH bị đổi
        const orphanTrua = truaChanged && bkgTruaRaw!.booking_status !== "chua_gui" ? bkgTruaRaw! : null;
        const orphanToi  = toiChanged  && bkgToiRaw!.booking_status  !== "chua_gui" ? bkgToiRaw!  : null;

        const orphanTruaNH = orphanTrua ? nhMap.get(orphanTrua.nha_hang_id!) : null;
        const orphanToiNH  = orphanToi  ? nhMap.get(orphanToi.nha_hang_id!)  : null;

        // Effective id: ưu tiên assignment hiện tại, fallback về booking cũ (NH bị xóa hẳn)
        // Ẩn NH "khách thanh toán" khỏi booking tab
        const truaRawId = r.an_trua_nha_hang_id ?? (bkgTrua?.nha_hang_id ?? null);
        const toiRawId  = r.an_toi_nha_hang_id  ?? (bkgToi?.nha_hang_id  ?? null);
        // Only hide "khach" NH for slots with no existing booking — preserve existing bookings
        const truaId = (truaRawId && nhMap.get(truaRawId)?.nguoi_thanh_toan === "khach" && !bkgTrua) ? null : truaRawId;
        const toiId  = (toiRawId  && nhMap.get(toiRawId)?.nguoi_thanh_toan  === "khach" && !bkgToi)  ? null : toiRawId;

        const truaNH = truaId ? nhMap.get(truaId) : null;
        const toiNH  = toiId  ? nhMap.get(toiId)  : null;

        return {
          doan_ngay_id: r.id,
          ngay_so: r.ngay_so,
          ngay_date: r.ngay_date,
          thu: r.thu,
          an_trua_nha_hang_id: truaId,
          an_trua_nha_hang_ten: truaNH?.ten || null,
          an_trua_nha_hang_email: truaNH?.email || null,
          an_trua_nha_hang_loai: truaNH?.loai || null,
          an_trua_set_menu_id: r.an_trua_set_menu_id ?? null,
          an_toi_nha_hang_id: toiId,
          an_toi_nha_hang_ten: toiNH?.ten || null,
          an_toi_nha_hang_email: toiNH?.email || null,
          an_toi_nha_hang_loai: toiNH?.loai || null,
          an_toi_set_menu_id: r.an_toi_set_menu_id ?? null,
          booking_trua: bkgTrua,
          booking_toi: bkgToi,
          trua_con_trong_tour: !!r.an_trua_nha_hang_id,
          toi_con_trong_tour: !!r.an_toi_nha_hang_id,
          orphan_trua: orphanTrua ? { booking: orphanTrua, nha_hang_id: orphanTrua.nha_hang_id!, nha_hang_ten: orphanTruaNH?.ten || null, nha_hang_email: orphanTruaNH?.email || null } : null,
          orphan_toi:  orphanToi  ? { booking: orphanToi,  nha_hang_id: orphanToi.nha_hang_id!,  nha_hang_ten: orphanToiNH?.ten  || null, nha_hang_email: orphanToiNH?.email  || null } : null,
        };
      });
    },
  });
}

export function useUpsertBookingNH() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<BookingNHRow> & { doan_ngay_id: number; bua_an: string; doan_id: number }) => {
      const { data, error } = await externalSupabase
        .from("doan_booking_nh")
        .upsert(row, { onConflict: "doan_ngay_id,bua_an" })
        .select()
        .single();
      if (error) throw error;

      // Sync set_menu_id sang doan_ngay (tránh cascade Điều tour kéo cũ về)
      if ("set_menu_id" in row) {
        const col = row.bua_an === "trua" ? "an_trua_set_menu_id" : "an_toi_set_menu_id";
        await externalSupabase
          .from("doan_ngay")
          .update({ [col]: row.set_menu_id ?? null })
          .eq("id", row.doan_ngay_id);
      }
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: [QK, v.doan_id] });
      qc.invalidateQueries({ queryKey: ["doan_ngay", v.doan_id] });
    },
  });
}

export function useUpdateBookingNH() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doan_id, ...fields }: Partial<BookingNHRow> & { id: number; doan_id: number }) => {
      const { error } = await externalSupabase
        .from("doan_booking_nh")
        .update(fields)
        .eq("id", id);
      if (error) throw error;

      // Khi set_menu_id thay đổi → cascade sang doan_ngay.an_{bua}_set_menu_id
      // để tránh save Điều tour sau đó kéo giá trị cũ về (xem use-dieu-tour:893).
      if ("set_menu_id" in fields) {
        const { data: bk } = await externalSupabase
          .from("doan_booking_nh")
          .select("doan_ngay_id, bua_an")
          .eq("id", id)
          .maybeSingle();
        if (bk?.doan_ngay_id && bk.bua_an) {
          const col = bk.bua_an === "trua" ? "an_trua_set_menu_id" : "an_toi_set_menu_id";
          await externalSupabase
            .from("doan_ngay")
            .update({ [col]: fields.set_menu_id ?? null })
            .eq("id", bk.doan_ngay_id);
        }
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: [QK, v.doan_id] });
      qc.invalidateQueries({ queryKey: ["doan_ngay", v.doan_id] });
    },
  });
}

export function useDeleteBookingNH() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, doan_id }: { id: number; doan_id: number }) => {
      const { error } = await externalSupabase
        .from("doan_booking_nh")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK, v.doan_id] }),
  });
}

const SUPABASE_EDGE_URL = "https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbHNid29xem1ia256ZHBhZXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDAzNzcsImV4cCI6MjA4OTI3NjM3N30.RLsKYfH6XZw3Mcmk2fm1R6rKKzrtm0MLrYhtjIT--T0";

export function useSendNHBookingEmail() {
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
      // mode='update' → giữ nguyên booking_status, chỉ update sent_at + email_thread_id
      mode?: "first" | "update";
      mailContentHash?: string;
      mailSentSnapshot?: Record<string, unknown>;
    }) => {
      // EXPERIMENT: KHÔNG pass messageId/inReplyTo. Resend ghi đè Message-ID nên
      // In-Reply-To custom invalid → Gmail tạo thread mới. Bỏ → Gmail dựa Subject + From group.
      // email_thread_id vẫn lưu (= UUID) nhưng chỉ dùng làm flag "đã gửi" để show nút "Gửi cập nhật".
      const isFirst = !params.emailThreadId;
      const newThreadId = isFirst ? crypto.randomUUID() : null;

      const res = await fetch(`${SUPABASE_EDGE_URL}/send-booking-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: params.to,
          cc: BOOKING_CC.nh,
          subject: params.subject, html: params.html,
          replyTo: params.replyTo || (await externalSupabase.auth.getSession()).data.session?.user?.email || undefined,
          // KHÔNG pass messageId / inReplyTo → edge function bỏ qua header threading.
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Lỗi gửi email qua server");
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);

      const threadId = isFirst ? newThreadId : params.emailThreadId;

      // mode='update' → KHÔNG đổi booking_status, chỉ update sent_at/by + email_thread_id
      const updatePayload: Record<string, any> = {
        sent_at: new Date().toISOString(),
        sent_by: params.sentBy,
        email_thread_id: threadId,
        email_subject: params.subject,
      };
      if (params.mode !== "update") updatePayload.booking_status = "da_gui";
      if (params.mailContentHash !== undefined) updatePayload.mail_content_hash = params.mailContentHash;
      if (params.mailSentSnapshot !== undefined) updatePayload.mail_sent_snapshot = params.mailSentSnapshot;

      const { error } = await externalSupabase
        .from("doan_booking_nh")
        .update(updatePayload)
        .eq("id", params.bookingId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [QK, vars.doanId] });
    },
  });
}

export function useSetMenuOptions(nhaHangId: number | null) {
  return useQuery({
    queryKey: ["nh_set_menu_options", nhaHangId],
    enabled: !!nhaHangId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_hang_set_menu")
        .select("id, ten_set, gia, don_vi")
        .eq("nha_hang_id", nhaHangId!)
        .order("ten_set", { ascending: true });
      if (error) throw error;
      return data as { id: number; ten_set: string; gia: number | null; don_vi: string }[];
    },
  });
}

export function useSetMenuMons(setMenuId: number | null) {
  return useQuery({
    queryKey: ["nh_set_menu_mons", setMenuId],
    enabled: !!setMenuId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_hang_set_menu_mon")
        .select("ten_mon")
        .eq("set_menu_id", setMenuId!)
        .order("thu_tu", { ascending: true });
      if (error) throw error;
      return (data || []).map((m: any) => m.ten_mon as string);
    },
  });
}
