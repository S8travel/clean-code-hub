import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Lookup types ──
export interface CanhDiemItem {
  id: number;
  ten: string;
  loai: string | null;
  co_phi: boolean | null;
  gia_mac_dinh: number | null;
  nguoi_thanh_toan: string | null;
  icon: string | null;
  dia_diem: string | null;
  email: string | null;
}

export interface NhaHangItem {
  id: number;
  ten: string;
  dia_chi: string | null;
  thong_tin_chung: string | null;
  nguoi_thanh_toan: string | null;
}

export interface KhachSanItem {
  id: number;
  ten: string;
  dia_chi: string | null;
  thong_tin_chung: string | null;
}

// ── Row types ──
export interface DoanNgayRow {
  id: number;
  doan_id: number;
  ngay_so: number;
  ngay_date: string | null;
  thu: string | null;
  thanh_pho: string | null;
  an_trua_nha_hang_id: number | null;
  an_toi_nha_hang_id: number | null;
  an_trua_set_menu_id: number | null;
  an_toi_set_menu_id: number | null;
  khach_san_id: number | null;
  ks_ma_code: string | null;
  ks_loai_phong: string | null;
}

export interface DoanNgayItemRow {
  id: number;
  doan_ngay_id: number;
  doan_id: number | null;
  canh_diem_id: number;
  thu_tu: number;
  co_phi: boolean | null;
  don_gia: number | null;
  so_luong: number | null;
  nguoi_thanh_toan: string | null;
  ghi_chu: string | null;
}

// ── Local state types ──
export interface DayItemLocal {
  id?: number;
  canh_diem_id: number;
  thu_tu: number;
  ghi_chu?: string;
}

export interface DayLocal {
  id?: number;
  ngay_so: number;
  ngay_date: string;
  thu: string;
  thanh_pho: string;
  an_trua_nha_hang_id: number | null;
  an_toi_nha_hang_id: number | null;
  an_trua_set_menu_id: number | null;
  an_toi_set_menu_id: number | null;
  khach_san_id: number | null;
  ks_ma_code: string;
  ks_loai_phong: string;
  items: DayItemLocal[];
}

// ── Lookup hooks ──
export function useCanhDiem() {
  return useQuery({
    queryKey: ["canh_diem"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("canh_diem")
        .select("id, ten, loai, co_phi, gia_mac_dinh, nguoi_thanh_toan, icon, dia_diem, email")
        .order("ten");
      if (error) throw error;
      return data as CanhDiemItem[];
    },
  });
}

export function useNhaHang() {
  return useQuery({
    queryKey: ["nha_hang"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_hang")
        .select("id, ten, dia_chi, thong_tin_chung, nguoi_thanh_toan")
        .order("ten");
      if (error) throw error;
      return data as NhaHangItem[];
    },
  });
}

export function useKhachSan() {
  return useQuery({
    queryKey: ["khach_san"],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("khach_san")
        .select("id, ten, dia_chi, thong_tin_chung")
        .order("ten");
      if (error) throw error;
      return data as KhachSanItem[];
    },
  });
}

// ── Data hooks ──
export function useDoanNgayList(doanId: number | undefined) {
  return useQuery({
    queryKey: ["doan_ngay", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_ngay")
        .select("*")
        .eq("doan_id", doanId!)
        .order("ngay_so");
      if (error) throw error;
      return data as DoanNgayRow[];
    },
  });
}

export function useDoanNgayItems(doanId: number | undefined) {
  return useQuery({
    queryKey: ["doan_ngay_item", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_ngay_item")
        .select("*")
        .eq("doan_id", doanId!)
        .order("thu_tu");
      if (error) throw error;
      return data as DoanNgayItemRow[];
    },
  });
}

// ── Helpers ──
const WEEKDAYS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function getWeekday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return WEEKDAYS_VI[d.getDay()];
}

export function generateDays(ngayDi: string | null, ngayVe: string | null): DayLocal[] {
  if (!ngayDi || !ngayVe) return [];
  const days: DayLocal[] = [];
  const start = new Date(ngayDi);
  const end = new Date(ngayVe);
  let i = 1;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    days.push({
      ngay_so: i++,
      ngay_date: dateStr,
      thu: getWeekday(dateStr),
      thanh_pho: "",
      an_trua_nha_hang_id: null,
      an_toi_nha_hang_id: null,
      an_trua_set_menu_id: null,
      an_toi_set_menu_id: null,
      khach_san_id: null,
      ks_ma_code: "",
      ks_loai_phong: "",
      items: [],
    });
  }
  return days;
}

export function mergeDaysWithDB(generated: DayLocal[], dbRows: DoanNgayRow[], dbItems: DoanNgayItemRow[]): DayLocal[] {
  const byNgaySo = new Map<number, DoanNgayRow>();
  for (const r of dbRows) byNgaySo.set(r.ngay_so, r);

  const itemsByDoanNgayId = new Map<number, DoanNgayItemRow[]>();
  for (const it of dbItems) {
    if (!itemsByDoanNgayId.has(it.doan_ngay_id)) itemsByDoanNgayId.set(it.doan_ngay_id, []);
    itemsByDoanNgayId.get(it.doan_ngay_id)!.push(it);
  }

  return generated.map((day) => {
    const dbRow = byNgaySo.get(day.ngay_so);
    if (!dbRow) return day;

    // Replace hoàn toàn từ DB và de-duplicate theo canh_diem_id
    const rawItems = itemsByDoanNgayId.get(dbRow.id) || [];
    const dedupByCanhDiem = new Map<number, DoanNgayItemRow>();
    for (const it of rawItems) {
      if (!dedupByCanhDiem.has(it.canh_diem_id)) {
        dedupByCanhDiem.set(it.canh_diem_id, it);
      }
    }

    const items = [...dedupByCanhDiem.values()]
      .sort((a, b) => a.thu_tu - b.thu_tu)
      .map((it) => ({
        id: it.id,
        canh_diem_id: it.canh_diem_id,
        thu_tu: it.thu_tu,
        ghi_chu: it.ghi_chu || "",
      }));

    return {
      ...day,
      id: dbRow.id,
      thanh_pho: dbRow.thanh_pho || "",
      an_trua_nha_hang_id: dbRow.an_trua_nha_hang_id,
      an_toi_nha_hang_id: dbRow.an_toi_nha_hang_id,
      an_trua_set_menu_id: dbRow.an_trua_set_menu_id ?? null,
      an_toi_set_menu_id: dbRow.an_toi_set_menu_id ?? null,
      khach_san_id: dbRow.khach_san_id,
      ks_ma_code: dbRow.ks_ma_code || "",
      ks_loai_phong: dbRow.ks_loai_phong || "",
      items,
    };
  });
}

// ── Save mutation ──
export interface SaveDieuTourPayload {
  doanId: number;
  doanFields: {
    bang_don?: string | null;
    shopping?: boolean | null;
    truong_doan?: string | null;
    so_khach_lon?: number | null;
    so_khach_em1?: number | null;
    so_khach_em2?: number | null;
    so_khach_tl?: number | null;
    chu_thich_khach?: string | null;
    tang_pham?: string[] | null;
    ghi_chu_dieu_tour?: string | null;
    chuyen_bay_don?: string | null;
    chuyen_bay_tien?: string | null;
  };
  days: DayLocal[];
  soKhach: number;
  canhDiemList: CanhDiemItem[];
  nhaHangList: NhaHangItem[];
  khachSanList: KhachSanItem[];
}
export function useInitDoanNgay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { doanId: number; ngayDi: string; ngayVe: string }) => {
      const { doanId, ngayDi, ngayVe } = params;
      const { data: existing } = await externalSupabase.from("doan_ngay").select("id").eq("doan_id", doanId).limit(1);
      if (existing && existing.length > 0) return;
      const thuMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      const start = new Date(ngayDi + "T00:00:00");
      const end = new Date(ngayVe + "T00:00:00");
      const rows = [];
      let i = 1;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        rows.push({
          doan_id: doanId,
          ngay_so: i++,
          ngay_date: dateStr,
          thu: thuMap[d.getDay()],
        });
      }
      if (rows.length > 0) {
        await externalSupabase.from("doan_ngay").insert(rows);
      }
    },
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: ["doan_ngay", params.doanId] });
    },
  });
}
export function useSaveDieuTour() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SaveDieuTourPayload) => {
      const { doanId, doanFields, days, soKhach, canhDiemList, nhaHangList, khachSanList } = payload;

      // 1. Update doan fields
      const so_khach =
        (doanFields.so_khach_lon ?? 0) +
        (doanFields.so_khach_em1 ?? 0) +
        (doanFields.so_khach_em2 ?? 0) +
        (doanFields.so_khach_tl ?? 0);
      await externalSupabase
        .from("doan")
        .update({ ...doanFields, so_khach })
        .eq("id", doanId);

      // 2. Upsert doan_ngay — use upsert to handle both new and existing rows
      for (let idx = 0; idx < days.length; idx++) {
        const day = days[idx];
        const ngayPayload: any = {
          doan_id: doanId,
          ngay_so: day.ngay_so,
          ngay_date: day.ngay_date,
          thu: day.thu,
          thanh_pho: day.thanh_pho || null,
          an_trua_nha_hang_id: day.an_trua_nha_hang_id,
          an_toi_nha_hang_id: day.an_toi_nha_hang_id,
          an_trua_set_menu_id: day.an_trua_set_menu_id ?? null,
          an_toi_set_menu_id: day.an_toi_set_menu_id ?? null,
          khach_san_id: day.khach_san_id,
          ks_ma_code: day.ks_ma_code || null,
          ks_loai_phong: day.ks_loai_phong || null,
        };

        let doanNgayId = day.id;

        if (doanNgayId) {
          // Update existing row
          const { error } = await externalSupabase.from("doan_ngay").update(ngayPayload).eq("id", doanNgayId);
          if (error) console.error(`Error updating doan_ngay id=${doanNgayId}:`, error);
        } else {
          // Try to find existing row by doan_id + ngay_so first
          const { data: existingRow } = await externalSupabase
            .from("doan_ngay")
            .select("id")
            .eq("doan_id", doanId)
            .eq("ngay_so", day.ngay_so)
            .maybeSingle();

          if (existingRow) {
            doanNgayId = existingRow.id;
            const { error } = await externalSupabase.from("doan_ngay").update(ngayPayload).eq("id", doanNgayId);
            if (error) console.error(`Error updating doan_ngay ngay_so=${day.ngay_so}:`, error);
          } else {
            const { data, error } = await externalSupabase.from("doan_ngay").insert(ngayPayload).select("id").single();
            if (error) console.error(`Error inserting doan_ngay ngay_so=${day.ngay_so}:`, error);
            if (data) doanNgayId = data.id;
          }
        }

        if (!doanNgayId) continue;

        // 3. Cleanup items removed from UI — delete chi_phi first to avoid FK constraint
        const validItems = day.items.filter((it) => it.canh_diem_id && it.canh_diem_id > 0);
        const selectedCanhDiemIds = validItems.map((it) => it.canh_diem_id);

        // Find items to delete
        const { data: itemsToDelete } = await externalSupabase
          .from("doan_ngay_item")
          .select("id")
          .eq("doan_ngay_id", doanNgayId)
          .not("canh_diem_id", "in", selectedCanhDiemIds.length > 0 ? `(${selectedCanhDiemIds.join(",")})` : "(0)");

        if (itemsToDelete && itemsToDelete.length > 0) {
          const idsToDelete = itemsToDelete.map((it: any) => it.id);
          // Delete referencing doan_chi_phi rows first
          for (const itemId of idsToDelete) {
            await externalSupabase.from("doan_chi_phi").delete().eq("ref_doan_ngay_item_id", itemId);
          }
          // Now safe to delete doan_ngay_item
          await externalSupabase.from("doan_ngay_item").delete().in("id", idsToDelete);
        }

        if (selectedCanhDiemIds.length === 0 && (!itemsToDelete || itemsToDelete.length === 0)) {
          // Also handle case where all items removed but none found above
          const { data: remainingItems } = await externalSupabase
            .from("doan_ngay_item")
            .select("id")
            .eq("doan_ngay_id", doanNgayId);
          if (remainingItems && remainingItems.length > 0) {
            for (const ri of remainingItems) {
              await externalSupabase.from("doan_chi_phi").delete().eq("ref_doan_ngay_item_id", ri.id);
            }
            await externalSupabase.from("doan_ngay_item").delete().eq("doan_ngay_id", doanNgayId);
          }
        }

        let insertedItems: Array<{
          id: number;
          canh_diem_id: number;
          co_phi: boolean | null;
          don_gia: number | null;
          so_luong: number | null;
          nguoi_thanh_toan: string | null;
        }> = [];

        if (validItems.length > 0) {
          const itemPayloads = validItems.map((it, idx) => {
            const cd = canhDiemList.find((c) => c.id === it.canh_diem_id);
            return {
              doan_ngay_id: doanNgayId,
              doan_id: doanId,
              canh_diem_id: it.canh_diem_id,
              thu_tu: idx + 1,
              co_phi: cd?.co_phi ?? false,
              don_gia: cd?.gia_mac_dinh ?? 0,
              so_luong: soKhach,
              nguoi_thanh_toan: cd?.nguoi_thanh_toan ?? null,
              ghi_chu: it.ghi_chu || null,
            };
          });

          const { data, error } = await externalSupabase
            .from("doan_ngay_item")
            .upsert(itemPayloads, { onConflict: "doan_ngay_id,canh_diem_id" })
            .select("id, canh_diem_id, co_phi, don_gia, so_luong, nguoi_thanh_toan");

          if (error) {
            console.error(`Error upserting doan_ngay_item day_id=${doanNgayId}:`, error);
          }

          insertedItems = (data || []) as typeof insertedItems;
        }

        // 4. Auto-generate doan_chi_phi for co_phi items
        if (insertedItems.length > 0) {
          for (const item of insertedItems) {
            if (!item.co_phi) continue;
            const cd = canhDiemList.find((c) => c.id === item.canh_diem_id);
            const chiPhiPayload: any = {
              doan_id: doanId,
              ngay_so: day.ngay_so,
              loai: "chi",
              danh_muc: "canh_diem",
              ref_doan_ngay_item_id: item.id,
              ref_doan_ngay_id: doanNgayId,
              mo_ta: cd?.ten ?? "",
              don_gia: item.don_gia ?? 0,
              so_luong: item.so_luong ?? soKhach,
              trang_thai_thanh_toan: "chua_thanh_toan",
            };
            if (item.nguoi_thanh_toan === "hdv") {
              chiPhiPayload.tien_hdv = (item.don_gia ?? 0) * (item.so_luong ?? soKhach);
              chiPhiPayload.tien_cong_ty = 0;
            } else {
              chiPhiPayload.tien_cong_ty = (item.don_gia ?? 0) * (item.so_luong ?? soKhach);
              chiPhiPayload.tien_hdv = 0;
            }
            // Upsert by ref
            const { data: existing } = await externalSupabase
              .from("doan_chi_phi")
              .select("id")
              .eq("ref_doan_ngay_item_id", item.id)
              .maybeSingle();
            if (existing) {
              await externalSupabase.from("doan_chi_phi").update(chiPhiPayload).eq("id", existing.id);
            } else {
              await externalSupabase.from("doan_chi_phi").insert(chiPhiPayload);
            }
          }
        }

        // 5. Auto-generate chi_phi for nha_hang only
        // (KS chi phí is managed manually in Chi phí tab, not auto-generated here)
        {
          const refId = day.an_trua_nha_hang_id || day.an_toi_nha_hang_id;
          if (refId) {
            const meals = [
              { id: day.an_trua_nha_hang_id, label: "an_trua" },
              { id: day.an_toi_nha_hang_id, label: "an_toi" },
            ].filter((m) => m.id);

            for (const meal of meals) {
              const mealItem = nhaHangList.find((i) => i.id === meal.id);
              const chiPayload: any = {
                doan_id: doanId,
                ngay_so: day.ngay_so,
                loai: "chi",
                danh_muc: "nha_hang",
                ref_doan_ngay_id: doanNgayId,
                mo_ta: mealItem
                  ? `${(mealItem as any).ten}${meal.label === "an_trua" ? " (trưa)" : meal.label === "an_toi" ? " (tối)" : ""}`
                  : "",
                trang_thai_thanh_toan: "chua_thanh_toan",
              };
              const mealNtt = (mealItem as any)?.nguoi_thanh_toan;
              if (mealNtt === "hdv") {
                chiPayload.tien_hdv = 0;
                chiPayload.tien_cong_ty = 0;
              } else {
                chiPayload.tien_cong_ty = 0;
                chiPayload.tien_hdv = 0;
              }

              // Upsert by ref_doan_ngay_id + danh_muc
              const { data: existing } = await externalSupabase
                .from("doan_chi_phi")
                .select("id")
                .eq("doan_id", doanId)
                .eq("danh_muc", "nha_hang")
                .eq("ref_doan_ngay_id", doanNgayId)
                .maybeSingle();
              if (existing) {
                await externalSupabase.from("doan_chi_phi").update(chiPayload).eq("id", existing.id);
              } else {
                await externalSupabase.from("doan_chi_phi").insert(chiPayload);
              }
            }
          }
        }
      }
      for (const day of days) {
        if (!day.id) continue;
        for (const bua of ["trua", "toi"] as const) {
          const nhId = bua === "trua" ? day.an_trua_nha_hang_id : day.an_toi_nha_hang_id;
          const { data: existingBkNh } = await externalSupabase
            .from("doan_booking_nh")
            .select("id, nha_hang_id, booking_status")
            .eq("doan_ngay_id", day.id)
            .eq("bua_an", bua)
            .maybeSingle();
          if (!existingBkNh) continue;
          if (existingBkNh.nha_hang_id !== nhId) {
            if (existingBkNh.booking_status === "chua_gui") {
              await externalSupabase.from("doan_booking_nh").delete().eq("id", existingBkNh.id);
            }
          }
        }
      }
      console.log(`[SaveDieuTour] Saved ${days.length} days for doan ${doanId}`);

      // 6. Sync doan_ngay → doan_booking_ks (insert-only + reset cancelled)
      const allKsIdsInDays = [...new Set(days.map((d) => d.khach_san_id).filter((id): id is number => id != null))];
      // Fetch nguoi_thanh_toan to skip "khach" KS (guest pays directly — no booking email needed)
      let khachKsIds = new Set<number>();
      if (allKsIdsInDays.length > 0) {
        const { data: ksCheck } = await externalSupabase
          .from("khach_san")
          .select("id, nguoi_thanh_toan")
          .in("id", allKsIdsInDays);
        khachKsIds = new Set((ksCheck || []).filter((k: any) => k.nguoi_thanh_toan === "khach").map((k: any) => k.id));
      }

      const { data: allBookingKs } = await externalSupabase
        .from("doan_booking_ks")
        .select("id, khach_san_id, ks_dat_truoc_status, ks_final_status")
        .eq("doan_id", doanId);
      const distinctKsIdsFull = allKsIdsInDays.filter((id) => !khachKsIds.has(id));
      if (allBookingKs) {
        for (const bk of allBookingKs) {
          // Delete "chua_gui" bookings for KS removed from tour or now set to "khach" payer
          const removedOrKhach = !distinctKsIdsFull.includes(bk.khach_san_id) || khachKsIds.has(bk.khach_san_id);
          if (removedOrKhach) {
            const chuaGui = bk.ks_dat_truoc_status === "chua_gui" && bk.ks_final_status === "chua_gui";
            if (chuaGui) {
              await externalSupabase.from("doan_booking_ks").delete().eq("id", bk.id);
            }
          }
        }
      }
      const distinctKsIds = distinctKsIdsFull;
      for (const ksId of distinctKsIds) {
        const { data: existing } = await externalSupabase
          .from("doan_booking_ks")
          .select("id, ks_final_status")
          .eq("doan_id", doanId)
          .eq("khach_san_id", ksId)
          .maybeSingle();

        if (!existing) {
          // New booking row
          await externalSupabase.from("doan_booking_ks").insert({ doan_id: doanId, khach_san_id: ksId });
        } else if (existing.ks_final_status === "ks_xac_nhan_huy") {
          // Reset cancelled booking
          await externalSupabase
            .from("doan_booking_ks")
            .update({
              ks_dat_truoc_status: "chua_gui",
              ks_dat_truoc: null,
              ks_final_status: "chua_gui",
              ks_final: null,
            })
            .eq("id", existing.id);
        }
        // Otherwise: do nothing, keep existing data
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doan"] });
      qc.invalidateQueries({ queryKey: ["doan_ngay"] });
      qc.invalidateQueries({ queryKey: ["doan_ngay_item"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi"] });
      qc.invalidateQueries({ queryKey: ["chi_phi_ks_data"] });
      qc.invalidateQueries({ queryKey: ["doan_booking_ks"] });
    },
  });
}

// ── Sync Điều tour → Booking DV ──
export interface SyncWarning {
  ncc: string;
  services: string[];
}

export async function syncDieuTourToBookingDV(params: {
  doanId: number;
  days: DayLocal[];
  canhDiemList: CanhDiemItem[];
  soKhach: number;
}): Promise<{ synced: number; warnings: SyncWarning[] }> {
  const { doanId, days, canhDiemList, soKhach } = params;

  // Collect co_phi + cong_ty items
  const coPhiItems: { cd: CanhDiemItem; ngay_date: string }[] = [];
  for (const day of days) {
    for (const item of day.items) {
      const cd = canhDiemList.find((c) => c.id === item.canh_diem_id);
      if (cd && cd.co_phi && cd.nguoi_thanh_toan === "cong_ty") {
        coPhiItems.push({ cd, ngay_date: day.ngay_date });
      }
    }
  }

  if (coPhiItems.length === 0) {
    // Xóa tất cả booking DV chua_dat vì không còn dịch vụ nào
    const { data: existingAll } = await externalSupabase
      .from("doan_booking_dv")
      .select("id, booking_status")
      .eq("doan_id", doanId);

    if (existingAll) {
      for (const bk of existingAll) {
        if (bk.booking_status === "chua_dat") {
          await externalSupabase.from("doan_booking_dv").delete().eq("id", bk.id);
        }
      }
    }
    return { synced: 0, warnings: [] };
  }

  // Group by dia_diem (fallback to ten)
  const groups = new Map<
    string,
    { email: string | null; dichVu: { ten_dv: string; ngay_date: string; so_khach: number; don_gia: number }[] }
  >();
  for (const { cd, ngay_date } of coPhiItems) {
    const ncc = cd.dia_diem || cd.ten;
    if (!groups.has(ncc)) groups.set(ncc, { email: cd.email, dichVu: [] });
    groups.get(ncc)!.dichVu.push({
      ten_dv: cd.ten,
      ngay_date,
      so_khach: soKhach,
      don_gia: cd.gia_mac_dinh ?? 0,
    });
  }

  let synced = 0;
  const warnings: SyncWarning[] = [];

  for (const [ncc, { email, dichVu }] of groups) {
    const { data: existing } = await externalSupabase
      .from("doan_booking_dv")
      .select("id, booking_status, dich_vu_list")
      .eq("doan_id", doanId)
      .eq("ten_nha_cung_cap", ncc)
      .maybeSingle();

    if (!existing || existing.booking_status === "chua_dat") {
      if (existing) {
        if (dichVu.length === 0) {
          // Xóa luôn dòng booking DV nếu không còn dịch vụ nào
          await externalSupabase.from("doan_booking_dv").delete().eq("id", existing.id);
        } else {
          // Cập nhật lại danh sách dịch vụ
          await externalSupabase
            .from("doan_booking_dv")
            .update({ dich_vu_list: dichVu, email_nha_cung_cap: email })
            .eq("id", existing.id);
        }
      } else if (dichVu.length > 0) {
        // Chỉ insert nếu có dịch vụ
        await externalSupabase.from("doan_booking_dv").insert({
          doan_id: doanId,
          ten_nha_cung_cap: ncc,
          email_nha_cung_cap: email,
          dich_vu_list: dichVu,
          booking_status: "chua_dat",
        });
      }
      synced += dichVu.length;
    } else if (["cho_xac_nhan", "da_xac_nhan"].includes(existing.booking_status)) {
      // Only warn if the service list actually changed
      const oldList = Array.isArray(existing.dich_vu_list) ? existing.dich_vu_list : [];
      const oldKeys = new Set(oldList.map((d: any) => `${d.ten_dv}|${d.ngay_date}`));
      const newKeys = new Set(dichVu.map((d) => `${d.ten_dv}|${d.ngay_date}`));
      const hasChange =
        oldKeys.size !== newKeys.size ||
        [...oldKeys].some((k) => !newKeys.has(k)) ||
        [...newKeys].some((k) => !oldKeys.has(k));

      if (hasChange) {
        warnings.push({ ncc, services: dichVu.map((d) => d.ten_dv) });
      }
    }
    // da_huy: skip silently
  }

  return { synced, warnings };
}

// ── Pre-save warning check ──
export interface PreSaveWarning {
  type: "ks" | "nh" | "dv";
  message: string;
}

export async function checkPreSaveWarnings(params: {
  doanId: number;
  days: DayLocal[];
  dbNgayRows: DoanNgayRow[];
  dbNgayItems: DoanNgayItemRow[];
  canhDiemList: CanhDiemItem[];
  nhaHangList: NhaHangItem[];
  khachSanList: KhachSanItem[];
}): Promise<PreSaveWarning[]> {
  const { doanId, days, dbNgayRows, dbNgayItems, canhDiemList, nhaHangList, khachSanList } = params;
  const warnings: PreSaveWarning[] = [];

  // Build lookup maps
  const dbRowByNgaySo = new Map<number, DoanNgayRow>();
  for (const r of dbNgayRows) dbRowByNgaySo.set(r.ngay_so, r);

  const dbItemsByNgayId = new Map<number, DoanNgayItemRow[]>();
  for (const it of dbNgayItems) {
    if (!dbItemsByNgayId.has(it.doan_ngay_id)) dbItemsByNgayId.set(it.doan_ngay_id, []);
    dbItemsByNgayId.get(it.doan_ngay_id)!.push(it);
  }

  for (const day of days) {
    const dbRow = dbRowByNgaySo.get(day.ngay_so);
    if (!dbRow) continue;

    const dateLabel = (() => {
      const d = new Date(day.ngay_date + "T00:00:00");
      return `${d.getDate()}/${d.getMonth() + 1}`;
    })();

    // 1. Check KS changes
    if (dbRow.khach_san_id && dbRow.khach_san_id !== day.khach_san_id) {
      const ks = khachSanList.find((k) => k.id === dbRow.khach_san_id);
      const { data: bookingKs } = await externalSupabase
        .from("doan_booking_ks")
        .select("id, ks_dat_truoc_status, ks_final_status")
        .eq("doan_id", doanId)
        .eq("khach_san_id", dbRow.khach_san_id)
        .maybeSingle();

      if (bookingKs) {
        const hasSentBooking =
          ["cho_ks_xac_nhan", "ks_xac_nhan"].includes(bookingKs.ks_dat_truoc_status || "") ||
          ["cho_ks_xac_nhan", "ks_xac_nhan_final"].includes(bookingKs.ks_final_status || "");
        if (hasSentBooking) {
          const status = bookingKs.ks_final_status?.includes("xac_nhan") ? "đã xác nhận" : "đang chờ xác nhận";
          warnings.push({
            type: "ks",
            message: `KS ${ks?.ten || "?"} (ngày ${dateLabel}) ${status}`,
          });
        }
      }
    }

    // 2. Check NH changes
    for (const meal of [
      { field: "an_trua_nha_hang_id" as const, label: "bữa trưa" },
      { field: "an_toi_nha_hang_id" as const, label: "bữa tối" },
    ]) {
      const oldId = dbRow[meal.field];
      const newId = day[meal.field];
      if (oldId && oldId !== newId) {
        const nh = nhaHangList.find((n) => n.id === oldId);
        const { data: bookingNh } = await externalSupabase
          .from("doan_booking_nh")
          .select("id, booking_status")
          .eq("doan_ngay_id", dbRow.id)
          .eq("nha_hang_id", oldId)
          .eq("bua_an", meal.field === "an_trua_nha_hang_id" ? "trua" : "toi")
          .maybeSingle();

        if (bookingNh && ["da_gui", "nh_xac_nhan"].includes(bookingNh.booking_status)) {
          const status = bookingNh.booking_status === "nh_xac_nhan" ? "đã xác nhận" : "đã gửi booking";
          warnings.push({
            type: "nh",
            message: `NH ${nh?.ten || "?"} (${meal.label} ${dateLabel}) ${status}`,
          });
        }
      }
    }

    // 3. Check DV removals
    const dbItems = dbItemsByNgayId.get(dbRow.id) || [];
    const currentCdIds = new Set(day.items.filter((it) => it.canh_diem_id > 0).map((it) => it.canh_diem_id));

    for (const dbItem of dbItems) {
      if (!currentCdIds.has(dbItem.canh_diem_id)) {
        const cd = canhDiemList.find((c) => c.id === dbItem.canh_diem_id);
        if (!cd || !cd.co_phi || cd.nguoi_thanh_toan !== "cong_ty") continue;

        const ncc = cd.dia_diem || cd.ten;
        const { data: bookingDv } = await externalSupabase
          .from("doan_booking_dv")
          .select("id, booking_status")
          .eq("doan_id", doanId)
          .eq("ten_nha_cung_cap", ncc)
          .maybeSingle();

        if (bookingDv && ["cho_xac_nhan", "da_xac_nhan"].includes(bookingDv.booking_status)) {
          const status = bookingDv.booking_status === "da_xac_nhan" ? "đã xác nhận" : "đang chờ xác nhận";
          warnings.push({
            type: "dv",
            message: `DV ${cd.ten} (NCC: ${ncc}) ${status}`,
          });
        }
      }
    }
  }

  // De-duplicate warnings by message
  const unique = new Map<string, PreSaveWarning>();
  for (const w of warnings) unique.set(w.message, w);
  return [...unique.values()];
}
