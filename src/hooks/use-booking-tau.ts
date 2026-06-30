import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { upsertBookingNHByDayMeal } from "./use-booking-nh";

export interface TauNgayDisplayRow {
  booking_id: number | null;
  doan_ngay_id: number;
  doan_id: number;
  ngay_so: number;
  ngay_date: string | null;
  bua_an: "trua" | "toi";
  nha_hang_id: number;
  nha_hang_ten: string;
  nha_hang_email: string | null;
  nha_hang_website: string | null;
  set_menu_id: number | null;
  set_menu_ten: string | null;
  booking_status: string;
  sent_at: string | null;
  email_thread_id: string | null;
  deadline: string | null;
  dat_truoc_status: string;
  dat_truoc_sent_at: string | null;
  dat_truoc_sent_by: string | null;
  dat_truoc_confirm_at: string | null;
  final_status: string;
  final_sent_at: string | null;
  final_sent_by: string | null;
  final_confirm_at: string | null;
  mail_content_hash: string | null;
}

const QK = "doan_booking_tau";

export function useBookingTau(doanId: number | undefined) {
  return useQuery({
    queryKey: [QK, doanId],
    enabled: !!doanId,
    staleTime: 0,
    queryFn: async (): Promise<TauNgayDisplayRow[]> => {
      const { data: ngayRows, error: e1 } = await externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date, an_trua_nha_hang_id, an_toi_nha_hang_id")
        .eq("doan_id", doanId!)
        .order("ngay_so", { ascending: true });
      if (e1) throw e1;
      if (!ngayRows?.length) return [];

      // Collect all nha_hang ids referenced in this doan
      const nhIds = new Set<number>();
      for (const r of ngayRows) {
        if (r.an_trua_nha_hang_id) nhIds.add(r.an_trua_nha_hang_id);
        if (r.an_toi_nha_hang_id) nhIds.add(r.an_toi_nha_hang_id);
      }
      if (!nhIds.size) return [];

      // Fetch nha_hang filtered to tau_ngay only
      const { data: nhList } = await externalSupabase
        .from("nha_hang")
        .select("id, ten, email, website, loai")
        .in("id", [...nhIds])
        .eq("loai", "tau_ngay");

      const tauMap = new Map<number, { ten: string; email: string | null; website: string | null }>(
        (nhList ?? []).map((n) => [n.id, { ten: n.ten ?? "", email: n.email, website: n.website ?? null }]),
      );
      if (!tauMap.size) return [];

      // Fetch existing bookings
      const { data: bookings } = await externalSupabase
        .from("doan_booking_nh")
        .select("*, set_menu:set_menu_id(ten_set)")
        .eq("doan_id", doanId!);

      type BookingTauRow = NonNullable<typeof bookings>[number];
      const bookingMap = new Map<string, BookingTauRow>();
      for (const b of bookings ?? []) {
        bookingMap.set(`${b.doan_ngay_id}_${b.bua_an}`, b);
      }

      const rows: TauNgayDisplayRow[] = [];
      for (const r of ngayRows) {
        for (const bua of ["trua", "toi"] as const) {
          const nhId = bua === "trua" ? r.an_trua_nha_hang_id : r.an_toi_nha_hang_id;
          if (!nhId || !tauMap.has(nhId)) continue;
          const nh = tauMap.get(nhId)!;
          const bkg = bookingMap.get(`${r.id}_${bua}`) ?? null;
          rows.push({
            booking_id: bkg?.id ?? null,
            doan_ngay_id: r.id,
            doan_id: doanId!,
            ngay_so: r.ngay_so,
            ngay_date: r.ngay_date,
            bua_an: bua,
            nha_hang_id: nhId,
            nha_hang_ten: nh.ten,
            nha_hang_email: nh.email,
            nha_hang_website: nh.website,
            set_menu_id: bkg?.set_menu_id ?? null,
            set_menu_ten: (bkg?.set_menu as { ten_set?: string | null } | null)?.ten_set ?? null,
            booking_status: bkg?.booking_status ?? "chua_gui",
            sent_at: bkg?.sent_at ?? null,
            email_thread_id: bkg?.email_thread_id ?? null,
            deadline: bkg?.deadline ?? null,
            dat_truoc_status: bkg?.dat_truoc_status ?? "chua_gui",
            dat_truoc_sent_at: bkg?.dat_truoc_sent_at ?? null,
            dat_truoc_sent_by: bkg?.dat_truoc_sent_by ?? null,
            dat_truoc_confirm_at: bkg?.dat_truoc_confirm_at ?? null,
            final_status: bkg?.final_status ?? "chua_gui",
            final_sent_at: bkg?.final_sent_at ?? null,
            final_sent_by: bkg?.final_sent_by ?? null,
            final_confirm_at: bkg?.final_confirm_at ?? null,
            mail_content_hash: bkg?.mail_content_hash ?? null,
          });
        }
      }
      return rows;
    },
  });
}

export function useUpdateBookingTau() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      booking_id, doan_ngay_id, doan_id, bua_an, nha_hang_id, ...fields
    }: Partial<TauNgayDisplayRow> & { doan_ngay_id: number; doan_id: number; bua_an: "trua" | "toi"; nha_hang_id: number }): Promise<number> => {
      if (booking_id) {
        const { error } = await externalSupabase
          .from("doan_booking_nh")
          .update(fields)
          .eq("id", booking_id);
        if (error) throw error;
        return booking_id;
      }
      // ON CONFLICT KHÔNG dùng được với UNIQUE deferrable (xem upsertBookingNHByDayMeal).
      // Trả id mới để caller mở modal gửi mail ngay (khỏi cần bấm lần 2).
      const created = await upsertBookingNHByDayMeal({ doan_ngay_id, doan_id, bua_an, nha_hang_id, ...fields });
      return created.id;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: [QK, v.doan_id] });
      qc.invalidateQueries({ queryKey: ["doan_booking_nh", v.doan_id] });
    },
  });
}

export function fmtNgayTau(ngay_date: string | null, ngay_so: number): string {
  if (!ngay_date) return `Ngày ${ngay_so}`;
  try {
    return format(new Date(ngay_date + "T00:00:00"), "dd/MM/yyyy (EEEE)", { locale: vi });
  } catch {
    return `Ngày ${ngay_so}`;
  }
}
