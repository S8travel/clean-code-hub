import { externalSupabase } from "@/lib/supabase-external";
import { useQuery } from "@tanstack/react-query";

export interface KSItem {
  doan_id: number;
  khach_san_ten: string;
  ks_dat_truoc_status: string;
  ks_final_status: string;
}

export interface NHItem {
  doan_id: number;
  nha_hang_ten: string | null;
  bua_an: "trua" | "toi";
  booking_status: string;
}

export interface DVItem {
  doan_id: number;
  ten_nha_cung_cap: string;
  booking_status: string;
}

export interface DNTTItem {
  doan_id: number;
  mo_ta: string | null;
  so_tien: number;
  trang_thai_duyet: string;
  payment_status: "unpaid" | "partial" | "paid";
  ref_loai: string | null;
  loai: string;
}

export interface TheodoiData {
  ksList: KSItem[];
  nhList: NHItem[];
  dvList: DVItem[];
  dnttList: DNTTItem[];
}

// Quan hệ join Supabase trả về object hoặc array tuỳ FK — lấy `ten` an toàn.
function nameOf(rel: unknown): string | null {
  const o = Array.isArray(rel) ? rel[0] : rel;
  if (o == null || typeof o !== "object") return null;
  const ten = (o as { ten?: unknown }).ten;
  return typeof ten === "string" ? ten : null;
}

export function useTheodoi() {
  return useQuery({
    queryKey: ["theo-doi"],
    staleTime: 30_000,
    queryFn: async (): Promise<TheodoiData> => {
      const [ksRes, nhRes, dvRes, dnttRes] = await Promise.all([
        // KS: join khach_san để lấy tên
        externalSupabase
          .from("doan_booking_ks")
          .select("doan_id, ks_dat_truoc_status, ks_final_status, khach_san:khach_san_id(ten)"),

        // NH: join nha_hang để lấy tên, lấy qua doan_booking_nh
        externalSupabase
          .from("doan_booking_nh")
          .select("doan_id, bua_an, booking_status, nha_hang:nha_hang_id(ten)"),

        // DV
        externalSupabase
          .from("doan_booking_dv")
          .select("doan_id, ten_nha_cung_cap, booking_status"),

        // ĐNTT — chỉ lấy per-doan (bỏ dinh_ky)
        externalSupabase
          .from("dntt_with_payment_status")
          .select("doan_id, mo_ta, so_tien, trang_thai_duyet, payment_status, ref_loai, loai")
          .not("doan_id", "is", null)
          .neq("loai", "dinh_ky")
          .neq("trang_thai_duyet", "da_huy"),
      ]);

      if (ksRes.error) throw ksRes.error;
      if (nhRes.error) throw nhRes.error;
      if (dvRes.error) throw dvRes.error;
      if (dnttRes.error) throw dnttRes.error;

      const ksList: KSItem[] = (ksRes.data ?? []).map((r) => ({
        doan_id: r.doan_id,
        khach_san_ten: nameOf(r.khach_san) ?? "—",
        ks_dat_truoc_status: r.ks_dat_truoc_status,
        ks_final_status: r.ks_final_status,
      }));

      const nhList: NHItem[] = (nhRes.data ?? []).map((r) => ({
        doan_id: r.doan_id,
        nha_hang_ten: nameOf(r.nha_hang) ?? null,
        bua_an: r.bua_an as "trua" | "toi",
        booking_status: r.booking_status,
      }));

      const dvList: DVItem[] = (dvRes.data ?? []).map((r) => ({
        doan_id: r.doan_id,
        ten_nha_cung_cap: r.ten_nha_cung_cap,
        booking_status: r.booking_status,
      }));

      const dnttList: DNTTItem[] = (dnttRes.data ?? []).map((r) => ({
        doan_id: r.doan_id!,
        mo_ta: r.mo_ta,
        so_tien: r.so_tien ?? 0,
        trang_thai_duyet: r.trang_thai_duyet ?? "",
        payment_status: (r.payment_status ?? "unpaid") as "unpaid" | "partial" | "paid",
        ref_loai: r.ref_loai ?? null,
        loai: r.loai ?? "",
      }));

      return { ksList, nhList, dvList, dnttList };
    },
  });
}
