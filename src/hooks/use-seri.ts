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

/** Check một đoàn đã có lịch trình / booking / chi phí gì chưa
 *  trước khi áp dụng seri mới.
 *
 *  Seri chỉ carry NH (ăn trưa/tối) và cảnh điểm. Các chi phí khác (KS, bảo
 *  hiểm, HDV hỗ trợ) độc lập với seri nên KHÔNG bị coi là conflict —
 *  applySeri không động vào chúng.
 *
 *  Multi-nhóm: applySeri target nhóm "Toàn đoàn" (thu_tu=1), nên check scope
 *  theo nhóm đó — KHÔNG đếm data của nhóm khác (sai nghiệp vụ + block user
 *  oan khi nhóm 1 trống nhưng nhóm 2 đã có data).
 *  doan_booking_dv là đoàn-level (không có FK nhóm) → giữ count toàn đoàn.
 */
export async function checkSeriApplyConflict(doanId: number): Promise<SeriApplyConflict> {
  // Resolve nhóm target (thu_tu=1)
  const { data: nhomDefault } = await externalSupabase
    .from("doan_nhom")
    .select("id")
    .eq("doan_id", doanId)
    .eq("thu_tu", 1)
    .maybeSingle();
  const nhomId = nhomDefault?.id ?? null;

  // doan_ngay: scope theo nhóm nếu có (fallback đoàn-level cho data legacy)
  let ngayQuery = externalSupabase
    .from("doan_ngay")
    .select("id, ngay_so, ngay_date, thanh_pho, an_trua_nha_hang_id, an_toi_nha_hang_id")
    .eq("doan_id", doanId)
    .order("ngay_so");
  if (nhomId != null) ngayQuery = ngayQuery.eq("doan_nhom_id", nhomId);
  const ngayRes = await ngayQuery;
  const ngayRows = ngayRes.data ?? [];
  const ngayIds = ngayRows.map((r) => r.id);

  // Items / booking_nh / chi_phi scope theo nhóm-ngày để không đếm chéo nhóm
  const [itemRes, nhRes, dvRes, cpRes] = await Promise.all([
    ngayIds.length > 0
      ? externalSupabase
          .from("doan_ngay_item")
          .select("doan_ngay_id")
          .in("doan_ngay_id", ngayIds)
      : Promise.resolve({ data: [] as { doan_ngay_id: number | null }[] }),
    ngayIds.length > 0
      ? externalSupabase
          .from("doan_booking_nh")
          .select("id", { count: "exact", head: true })
          .in("doan_ngay_id", ngayIds)
      : Promise.resolve({ count: 0 }),
    // doan_booking_dv là đoàn-level — không scope được theo nhóm
    externalSupabase
      .from("doan_booking_dv")
      .select("id", { count: "exact", head: true })
      .eq("doan_id", doanId),
    // chi_phi NH / cảnh điểm: scope qua ref_doan_ngay_id (cả 2 danh mục đều set ref khi cascade)
    ngayIds.length > 0
      ? externalSupabase
          .from("doan_chi_phi")
          .select("id", { count: "exact", head: true })
          .eq("doan_id", doanId)
          .in("danh_muc", ["nha_hang", "canh_diem"])
          .in("ref_doan_ngay_id", ngayIds)
      : Promise.resolve({ count: 0 }),
  ]);

  const lines: string[] = [];
  const items = itemRes.data ?? [];
  const nhCount = nhRes.count ?? 0;
  const dvCount = dvRes.count ?? 0;
  const cpCount = cpRes.count ?? 0;

  // Items count per doan_ngay_id
  const itemCountByNgayId = new Map<number, number>();
  for (const it of items) {
    if (it.doan_ngay_id == null) continue;
    itemCountByNgayId.set(it.doan_ngay_id, (itemCountByNgayId.get(it.doan_ngay_id) ?? 0) + 1);
  }

  // Ngày conflict: có NH (trưa/tối) hoặc có items. KS-only thì OK.
  type ConflictNgay = typeof ngayRows[number] & { itemCount: number };
  const conflictNgay: ConflictNgay[] = [];
  for (const r of ngayRows) {
    const itemCount = itemCountByNgayId.get(r.id) ?? 0;
    const hasNH = r.an_trua_nha_hang_id !== null || r.an_toi_nha_hang_id !== null;
    if (hasNH || itemCount > 0) conflictNgay.push({ ...r, itemCount });
  }

  if (conflictNgay.length > 0) {
    lines.push(`Lịch trình đã có ${conflictNgay.length} ngày trùng với seri:`);
    for (const r of conflictNgay) {
      const parts: string[] = [];
      if (r.thanh_pho) parts.push(r.thanh_pho);
      if (r.an_trua_nha_hang_id) parts.push("ăn trưa");
      if (r.an_toi_nha_hang_id) parts.push("ăn tối");
      if (r.itemCount > 0) parts.push(`${r.itemCount} cảnh điểm`);
      lines.push(`  • Ngày ${r.ngay_so} (${r.ngay_date}) — ${parts.join(", ")}`);
    }
  }
  if (nhCount > 0) lines.push(`${nhCount} booking nhà hàng`);
  if (dvCount > 0) lines.push(`${dvCount} booking dịch vụ`);
  if (cpCount > 0) lines.push(`${cpCount} chi phí (NH / cảnh điểm)`);

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

      const thuMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      // UTC-safe parse để tránh timezone-shift bug
      const [bY, bM, bD] = ngayDi.split("-").map(Number);
      const baseDate = new Date(Date.UTC(bY, bM - 1, bD));

      // 1b. Resolve nhóm target (thu_tu=1) — applySeri chỉ apply vào nhóm này.
      //     Nhóm khác (nếu có) giữ nguyên dữ liệu.
      const { data: nhomDefault } = await externalSupabase
        .from("doan_nhom")
        .select("id")
        .eq("doan_id", doanId)
        .eq("thu_tu", 1)
        .maybeSingle();
      if (!nhomDefault) throw new Error("Đoàn chưa có nhóm mặc định — áp seri thất bại");

      // 2. UPSERT doan_ngay per ngay_so — PER NHÓM (tránh trùng ngay_so giữa các nhóm
      //    khiến UPDATE nhầm row nhóm khác).
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
