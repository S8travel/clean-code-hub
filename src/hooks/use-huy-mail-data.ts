import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import { useBookingKS } from "@/hooks/use-booking-ks";
import { useBookingNH } from "@/hooks/use-booking-nh";
import { useBookingDVList } from "@/hooks/use-booking-dv";
import { useBookingTau } from "@/hooks/use-booking-tau";
import type {
  HuyCollectInput, KsCollectRow, NhCollectDay, DvCollectRow, TauCollectRow, XeCollectRow, VisaCollectRow,
} from "@/lib/booking-mail/huy-collect";

// Nạp đủ 6 nguồn booking của 1 đoàn cho HuyDoanBatchModal. KS/NH/DV/tàu tái dùng
// hook có sẵn; xe/visa join riêng (hook gốc trả row thô, thiếu tên/email NCC).
// Chỉ chạy khi enabled (modal mở) để không tốn query khi đóng.

// PostgREST embed có thể trả object HOẶC array — chuẩn hoá về object đầu tiên.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

interface XeJoinRow {
  id: number;
  booking_status: string;
  xe: { ten_xe: string | null; so_cho: number | null; nha_xe: { ten: string | null; email: string | null } | { ten: string | null; email: string | null }[] | null } | Array<{ ten_xe: string | null; so_cho: number | null; nha_xe: unknown }> | null;
}

interface VisaJoinRow {
  id: number;
  booking_status: string;
  don_vi: { ten: string | null; email: string | null } | { ten: string | null; email: string | null }[] | null;
}

export interface HuyMailData extends HuyCollectInput {
  isLoading: boolean;
}

// Mảng rỗng ổn định (module-level) — dùng khi query chưa có data, tránh ref mới mỗi render.
const EMPTY_XE: XeCollectRow[] = [];
const EMPTY_VISA: VisaCollectRow[] = [];

export function useHuyMailData(doanId: number, enabled: boolean): HuyMailData {
  const ks = useBookingKS(enabled ? doanId : undefined);
  const nh = useBookingNH(enabled ? doanId : undefined);
  const dv = useBookingDVList(enabled ? doanId : undefined);
  const tau = useBookingTau(enabled ? doanId : undefined);

  const xe = useQuery({
    queryKey: ["huy_xe_data", doanId],
    enabled: enabled && !!doanId,
    queryFn: async (): Promise<XeCollectRow[]> => {
      const { data, error } = await externalSupabase
        .from("doan_booking_xe")
        .select("id, booking_status, xe:nha_xe_loai_xe!xe_id(ten_xe, so_cho, nha_xe:nha_xe_id(ten, email))")
        .eq("doan_id", doanId);
      if (error) throw error;
      return ((data ?? []) as unknown as XeJoinRow[]).map((r) => {
        const xeInfo = one(r.xe as never) as { ten_xe: string | null; so_cho: number | null; nha_xe: unknown } | null;
        const nhaXe = one(xeInfo?.nha_xe as never) as { ten: string | null; email: string | null } | null;
        return {
          id: r.id,
          booking_status: r.booking_status,
          tenNhaXe: nhaXe?.ten ?? "—",
          email: nhaXe?.email ?? null,
          tenXe: xeInfo?.ten_xe ?? null,
          soCho: xeInfo?.so_cho ?? null,
        };
      });
    },
  });

  const visa = useQuery({
    queryKey: ["huy_visa_data", doanId],
    enabled: enabled && !!doanId,
    queryFn: async (): Promise<VisaCollectRow[]> => {
      const { data, error } = await externalSupabase
        .from("doan_booking_visa")
        .select("id, booking_status, don_vi:don_vi_visa_id(ten, email)")
        .eq("doan_id", doanId);
      if (error) throw error;
      return ((data ?? []) as unknown as VisaJoinRow[]).map((r) => {
        const dv = one(r.don_vi);
        return {
          id: r.id,
          booking_status: r.booking_status,
          tenDonVi: dv?.ten ?? "—",
          email: dv?.email ?? null,
        };
      });
    },
  });

  // KS hook trả BookingKSDisplay[]; map về lean KsCollectRow.
  // MEMO bắt buộc: consumer (HuyDoanBatchModal) đưa các mảng này vào useMemo/effect
  // deps. Nếu .map() chạy mỗi render → ref mới → effect rebuild → setRows → lặp vô
  // hạn ("Maximum update depth"). React Query `.data` ổn định ref khi data không đổi.
  const ksRows: KsCollectRow[] = useMemo(() => (ks.data ?? []).map((r) => ({
    id: r.id,
    ks_dat_truoc_status: r.ks_dat_truoc_status,
    ks_final_status: r.ks_final_status,
    khach_san_ten: r.khach_san_ten,
    khach_san_email: r.khach_san_email,
    email_subject: r.email_subject,
    ngay_dates: r.ngay_dates,
  })), [ks.data]);

  // NH hook trả MenuDayData[]; map về lean NhCollectDay.
  const nhDays: NhCollectDay[] = useMemo(() => (nh.data ?? []).map((d) => ({
    doan_ngay_id: d.doan_ngay_id,
    ngay_date: d.ngay_date,
    booking_trua: d.booking_trua ? { id: d.booking_trua.id, booking_status: d.booking_trua.booking_status, email_subject: d.booking_trua.email_subject } : null,
    booking_toi: d.booking_toi ? { id: d.booking_toi.id, booking_status: d.booking_toi.booking_status, email_subject: d.booking_toi.email_subject } : null,
    an_trua_nha_hang_ten: d.an_trua_nha_hang_ten,
    an_trua_nha_hang_email: d.an_trua_nha_hang_email,
    an_trua_nha_hang_loai: d.an_trua_nha_hang_loai,
    an_toi_nha_hang_ten: d.an_toi_nha_hang_ten,
    an_toi_nha_hang_email: d.an_toi_nha_hang_email,
    an_toi_nha_hang_loai: d.an_toi_nha_hang_loai,
    orphan_trua: d.orphan_trua
      ? { booking: { id: d.orphan_trua.booking.id, booking_status: d.orphan_trua.booking.booking_status, email_subject: d.orphan_trua.booking.email_subject }, nha_hang_ten: d.orphan_trua.nha_hang_ten, nha_hang_email: d.orphan_trua.nha_hang_email }
      : null,
    orphan_toi: d.orphan_toi
      ? { booking: { id: d.orphan_toi.booking.id, booking_status: d.orphan_toi.booking.booking_status, email_subject: d.orphan_toi.booking.email_subject }, nha_hang_ten: d.orphan_toi.nha_hang_ten, nha_hang_email: d.orphan_toi.nha_hang_email }
      : null,
  })), [nh.data]);

  const dvRows: DvCollectRow[] = useMemo(() => (dv.data ?? []).map((r) => ({
    id: r.id,
    ten_nha_cung_cap: r.ten_nha_cung_cap,
    email_nha_cung_cap: r.email_nha_cung_cap,
    dich_vu_list: (r.dich_vu_list ?? []).map((d) => ({ ten_dv: d.ten_dv, ngay_date: d.ngay_date, so_khach: d.so_khach })),
    booking_status: r.booking_status,
    email_subject: r.email_subject,
  })), [dv.data]);

  const tauRows: TauCollectRow[] = useMemo(() => (tau.data ?? []).map((r) => ({
    booking_id: r.booking_id,
    ngay_date: r.ngay_date,
    ngay_so: r.ngay_so,
    bua_an: r.bua_an,
    nha_hang_ten: r.nha_hang_ten,
    nha_hang_email: r.nha_hang_email,
    email_subject: r.email_subject,
    dat_truoc_status: r.dat_truoc_status,
    final_status: r.final_status,
  })), [tau.data]);

  // `xe.data ?? EMPTY` với EMPTY ổn định — tránh tạo [] mới mỗi render lúc đang tải.
  const xeRows = xe.data ?? EMPTY_XE;
  const visaRows = visa.data ?? EMPTY_VISA;

  return {
    ks: ksRows,
    nhDays,
    dv: dvRows,
    tau: tauRows,
    xe: xeRows,
    visa: visaRows,
    isLoading: ks.isLoading || nh.isLoading || dv.isLoading || tau.isLoading || xe.isLoading || visa.isLoading,
  };
}
