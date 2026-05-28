import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { externalSupabase } from "@/lib/supabase-external";
import type { DayLocal, DayItemLocal } from "@/hooks/use-dieu-tour";
import type { TablesInsert } from "@/lib/database.types";

// ── Types ──

export interface SeriTour {
  id: number;
  ten_seri: string;
  mo_ta: string | null;
  tang_pham: string[] | null;
  shopping: boolean | null;
  created_at: string;
}

export interface SeriNgay {
  id: number;
  seri_id: number;
  ngay_so: number;
  thanh_pho: string | null;
  an_trua_nha_hang_id: number | null;
  an_trua_set_menu_id: number | null;
  an_trua_ghi_chu: string | null;
  an_toi_nha_hang_id: number | null;
  an_toi_set_menu_id: number | null;
  an_toi_ghi_chu: string | null;
  khach_san_id: number | null;
  ks_loai_phong: string | null;
  ks_ma_code: string | null;
}

export interface SeriNgayItem {
  id: number;
  seri_ngay_id: number;
  canh_diem_id: number;
  thu_tu: number;
  co_phi: boolean | null;
  don_gia: number | null;
  nguoi_thanh_toan: string | null;
  ghi_chu: string | null;
}

// ── Seri CRUD ──

export function useSeriList() {
  return useQuery({
    queryKey: ["seri_tour"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("seri_tour")
        .select("*")
        .order("ten_seri");
      if (error) throw error;
      return data as SeriTour[];
    },
  });
}

export function useCreateSeri() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ten_seri: string; mo_ta?: string; tang_pham?: string[] | null; shopping?: boolean | null }) => {
      const { data, error } = await externalSupabase
        .from("seri_tour")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as SeriTour;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seri_tour"] }),
  });
}

export function useUpdateSeri() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; ten_seri: string; mo_ta?: string; tang_pham?: string[] | null; shopping?: boolean | null }) => {
      const { data, error } = await externalSupabase
        .from("seri_tour")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as SeriTour;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seri_tour"] }),
  });
}

export function useDeleteSeri() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await externalSupabase.from("seri_tour").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seri_tour"] }),
  });
}

// ── Seri Ngay CRUD ──

export function useSeriNgayList(seriId: number | null) {
  return useQuery({
    queryKey: ["seri_tour_ngay", seriId],
    enabled: !!seriId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("seri_tour_ngay")
        .select("*")
        .eq("seri_id", seriId!)
        .order("ngay_so");
      if (error) throw error;
      return data as SeriNgay[];
    },
  });
}

export function useAddSeriNgay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ seri_id, ngay_so }: { seri_id: number; ngay_so: number }) => {
      const { data, error } = await externalSupabase
        .from("seri_tour_ngay")
        .insert({ seri_id, ngay_so })
        .select()
        .single();
      if (error) throw error;
      return data as SeriNgay;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay", vars.seri_id] }),
  });
}

export function useUpdateSeriNgay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, seri_id, ...payload }: Partial<SeriNgay> & { id: number; seri_id: number }) => {
      const { error } = await externalSupabase
        .from("seri_tour_ngay")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay", vars.seri_id] }),
  });
}

export function useDeleteSeriNgay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, seri_id }: { id: number; seri_id: number }) => {
      const { error } = await externalSupabase.from("seri_tour_ngay").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay", vars.seri_id] }),
  });
}

// ── Seri Ngay Item CRUD ──

export function useSeriNgayItems(seriId: number | null) {
  return useQuery({
    queryKey: ["seri_tour_ngay_item", seriId],
    enabled: !!seriId,
    queryFn: async () => {
      // Fetch all items for all ngay of this seri in one query
      const { data: ngayRows, error: e1 } = await externalSupabase
        .from("seri_tour_ngay")
        .select("id")
        .eq("seri_id", seriId!);
      if (e1) throw e1;
      if (!ngayRows || ngayRows.length === 0) return [] as SeriNgayItem[];

      const ngayIds = ngayRows.map((r) => r.id);
      const { data, error: e2 } = await externalSupabase
        .from("seri_tour_ngay_item")
        .select("*")
        .in("seri_ngay_id", ngayIds)
        .order("thu_tu");
      if (e2) throw e2;
      return (data ?? []) as SeriNgayItem[];
    },
  });
}

export function useAddSeriNgayItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      seri_ngay_id: number;
      seri_id: number;
      canh_diem_id: number;
      thu_tu: number;
      co_phi: boolean;
      don_gia: number;
      nguoi_thanh_toan: string | null;
      ghi_chu: string | null;
    }) => {
      const { seri_id, ...insert } = payload;
      const { data, error } = await externalSupabase
        .from("seri_tour_ngay_item")
        .insert(insert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay_item", vars.seri_id] }),
  });
}

export function useDeleteSeriNgayItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, seri_id }: { id: number; seri_id: number }) => {
      const { error } = await externalSupabase.from("seri_tour_ngay_item").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["seri_tour_ngay_item", vars.seri_id] }),
  });
}

// ── Conflict check trước khi áp dụng seri cho đoàn đã có lịch trình ──

export interface SeriApplyConflict {
  hasConflict: boolean;
  /** Các dòng mô tả conflict, dùng cho dialog hiển thị cho user. */
  lines: string[];
}

/** Check trước khi áp seri mới: chỉ BLOCK khi đã commit với NCC.
 *  - Booking NH `booking_status IN (da_gui, nh_xac_nhan)`: đã gửi mail NCC.
 *  - Booking DV `booking_status = cho_xac_nhan`: đã gửi NCC chờ xác nhận.
 *  - DNTT allocation (status != da_huy) trên chi phí NH/cảnh điểm: đã đề nghị TT.
 *
 *  Booking `chua_gui`/`chua_dat`/`da_huy` KHÔNG block — chưa committed.
 *  Chi phí NH/cảnh điểm "trống" cũng KHÔNG block — applySeri wipe + replace. */
export async function checkSeriApplyConflict(doanId: number): Promise<SeriApplyConflict> {
  const [nhRes, dvRes, allocRes] = await Promise.all([
    externalSupabase
      .from("doan_booking_nh")
      .select("id", { count: "exact", head: true })
      .eq("doan_id", doanId)
      .in("booking_status", ["da_gui", "nh_xac_nhan"]),
    externalSupabase
      .from("doan_booking_dv")
      .select("id", { count: "exact", head: true })
      .eq("doan_id", doanId)
      .eq("booking_status", "cho_xac_nhan"),
    // Allocation thuộc chi phí NH/cảnh điểm của đoàn này, với DNTT chưa hủy.
    // !inner: chỉ trả allocation có chi_phi + dntt thỏa filter.
    externalSupabase
      .from("dntt_allocations")
      .select("id, chi_phi:doan_chi_phi!inner(doan_id, danh_muc), dntt:de_nghi_thanh_toan!inner(trang_thai_duyet)", { count: "exact", head: true })
      .eq("chi_phi.doan_id", doanId)
      .in("chi_phi.danh_muc", ["nha_hang", "canh_diem"])
      .neq("dntt.trang_thai_duyet", "da_huy"),
  ]);

  const lines: string[] = [];
  const nhCount = nhRes.count ?? 0;
  const dvCount = dvRes.count ?? 0;
  const dnttCount = allocRes.count ?? 0;

  if (nhCount > 0) lines.push(`${nhCount} booking nhà hàng đã gửi NCC`);
  if (dvCount > 0) lines.push(`${dvCount} booking dịch vụ đã gửi NCC`);
  if (dnttCount > 0) lines.push(`${dnttCount} chi phí NH/cảnh điểm đã có ĐNTT (chưa hủy)`);

  return { hasConflict: lines.length > 0, lines };
}

// ── Apply seri to doan ──

export function useApplySeriToDoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      doanId,
      seriId,
      ngayDi,
    }: {
      doanId: number;
      seriId: number;
      ngayDi: string; // "yyyy-MM-dd"
    }) => {
      // 1. Fetch seri ngay
      const { data: seriNgayRows, error: e1 } = await externalSupabase
        .from("seri_tour_ngay")
        .select("*")
        .eq("seri_id", seriId)
        .order("ngay_so");
      if (e1) throw e1;
      if (!seriNgayRows || seriNgayRows.length === 0) return;

      // Resolve nhóm target (thu_tu=1) — applySeri chỉ apply vào nhóm này.
      const { data: nhomDefault } = await externalSupabase
        .from("doan_nhom")
        .select("id")
        .eq("doan_id", doanId)
        .eq("thu_tu", 1)
        .maybeSingle();
      if (!nhomDefault) throw new Error("Đoàn chưa có nhóm mặc định — áp seri thất bại");

      // 1b. Wipe data NH/cảnh điểm cũ trước khi apply seri mới — pre-check
      //     đã verify không có booking + DNTT (chưa hủy) → safe delete.
      //     KS / bao_hiem / HDV / dich_vu / phi_khac giữ nguyên (độc lập với seri).
      //     Xoá chi phí TRƯỚC items vì chi_phi.ref_doan_ngay_item_id ref items.
      const { error: eDelCp } = await externalSupabase
        .from("doan_chi_phi")
        .delete()
        .eq("doan_id", doanId)
        .in("danh_muc", ["nha_hang", "canh_diem"]);
      if (eDelCp) throw eDelCp;
      const { error: eDelItem } = await externalSupabase
        .from("doan_ngay_item")
        .delete()
        .eq("doan_id", doanId);
      if (eDelItem) throw eDelItem;

      const thuMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      // UTC-safe parse để tránh timezone-shift bug
      const [bY, bM, bD] = ngayDi.split("-").map(Number);
      const baseDate = new Date(Date.UTC(bY, bM - 1, bD));

      // 2. UPSERT doan_ngay per ngay_so — PER NHÓM target (tránh UPDATE nhầm
      //    doan_ngay của nhóm khác cùng ngay_so). Preserve KS fields (seri ko carry KS).
      const { data: existingNgay, error: eExist } = await externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so")
        .eq("doan_id", doanId)
        .eq("doan_nhom_id", nhomDefault.id);
      if (eExist) throw eExist;
      const existingByNgaySo = new Map<number, number>(
        (existingNgay ?? []).map((r) => [r.ngay_so, r.id]),
      );

      const ngaySoToDoanNgayId = new Map<number, number>();
      for (const sn of seriNgayRows) {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + sn.ngay_so - 1);
        const dateStr = d.toISOString().split("T")[0];
        const seriFields = {
          ngay_date: dateStr,
          thu: thuMap[d.getUTCDay()],
          thanh_pho: sn.thanh_pho,
          an_trua_nha_hang_id: sn.an_trua_nha_hang_id,
          an_trua_set_menu_id: sn.an_trua_set_menu_id,
          an_trua_ghi_chu: sn.an_trua_ghi_chu,
          an_toi_nha_hang_id: sn.an_toi_nha_hang_id,
          an_toi_set_menu_id: sn.an_toi_set_menu_id,
          an_toi_ghi_chu: sn.an_toi_ghi_chu,
        };
        const existingId = existingByNgaySo.get(sn.ngay_so);
        if (existingId) {
          // UPDATE — preserve khach_san_id / ks_loai_phong / ks_ma_code
          const { error } = await externalSupabase
            .from("doan_ngay")
            .update(seriFields)
            .eq("id", existingId);
          if (error) throw error;
          ngaySoToDoanNgayId.set(sn.ngay_so, existingId);
        } else {
          // INSERT new
          const { data: inserted, error } = await externalSupabase
            .from("doan_ngay")
            .insert({
              doan_id: doanId,
              doan_nhom_id: nhomDefault.id,
              ngay_so: sn.ngay_so,
              ...seriFields,
            })
            .select("id")
            .single();
          if (error) throw error;
          ngaySoToDoanNgayId.set(sn.ngay_so, inserted.id);
        }
      }

      // 3. Fetch seri items
      const seriNgayIds = seriNgayRows.map((r) => r.id);
      const { data: seriItems, error: e3 } = await externalSupabase
        .from("seri_tour_ngay_item")
        .select("*")
        .in("seri_ngay_id", seriNgayIds);
      if (e3) throw e3;
      if (!seriItems || seriItems.length === 0) return;

      // Map seri_ngay.id → ngay_so. ngaySoToDoanNgayId đã build ở trên.
      const seriNgayToNgaySo = new Map<number, number>(
        seriNgayRows.map((r) => [r.id, r.ngay_so])
      );

      const itemInserts = seriItems
        .map((si) => {
          const ngaySo = seriNgayToNgaySo.get(si.seri_ngay_id);
          if (ngaySo === undefined) return null;
          const doanNgayId = ngaySoToDoanNgayId.get(ngaySo);
          if (!doanNgayId) return null;
          return {
            doan_ngay_id: doanNgayId,
            doan_id: doanId,
            canh_diem_id: si.canh_diem_id,
            thu_tu: si.thu_tu,
            co_phi: si.co_phi,
            don_gia: si.don_gia,
            nguoi_thanh_toan: si.nguoi_thanh_toan,
            ghi_chu: si.ghi_chu,
          };
        })
        .filter(Boolean);

      if (itemInserts.length > 0) {
        const { error: e4 } = await externalSupabase
          .from("doan_ngay_item")
          .insert(itemInserts as unknown as TablesInsert<"doan_ngay_item">[]);
        if (e4) throw e4;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["doan_ngay", vars.doanId] });
      qc.invalidateQueries({ queryKey: ["doan_ngay_item", vars.doanId] });
    },
  });
}

// ── Convert seri DB rows → DayLocal[] for DayScheduleTable ──
export function seriToDayLocals(ngayRows: SeriNgay[], items: SeriNgayItem[]): DayLocal[] {
  const itemsByNgayId = new Map<number, SeriNgayItem[]>();
  for (const it of items) {
    if (!itemsByNgayId.has(it.seri_ngay_id)) itemsByNgayId.set(it.seri_ngay_id, []);
    itemsByNgayId.get(it.seri_ngay_id)!.push(it);
  }
  return ngayRows.map((sn) => {
    const myItems: DayItemLocal[] = (itemsByNgayId.get(sn.id) ?? [])
      .sort((a, b) => a.thu_tu - b.thu_tu)
      .map((it) => ({ id: it.id, canh_diem_id: it.canh_diem_id, thu_tu: it.thu_tu, ghi_chu: it.ghi_chu || "" }));
    return {
      id: sn.id,
      ngay_so: sn.ngay_so,
      ngay_date: "2000-01-01", // fake — không dùng khi có dayLabel
      thu: "",
      thanh_pho: sn.thanh_pho || "",
      an_trua_nha_hang_id: sn.an_trua_nha_hang_id,
      an_toi_nha_hang_id: sn.an_toi_nha_hang_id,
      an_trua_set_menu_id: sn.an_trua_set_menu_id,
      an_toi_set_menu_id: sn.an_toi_set_menu_id,
      an_trua_ghi_chu: sn.an_trua_ghi_chu || "",
      an_toi_ghi_chu: sn.an_toi_ghi_chu || "",
      khach_san_id: sn.khach_san_id,
      ks_ma_code: sn.ks_ma_code || "",
      ks_loai_phong: sn.ks_loai_phong || "",
      items: myItems,
    };
  });
}

// ── Save toàn bộ seri (xóa cũ, insert mới) ──
export function useSaveSeri() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ seriId, days }: { seriId: number; days: DayLocal[] }) => {
      // Xóa toàn bộ ngày cũ (cascade xóa items)
      const { error: delErr } = await externalSupabase
        .from("seri_tour_ngay")
        .delete()
        .eq("seri_id", seriId);
      if (delErr) throw delErr;

      if (days.length === 0) return;

      // Insert ngày mới
      const ngayInserts = days.map((d) => ({
        seri_id: seriId,
        ngay_so: d.ngay_so,
        thanh_pho: d.thanh_pho || null,
        an_trua_nha_hang_id: d.an_trua_nha_hang_id,
        an_trua_set_menu_id: d.an_trua_set_menu_id,
        an_trua_ghi_chu: d.an_trua_ghi_chu || null,
        an_toi_nha_hang_id: d.an_toi_nha_hang_id,
        an_toi_set_menu_id: d.an_toi_set_menu_id,
        an_toi_ghi_chu: d.an_toi_ghi_chu || null,
        khach_san_id: d.khach_san_id,
        ks_loai_phong: d.ks_loai_phong || null,
        ks_ma_code: d.ks_ma_code || null,
      }));
      const { data: insertedNgay, error: ngayErr } = await externalSupabase
        .from("seri_tour_ngay")
        .insert(ngayInserts)
        .select("id, ngay_so");
      if (ngayErr) throw ngayErr;

      // Insert items
      const ngaySoToId = new Map<number, number>(
        (insertedNgay ?? []).map((r) => [r.ngay_so, r.id])
      );
      const itemInserts: TablesInsert<"seri_tour_ngay_item">[] = [];
      days.forEach((d) => {
        const ngayId = ngaySoToId.get(d.ngay_so);
        if (!ngayId) return;
        d.items.forEach((item, idx) => {
          if (!item.canh_diem_id) return;
          itemInserts.push({
            seri_ngay_id: ngayId,
            canh_diem_id: item.canh_diem_id,
            thu_tu: idx,
            ghi_chu: item.ghi_chu || null,
          });
        });
      });
      if (itemInserts.length > 0) {
        const { error: itemErr } = await externalSupabase
          .from("seri_tour_ngay_item")
          .insert(itemInserts);
        if (itemErr) throw itemErr;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["seri_tour_ngay", vars.seriId] });
      qc.invalidateQueries({ queryKey: ["seri_tour_ngay_item", vars.seriId] });
    },
  });
}

// ── Hook for set menu options per nha_hang ──
export function useSetMenuByNhaHang(nhaHangId: number | null) {
  return useQuery({
    queryKey: ["set_menu", nhaHangId],
    enabled: !!nhaHangId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("nha_hang_set_menu")
        .select("id, ten_set, gia, don_vi")
        .eq("nha_hang_id", nhaHangId!)
        .order("ten_set");
      if (error) throw error;
      return data as { id: number; ten_set: string; gia: number | null; don_vi: string }[];
    },
  });
}
