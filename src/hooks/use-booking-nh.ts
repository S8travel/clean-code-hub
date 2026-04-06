import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
}

export interface MenuDayData {
  doan_ngay_id: number;
  ngay_so: number;
  ngay_date: string | null;
  thu: string | null;
  an_trua_nha_hang_id: number | null;
  an_trua_nha_hang_ten: string | null;
  an_trua_nha_hang_email: string | null;
  an_trua_set_menu_id: number | null;
  an_toi_nha_hang_id: number | null;
  an_toi_nha_hang_ten: string | null;
  an_toi_nha_hang_email: string | null;
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
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
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

      let nhMap = new Map<number, { ten: string; email: string | null }>();
      if (nhIds.size > 0) {
        const { data: nhList } = await externalSupabase
          .from("nha_hang")
          .select("id, ten, email")
          .in("id", [...nhIds]);
        if (nhList) {
          nhMap = new Map(nhList.map((n: any) => [n.id, { ten: n.ten, email: n.email }]));
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
        const truaId = r.an_trua_nha_hang_id ?? (bkgTrua?.nha_hang_id ?? null);
        const toiId  = r.an_toi_nha_hang_id  ?? (bkgToi?.nha_hang_id  ?? null);

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
          an_trua_set_menu_id: r.an_trua_set_menu_id ?? null,
          an_toi_nha_hang_id: toiId,
          an_toi_nha_hang_ten: toiNH?.ten || null,
          an_toi_nha_hang_email: toiNH?.email || null,
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
      return data;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK, v.doan_id] }),
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
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: [QK, v.doan_id] }),
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
    }) => {
      const res = await fetch(`${SUPABASE_EDGE_URL}/send-booking-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ to: params.to, subject: params.subject, html: params.html, replyTo: params.replyTo }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Lỗi gửi email qua server");
      }
      const data = await res.json();
      if (data?.error) throw new Error(data.error);

      const { error } = await externalSupabase
        .from("doan_booking_nh")
        .update({
          booking_status: "da_gui",
          sent_at: new Date().toISOString(),
          sent_by: params.sentBy,
        })
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
