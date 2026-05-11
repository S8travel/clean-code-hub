import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { buildAuditLogger } from "@/hooks/use-activity-log";

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
  so_dien_thoai: string | null;
  email: string | null;
  khach_san_id: number | null;
  ghi_chu: string | null;
  nha_cung_cap_id: number | null;
}

export interface NhaHangItem {
  id: number;
  ten: string;
  dia_chi: string | null;
  thong_tin_chung: string | null;
  nguoi_thanh_toan: string | null;
  so_dien_thoai: string | null;
  nha_cung_cap_id: number | null;
}

export interface KhachSanItem {
  id: number;
  ten: string;
  dia_chi: string | null;
  thong_tin_chung: string | null;
  so_dien_thoai: string | null;
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
  an_trua_ghi_chu: string | null;
  an_toi_ghi_chu: string | null;
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
  an_trua_ghi_chu: string;
  an_toi_ghi_chu: string;
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
        .select("id, ten, loai, co_phi, gia_mac_dinh, nguoi_thanh_toan, icon, dia_diem, so_dien_thoai, email, khach_san_id, ghi_chu, nha_cung_cap_id")
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
        .select("id, ten, dia_chi, thong_tin_chung, nguoi_thanh_toan, so_dien_thoai, nha_cung_cap_id")
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
        .select("id, ten, dia_chi, thong_tin_chung, so_dien_thoai")
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
  const parseUTC = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const days: DayLocal[] = [];
  const start = parseUTC(ngayDi);
  const end = parseUTC(ngayVe);
  let i = 1;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
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
      an_trua_ghi_chu: "",
      an_toi_ghi_chu: "",
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
      an_trua_ghi_chu: dbRow.an_trua_ghi_chu || "",
      an_toi_ghi_chu: dbRow.an_toi_ghi_chu || "",
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
    co_tinh_suat_tl_nha_hang?: boolean | null;
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
      const parseUTC = (s: string) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d));
      };
      const start = parseUTC(ngayDi);
      const end = parseUTC(ngayVe);
      const rows = [];
      let i = 1;
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        rows.push({
          doan_id: doanId,
          ngay_so: i++,
          ngay_date: dateStr,
          thu: thuMap[d.getUTCDay()],
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
// Pre-check trước khi user xóa cảnh điểm khỏi điều tour.
//   1. chi_phi liên kết đã có dntt_allocations → block (data integrity)
//   2. doan_booking_dv với NCC tương ứng đã gửi mail & chưa hủy → block (tránh lệch state booking)
// Caller nhận { ok, reason } để hiện toast.
export async function checkCanhDiemDeletable(
  itemId: number,
  options?: { doanId: number; canhDiem: CanhDiemItem },
): Promise<{ ok: boolean; reason?: string }> {
  const { data: cpRow } = await externalSupabase
    .from("doan_chi_phi")
    .select("id, mo_ta")
    .eq("ref_doan_ngay_item_id", itemId)
    .maybeSingle();
  if (cpRow) {
    const { data: allocs } = await externalSupabase
      .from("dntt_allocations")
      .select("dntt_id")
      .eq("chi_phi_id", cpRow.id)
      .limit(5);
    if (allocs && allocs.length > 0) {
      const dnttIds = [...new Set(allocs.map((a: any) => a.dntt_id))]
        .map((id) => `#${id}`)
        .join(", ");
      const cdName = cpRow.mo_ta || `cảnh điểm #${itemId}`;
      return {
        ok: false,
        reason: `Không thể xóa "${cdName}" — đã có ĐNTT (${dnttIds}). Hủy ĐNTT trước khi xóa khỏi tour.`,
      };
    }
  }
  if (options) {
    const ncc = options.canhDiem.dia_diem || options.canhDiem.ten;
    const { data: bookingDv } = await externalSupabase
      .from("doan_booking_dv")
      .select("id, booking_status")
      .eq("doan_id", options.doanId)
      .eq("ten_nha_cung_cap", ncc)
      .maybeSingle();
    if (bookingDv && ["cho_xac_nhan", "da_xac_nhan"].includes(bookingDv.booking_status)) {
      const statusLabel = bookingDv.booking_status === "da_xac_nhan" ? "đã xác nhận" : "đã gửi mail booking";
      return {
        ok: false,
        reason: `Không thể xóa "${options.canhDiem.ten}" — booking dịch vụ (${ncc}) ${statusLabel}, chưa hủy. Hủy booking trước khi xóa khỏi tour.`,
      };
    }
  }
  return { ok: true };
}

// Pre-check khi xóa nhà hàng (trưa/tối) khỏi điều tour.
//   1. chi_phi NH (mo_ta khớp suffix "(trưa)"/"(tối)") có DNTT → block
//   2. doan_booking_nh đã gửi mail (da_gui/nh_xac_nhan) → block
export async function checkNhaHangDeletable(
  doanNgayId: number,
  nhaHangId: number,
  buaAn: "trua" | "toi",
  nhaHangTen: string,
): Promise<{ ok: boolean; reason?: string }> {
  const buaLabel = buaAn === "trua" ? "trưa" : "tối";
  const mealSuffix = buaAn === "trua" ? "(trưa)" : "(tối)";

  // 1. chi_phi NH cho bữa này
  const { data: cpRows } = await externalSupabase
    .from("doan_chi_phi")
    .select("id, mo_ta")
    .eq("ref_doan_ngay_id", doanNgayId)
    .eq("danh_muc", "nha_hang");
  const cpRow = (cpRows || []).find((r: any) => typeof r.mo_ta === "string" && r.mo_ta.endsWith(mealSuffix));
  if (cpRow) {
    const { data: allocs } = await externalSupabase
      .from("dntt_allocations")
      .select("dntt_id")
      .eq("chi_phi_id", cpRow.id)
      .limit(5);
    if (allocs && allocs.length > 0) {
      const dnttIds = [...new Set(allocs.map((a: any) => a.dntt_id))]
        .map((id) => `#${id}`)
        .join(", ");
      return {
        ok: false,
        reason: `Không thể xóa "${nhaHangTen} (${buaLabel})" — đã có ĐNTT (${dnttIds}). Hủy ĐNTT trước khi xóa khỏi tour.`,
      };
    }
  }

  // 2. booking_nh — block nếu đã gửi mail và chưa vào luồng hủy
  const { data: bookingNh } = await externalSupabase
    .from("doan_booking_nh")
    .select("id, booking_status")
    .eq("doan_ngay_id", doanNgayId)
    .eq("nha_hang_id", nhaHangId)
    .eq("bua_an", buaAn)
    .maybeSingle();
  if (bookingNh && ["da_gui", "nh_xac_nhan"].includes(bookingNh.booking_status)) {
    const statusLabel = bookingNh.booking_status === "nh_xac_nhan" ? "đã xác nhận" : "đã gửi mail booking";
    return {
      ok: false,
      reason: `Không thể xóa "${nhaHangTen} (${buaLabel})" — booking ${statusLabel}, chưa hủy. Hủy booking trước khi xóa khỏi tour.`,
    };
  }
  return { ok: true };
}

// Pre-check khi xóa khách sạn khỏi điều tour.
//   doan_booking_ks active (đặt trước/final đã gửi, chưa vào luồng hủy) → block.
// Chi_phi KS được quản lý thủ công ở Chi phí tab — không link 1-1 từ điều tour, bỏ qua DNTT check.
export async function checkKhachSanDeletable(
  doanId: number,
  khachSanId: number,
  khachSanTen: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data: bookingKs } = await externalSupabase
    .from("doan_booking_ks")
    .select("id, ks_dat_truoc_status, ks_final_status")
    .eq("doan_id", doanId)
    .eq("khach_san_id", khachSanId)
    .maybeSingle();
  if (!bookingKs) return { ok: true };

  // Active phase = đã gửi mail nhưng chưa vào luồng hủy (cho_ks_xac_nhan_huy / ks_xac_nhan_huy = OK)
  const dtActive = ["cho_ks_xac_nhan", "ks_xac_nhan"].includes(bookingKs.ks_dat_truoc_status || "");
  const finalActive = ["cho_ks_xac_nhan", "ks_xac_nhan_final"].includes(bookingKs.ks_final_status || "");
  if (!dtActive && !finalActive) return { ok: true };

  let phase = "đặt trước";
  let statusLabel = "đã gửi mail booking";
  if (finalActive) {
    phase = "final";
    statusLabel = bookingKs.ks_final_status === "ks_xac_nhan_final" ? "đã xác nhận" : "đã gửi mail booking";
  } else if (bookingKs.ks_dat_truoc_status === "ks_xac_nhan") {
    statusLabel = "đã xác nhận";
  }
  return {
    ok: false,
    reason: `Không thể xóa "${khachSanTen}" — booking ${phase} ${statusLabel}, chưa hủy. Hủy booking trước khi xóa khỏi tour.`,
  };
}

export function useSaveDieuTour() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: SaveDieuTourPayload) => {
      const { doanId, doanFields, days, soKhach, canhDiemList, nhaHangList, khachSanList } = payload;

      // Counter cho toast notification ở caller (UX warning user về cascade side-effects)
      const counters = { thucTeClearCount: 0 };

      // Pre-check DNTT trước khi delete chi_phi linked với doan_ngay_item.
      // Nếu chi_phi có dntt_allocations → THROW error tiếng Việt cụ thể (DNTT id + tên cảnh điểm).
      // User phải hủy/giải phóng allocation trước khi xóa cảnh điểm khỏi tour.
      const deleteChiPhiByItemIdSafe = async (itemId: number) => {
        const { data: cpRow } = await externalSupabase
          .from("doan_chi_phi")
          .select("id, mo_ta")
          .eq("ref_doan_ngay_item_id", itemId)
          .maybeSingle();
        if (!cpRow) return;
        const { data: allocs } = await externalSupabase
          .from("dntt_allocations")
          .select("dntt_id")
          .eq("chi_phi_id", cpRow.id)
          .limit(5);
        if (allocs && allocs.length > 0) {
          const dnttIds = [...new Set(allocs.map((a: any) => a.dntt_id))]
            .map((id) => `#${id}`).join(", ");
          const cdName = cpRow.mo_ta || `cảnh điểm #${itemId}`;
          throw new Error(
            `Không thể xóa "${cdName}" — đã có ĐNTT (${dnttIds}). Hủy ĐNTT trước khi xóa khỏi tour.`
          );
        }
        await externalSupabase.from("doan_chi_phi").delete().eq("id", cpRow.id);
      };

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
          an_trua_ghi_chu: day.an_trua_ghi_chu || null,
          an_toi_ghi_chu: day.an_toi_ghi_chu || null,
          khach_san_id: day.khach_san_id,
          ks_ma_code: day.ks_ma_code || null,
          ks_loai_phong: day.ks_loai_phong || null,
        };

        let doanNgayId = day.id;

        if (doanNgayId) {
          await externalSupabase.from("doan_ngay").update(ngayPayload).eq("id", doanNgayId);
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
            await externalSupabase.from("doan_ngay").update(ngayPayload).eq("id", doanNgayId);
          } else {
            const { data } = await externalSupabase.from("doan_ngay").insert(ngayPayload).select("id").single();
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
          // Delete referencing doan_chi_phi rows first — pre-check DNTT
          for (const itemId of idsToDelete) {
            await deleteChiPhiByItemIdSafe(itemId);
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
              await deleteChiPhiByItemIdSafe(ri.id);
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

          const { data } = await externalSupabase
            .from("doan_ngay_item")
            .upsert(itemPayloads, { onConflict: "doan_ngay_id,canh_diem_id" })
            .select("id, canh_diem_id, co_phi, don_gia, so_luong, nguoi_thanh_toan");

          insertedItems = (data || []) as typeof insertedItems;
        }

        // 4. Auto-generate doan_chi_phi for co_phi items
        // Day-use wrapper (canh_diem.khach_san_id != null): KHÔNG auto-tạo chi phí ở đây
        // — chi phí KS day-use được quản lý thủ công trong tab Chi phí (giống KS qua đêm)
        // để tránh overwrite don_gia/so_luong khi user save lại điều tour
        if (insertedItems.length > 0) {
          for (const item of insertedItems) {
            if (!item.co_phi) continue;
            const cd = canhDiemList.find((c) => c.id === item.canh_diem_id);
            if (cd?.khach_san_id) continue; // Day-use wrapper — managed in Chi phí section
            const newSoLuong = item.so_luong ?? soKhach;
            const newDonGia  = item.don_gia ?? 0;
            const newTotal   = newDonGia * newSoLuong;
            const isHdv      = item.nguoi_thanh_toan === "hdv";

            const masterFields: any = {
              doan_id: doanId,
              ngay_so: day.ngay_so,
              loai: "chi",
              danh_muc: "canh_diem",
              ref_doan_ngay_item_id: item.id,
              ref_doan_ngay_id: doanNgayId,
              mo_ta: cd?.ten ?? "",
              nha_cung_cap_id: cd?.nha_cung_cap_id ?? null,
            };
            const pricingFields: any = {
              don_gia: newDonGia,
              so_luong: newSoLuong,
              tien_cong_ty: isHdv ? 0 : newTotal,
              tien_hdv:     isHdv ? newTotal : 0,
            };

            // HYBRID 2-way cascade:
            // - is_overridden=true → CHỈ master metadata (giữ giá trị OP)
            // - is_overridden=false → cascade full + clear thuc_te nếu so_luong/don_gia đổi
            const { data: existing } = await externalSupabase
              .from("doan_chi_phi")
              .select("id, so_luong, don_gia, is_overridden")
              .eq("ref_doan_ngay_item_id", item.id)
              .maybeSingle();

            if (existing) {
              if (existing.is_overridden) {
                await externalSupabase.from("doan_chi_phi")
                  .update(masterFields).eq("id", existing.id);
              } else {
                const soLuongChanged = Number(existing.so_luong) !== newSoLuong
                                    || Number(existing.don_gia)  !== newDonGia;
                const updatePayload: any = { ...masterFields, ...pricingFields };
                if (soLuongChanged) {
                  updatePayload.thanh_tien_thuc_te = null;
                  counters.thucTeClearCount++;
                }
                await externalSupabase.from("doan_chi_phi")
                  .update(updatePayload).eq("id", existing.id);
              }
            } else {
              await externalSupabase.from("doan_chi_phi")
                .insert({ ...masterFields, ...pricingFields });
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
              // Tách 2 nhóm fields:
              // - alwaysFields: master metadata, OK update mọi lúc
              // - initialFields: chỉ INSERT (lần đầu); UPDATE KHÔNG đụng
              //   để tránh reset tien_cong_ty/hdv (computed bởi NH section
              //   khi user save thật sự)
              const alwaysFields: any = {
                doan_id: doanId,
                ngay_so: day.ngay_so,
                loai: "chi",
                danh_muc: "nha_hang",
                ref_doan_ngay_id: doanNgayId,
                mo_ta: mealItem
                  ? `${(mealItem as any).ten}${meal.label === "an_trua" ? " (trưa)" : meal.label === "an_toi" ? " (tối)" : ""}`
                  : "",
                nha_cung_cap_id: (mealItem as any)?.nha_cung_cap_id ?? null,
              };
              const initialFields = { tien_cong_ty: 0, tien_hdv: 0 };

              // Upsert: filter mo_ta để phân biệt trưa/tối (cùng doan_ngay).
              const { data: existingRows } = await externalSupabase
                .from("doan_chi_phi")
                .select("id")
                .eq("doan_id", doanId)
                .eq("danh_muc", "nha_hang")
                .eq("ref_doan_ngay_id", doanNgayId)
                .eq("mo_ta", alwaysFields.mo_ta)
                .limit(1);
              const existing = existingRows?.[0];
              if (existing) {
                // UPDATE: chỉ master metadata. KHÔNG touch tien_cong_ty/hdv
                // (NH section quản lý qua handleSave khi user thật sự lưu).
                await externalSupabase.from("doan_chi_phi").update(alwaysFields).eq("id", existing.id);
              } else {
                await externalSupabase.from("doan_chi_phi").insert({ ...alwaysFields, ...initialFields });
              }
            }
          }
        }
      }
      for (const day of days) {
        if (!day.id) continue;
        for (const bua of ["trua", "toi"] as const) {
          const nhId = bua === "trua" ? day.an_trua_nha_hang_id : day.an_toi_nha_hang_id;
          const setMenuId = bua === "trua" ? day.an_trua_set_menu_id : day.an_toi_set_menu_id;
          const { data: existingBkNh } = await externalSupabase
            .from("doan_booking_nh")
            .select("id, nha_hang_id, booking_status, set_menu_id")
            .eq("doan_ngay_id", day.id)
            .eq("bua_an", bua)
            .maybeSingle();
          if (!existingBkNh) continue;
          // NH thay đổi → xóa booking chưa gửi
          if (existingBkNh.nha_hang_id !== nhId) {
            if (existingBkNh.booking_status === "chua_gui") {
              await externalSupabase.from("doan_booking_nh").delete().eq("id", existingBkNh.id);
            }
            continue;
          }
          // Cùng NH nhưng set_menu thay đổi → sync set_menu + snapshot fields.
          // Booking_nh phản ánh "current plan". mail_content_hash giữ snapshot mail đã gửi → dirty badge tự hiện nếu khác.
          if (setMenuId !== existingBkNh.set_menu_id) {
            const updates: Record<string, any> = { set_menu_id: setMenuId ?? null };
            if (setMenuId) {
              const { data: sm } = await externalSupabase
                .from("nha_hang_set_menu")
                .select("ten_set, gia, don_vi")
                .eq("id", setMenuId)
                .maybeSingle();
              if (sm) {
                updates.ten_set_snapshot = sm.ten_set;
                updates.gia_snapshot = sm.gia;
                updates.don_vi_snapshot = sm.don_vi;
              }
              // Mon list: chỉ auto-sync khi booking CHƯA gửi (tránh đè user edit trên booking đã gửi)
              if (existingBkNh.booking_status === "chua_gui") {
                const { data: mons } = await externalSupabase
                  .from("nha_hang_set_menu_mon")
                  .select("ten_mon")
                  .eq("set_menu_id", setMenuId)
                  .order("thu_tu", { ascending: true });
                if (mons) updates.mon_an_snapshot = mons.map((m: any) => m.ten_mon);
              }
            } else {
              updates.ten_set_snapshot = null;
              updates.gia_snapshot = null;
              updates.don_vi_snapshot = null;
              if (existingBkNh.booking_status === "chua_gui") updates.mon_an_snapshot = [];
            }
            await externalSupabase.from("doan_booking_nh").update(updates).eq("id", existingBkNh.id);
          }
        }
      }
      // 6. Sync doan_ngay → doan_booking_ks (insert-only + reset cancelled)
      // Bao gồm KS qua đêm (doan_ngay.khach_san_id) và KS day-use (qua wrapper canh_diem.khach_san_id)
      const dayUseKsIds = days.flatMap((d) =>
        (d.items ?? [])
          .map((it) => canhDiemList.find((c) => c.id === it.canh_diem_id)?.khach_san_id)
          .filter((id): id is number => id != null)
      );
      const allKsIdsInDays = [
        ...new Set([
          ...days.map((d) => d.khach_san_id).filter((id): id is number => id != null),
          ...dayUseKsIds,
        ]),
      ];
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

      // Trả counters cho caller hiển thị toast warning
      return counters;
    },
    onSuccess: (_, payload) => {
      qc.invalidateQueries({ queryKey: ["doan"] });
      qc.invalidateQueries({ queryKey: ["doan_ngay"] });
      qc.invalidateQueries({ queryKey: ["doan_ngay_item"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi"] });
      qc.invalidateQueries({ queryKey: ["chi_phi_ks_data"] });
      qc.invalidateQueries({ queryKey: ["chi_phi_nh_section"] });
      qc.invalidateQueries({ queryKey: ["doan_booking_ks"] });
      qc.invalidateQueries({ queryKey: ["doan_booking_nh"] });
      qc.invalidateQueries({ queryKey: ["doan_booking_tau"] });
      qc.invalidateQueries({ queryKey: ["doan_booking_dv"] });
      const log = buildAuditLogger(user?.user_id, user?.ho_ten);
      log({ doan_id: payload.doanId, action: "sua", table_name: "doan_ngay", record_id: payload.doanId, mo_ta: `Lưu lịch trình điều tour` });
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
      // Sent booking: update dich_vu_list để booking phản ánh "current plan".
      // mail_content_hash giữ snapshot mail đã gửi → dirty badge tự hiện nếu khác.
      const oldList = Array.isArray(existing.dich_vu_list) ? existing.dich_vu_list : [];
      const oldKeys = new Set(oldList.map((d: any) => `${d.ten_dv}|${d.ngay_date}`));
      const newKeys = new Set(dichVu.map((d) => `${d.ten_dv}|${d.ngay_date}`));
      const hasChange =
        oldKeys.size !== newKeys.size ||
        [...oldKeys].some((k) => !newKeys.has(k)) ||
        [...newKeys].some((k) => !oldKeys.has(k));
      if (hasChange) {
        await externalSupabase
          .from("doan_booking_dv")
          .update({ dich_vu_list: dichVu, email_nha_cung_cap: email })
          .eq("id", existing.id);
      }

      if (hasChange) {
        warnings.push({ ncc, services: dichVu.map((d) => d.ten_dv) });
      }
    }
    // da_huy: skip silently
  }

  // Cleanup: xóa các booking chua_dat không còn trong điều tour hiện tại
  const { data: allExisting } = await externalSupabase
    .from("doan_booking_dv")
    .select("id, ten_nha_cung_cap, booking_status")
    .eq("doan_id", doanId);

  if (allExisting) {
    for (const bk of allExisting) {
      if (bk.booking_status === "chua_dat" && !groups.has(bk.ten_nha_cung_cap)) {
        await externalSupabase.from("doan_booking_dv").delete().eq("id", bk.id);
      }
    }
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
