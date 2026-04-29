import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

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
        .select("id, ten, email, loai")
        .in("id", [...nhIds])
        .eq("loai", "tau_ngay");

      const tauMap = new Map<number, { ten: string; email: string | null }>(
        (nhList ?? []).map((n: any) => [n.id, { ten: n.ten, email: n.email }])
      );
      if (!tauMap.size) return [];

      // Fetch existing bookings
      const { data: bookings } = await externalSupabase
        .from("doan_booking_nh")
        .select("*, set_menu:set_menu_id(ten_set)")
        .eq("doan_id", doanId!);

      const bookingMap = new Map<string, any>();
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
            set_menu_id: bkg?.set_menu_id ?? null,
            set_menu_ten: (bkg?.set_menu as any)?.ten_set ?? null,
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
    }: Partial<TauNgayDisplayRow> & { doan_ngay_id: number; doan_id: number; bua_an: "trua" | "toi"; nha_hang_id: number }) => {
      if (booking_id) {
        const { error } = await externalSupabase
          .from("doan_booking_nh")
          .update(fields)
          .eq("id", booking_id);
        if (error) throw error;
      } else {
        const { error } = await externalSupabase
          .from("doan_booking_nh")
          .upsert({ doan_ngay_id, doan_id, bua_an, nha_hang_id, ...fields }, { onConflict: "doan_ngay_id,bua_an" });
        if (error) throw error;
      }
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
