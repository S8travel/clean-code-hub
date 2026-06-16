import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { Json } from "@/lib/database.types";
import {
  buildMovableList,
  type BuaAn,
  type MovableBooking,
  type DayMealSlot,
  type RemapMappingItem,
} from "@/lib/remap-nha-hang";

export interface RemapData {
  multiNhom: boolean;          // đoàn nhiều nhóm → UI ẩn nút (RPC cũng chặn)
  movable: MovableBooking[];
  slots: DayMealSlot[];
  ngayList: { doan_ngay_id: number; ngay_so: number; ngay_date: string | null }[];
}

const BUAS: BuaAn[] = ["trua", "toi"];

// Fetch booking NH + slot ngày để feed modal "Xếp lại nhà hàng theo ngày".
// Slot occupancy suy TỪ BẢNG booking (khớp đúng RPC: UNIQUE(doan_ngay_id,bua_an) +
// guard ô-đích-bị-booking-khác-chiếm dựa trên booking row).
export function useRemapNhData(doanId: number | null | undefined, enabled = true) {
  return useQuery<RemapData>({
    queryKey: ["remap-nh-movable", doanId],
    enabled: !!doanId && enabled,
    queryFn: async () => {
      const id = doanId!;

      const [nhomRes, ngayRes, bkRes, cpRes] = await Promise.all([
        externalSupabase.from("doan_nhom").select("id").eq("doan_id", id),
        externalSupabase
          .from("doan_ngay")
          .select("id, ngay_so, ngay_date, an_trua_nha_hang_id, an_toi_nha_hang_id")
          .eq("doan_id", id)
          .order("ngay_so"),
        externalSupabase
          .from("doan_booking_nh")
          .select("id, doan_ngay_id, bua_an, nha_hang_id, booking_status, nha_hang:nha_hang_id(ten, loai)")
          .eq("doan_id", id),
        externalSupabase
          .from("doan_chi_phi")
          .select("ngay_so, mo_ta")
          .eq("doan_id", id)
          .eq("danh_muc", "nha_hang"),
      ]);
      for (const r of [nhomRes, ngayRes, bkRes, cpRes]) {
        if (r.error) throw r.error;
      }

      const multiNhom = (nhomRes.data?.length ?? 0) > 1;
      const ngayRows = ngayRes.data ?? [];
      const ngaySoById = new Map<number, number>(ngayRows.map((d) => [d.id, d.ngay_so]));

      // extras set: `${ngay_so}|${bua}` có chi phí phát sinh ([trua]/[toi]) → chặn remap (V1)
      const extras = new Set<string>();
      for (const cp of cpRes.data ?? []) {
        const mt = cp.mo_ta ?? "";
        if (mt.startsWith("[trua] ")) extras.add(`${cp.ngay_so}|trua`);
        else if (mt.startsWith("[toi] ")) extras.add(`${cp.ngay_so}|toi`);
      }

      type BkRow = {
        id: number; doan_ngay_id: number; bua_an: string; nha_hang_id: number | null;
        booking_status: string;
        nha_hang: { ten: string | null; loai: string | null } | { ten: string | null; loai: string | null }[] | null;
      };
      const nh = (rel: BkRow["nha_hang"]) => (Array.isArray(rel) ? rel[0] : rel) ?? null;
      const bookings = (bkRes.data ?? []) as BkRow[];

      // movable: NH thường (loại tàu ngày), đã chọn NH
      const rawMovable = bookings.map((b) => {
        const m = nh(b.nha_hang);
        const ngaySo = ngaySoById.get(b.doan_ngay_id) ?? 0;
        const bua = (b.bua_an === "toi" ? "toi" : "trua") as BuaAn;
        return {
          booking_id: b.id,
          nha_hang_id: b.nha_hang_id as number,
          nha_hang_ten: m?.ten ?? "—",
          from_doan_ngay_id: b.doan_ngay_id,
          from_ngay_so: ngaySo,
          from_bua: bua,
          booking_status: b.booking_status,
          has_extras: extras.has(`${ngaySo}|${bua}`),
          is_tau_ngay: (m?.loai ?? "nha_hang") === "tau_ngay",
        };
      });
      const movable = buildMovableList(rawMovable);

      // booking theo ô (doan_ngay_id|bua) — để xác định occupancy của slot
      const bkBySlot = new Map<string, BkRow>();
      for (const b of bookings) bkBySlot.set(`${b.doan_ngay_id}|${b.bua_an}`, b);

      const slots: DayMealSlot[] = [];
      for (const d of ngayRows) {
        for (const bua of BUAS) {
          const b = bkBySlot.get(`${d.id}|${bua}`);
          const m = b ? nh(b.nha_hang) : null;
          slots.push({
            doan_ngay_id: d.id,
            ngay_so: d.ngay_so,
            bua,
            occupied_by_booking_id: b?.id ?? null,
            occupied_label: m?.ten ?? null,
            is_tau_ngay: (m?.loai ?? "nha_hang") === "tau_ngay",
            assigned_nha_hang_id: bua === "trua" ? d.an_trua_nha_hang_id : d.an_toi_nha_hang_id,
          });
        }
      }

      return {
        multiNhom,
        movable,
        slots,
        ngayList: ngayRows.map((d) => ({ doan_ngay_id: d.id, ngay_so: d.ngay_so, ngay_date: d.ngay_date })),
      };
    },
  });
}

export interface RemapResult {
  moved: number;
  chi_phi_updated: number;
  chi_phi_ids: number[];
}

// Mutation gọi RPC atomic. Lỗi nghiệp vụ trả về qua message tiếng Việt từ RAISE EXCEPTION.
export function useRemapNhaHang() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      doanId,
      mapping,
    }: {
      doanId: number;
      mapping: RemapMappingItem[];
    }): Promise<RemapResult> => {
      const { data, error } = await externalSupabase.rpc("remap_nha_hang_theo_ngay", {
        p_doan_id: doanId,
        p_mapping: mapping as unknown as Json,
      });
      if (error) throw error;
      return data as unknown as RemapResult;
    },
    onSuccess: (_data, { doanId }) => {
      for (const key of [
        ["doan_ngay", doanId],
        ["doan_ngay_item", doanId],
        ["doan_chi_phi", doanId],
        ["chi_phi_nh_section", doanId],
        ["doan_booking_nh", doanId],
        ["de_nghi_thanh_toan", doanId],
        ["remap-nh-movable", doanId],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
      // ĐNTT global (DNTTPage) hiển thị mo_ta/ngày của chi phí → refresh nếu đang mở.
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
    },
  });
}
