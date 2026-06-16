import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { Json } from "@/lib/database.types";
import type { MovableItem, ItemSlot, DayRef, CdMappingItem } from "@/lib/remap-canh-diem";

export interface RemapCdData {
  multiNhom: boolean;
  movable: MovableItem[];   // cảnh điểm có phí (dòng modal)
  allItems: ItemSlot[];     // mọi item (kiểm va UNIQUE ngày+cảnh điểm)
  days: DayRef[];
}

// Fetch cảnh điểm/DV có phí + mọi item + ngày để feed modal "Xếp lại theo ngày".
export function useRemapCdData(doanId: number | null | undefined, enabled = true) {
  return useQuery<RemapCdData>({
    queryKey: ["remap-cd-movable", doanId],
    enabled: !!doanId && enabled,
    queryFn: async () => {
      const id = doanId!;
      const [nhomRes, ngayRes, itemRes, cpRes] = await Promise.all([
        externalSupabase.from("doan_nhom").select("id").eq("doan_id", id),
        externalSupabase.from("doan_ngay").select("id, ngay_so").eq("doan_id", id).order("ngay_so"),
        externalSupabase
          .from("doan_ngay_item")
          .select("id, doan_ngay_id, canh_diem_id, co_phi, canh_diem:canh_diem_id(ten, loai, khach_san_id)")
          .eq("doan_id", id),
        externalSupabase
          .from("doan_chi_phi")
          .select("id, ref_doan_ngay_item_id, mo_ta")
          .eq("doan_id", id)
          .eq("danh_muc", "canh_diem"),
      ]);
      for (const r of [nhomRes, ngayRes, itemRes, cpRes]) if (r.error) throw r.error;

      const multiNhom = (nhomRes.data?.length ?? 0) > 1;
      const ngayRows = ngayRes.data ?? [];
      const ngaySoById = new Map<number, number>(ngayRows.map((d) => [d.id, d.ngay_so]));

      // main chi phí theo item + tập main-id có extras [dvps_<main>]
      const mainCpByItem = new Map<number, number>();
      const extrasMainIds = new Set<number>();
      for (const cp of cpRes.data ?? []) {
        const mt = cp.mo_ta ?? "";
        const m = mt.match(/^\[dvps_(\d+)\]/);
        if (m) {
          extrasMainIds.add(Number(m[1]));
        } else if (cp.ref_doan_ngay_item_id != null) {
          mainCpByItem.set(cp.ref_doan_ngay_item_id, cp.id);
        }
      }

      type CdRel = { ten: string | null; loai: string | null; khach_san_id: number | null };
      type ItemRow = {
        id: number; doan_ngay_id: number; canh_diem_id: number | null; co_phi: boolean | null;
        canh_diem: CdRel | CdRel[] | null;
      };
      const cd = (rel: ItemRow["canh_diem"]) => (Array.isArray(rel) ? rel[0] : rel) ?? null;
      const items = (itemRes.data ?? []) as ItemRow[];

      // allItems: mọi item (kể cả day-use) — để kiểm va UNIQUE(ngày, cảnh điểm) chính xác.
      const allItems: ItemSlot[] = items
        .filter((it) => it.canh_diem_id != null)
        .map((it) => ({ item_id: it.id, canh_diem_id: it.canh_diem_id as number, doan_ngay_id: it.doan_ngay_id }));

      // movable: co_phi + KHÔNG phải day-use KS (khach_san_id != null → quản lý như KS).
      const movable: MovableItem[] = items
        .filter((it) => it.co_phi && it.canh_diem_id != null && cd(it.canh_diem)?.khach_san_id == null)
        .map((it) => {
          const c = cd(it.canh_diem);
          const mainCp = mainCpByItem.get(it.id);
          return {
            item_id: it.id,
            canh_diem_id: it.canh_diem_id as number,
            canh_diem_ten: c?.ten ?? "—",
            from_doan_ngay_id: it.doan_ngay_id,
            from_ngay_so: ngaySoById.get(it.doan_ngay_id) ?? 0,
            is_dv: (c?.loai ?? "") === "dich_vu",
            has_extras: mainCp != null && extrasMainIds.has(mainCp),
          };
        });

      return {
        multiNhom,
        movable,
        allItems,
        days: ngayRows.map((d) => ({ doan_ngay_id: d.id, ngay_so: d.ngay_so })),
      };
    },
  });
}

export interface RemapResult {
  moved: number;
  chi_phi_updated: number;
  chi_phi_ids: number[];
}

export function useRemapCanhDiem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      doanId,
      mapping,
    }: {
      doanId: number;
      mapping: CdMappingItem[];
    }): Promise<RemapResult> => {
      const { data, error } = await externalSupabase.rpc("remap_canh_diem_theo_ngay", {
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
        ["doan_booking_dv", doanId],
        ["de_nghi_thanh_toan", doanId],
        ["remap-cd-movable", doanId],
      ]) {
        qc.invalidateQueries({ queryKey: key });
      }
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
    },
  });
}
