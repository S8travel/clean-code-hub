import { externalSupabase } from "@/lib/supabase-external";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useChiPhiLockGuard } from "@/hooks/use-chi-phi-lock";
import { buildAuditLogger } from "@/hooks/use-activity-log";
import { buildExpectedNhKeys, findOrphanNhChiPhi, buildOccupiedMealSlots, buildOccupiedMealSlotIds, findOrphanNhExtras, findRemovedPaidNhChiPhi, nhChiPhiSlot } from "@/lib/nh-orphan-cleanup";
import { cascadeInsertDinhKyNH } from "@/lib/nh-dinh-ky";
import { extraParentId } from "@/lib/dntt-gop-calc";
import { getActiveDnttIdsForChiPhi, getActiveDnttIdsForChiPhiBatch } from "@/lib/dntt-guard";
import { DieuTourGuardError } from "@/lib/dieu-tour-guard-error";
import {
  findDoomedCanhDiemItems, findBlockedChiPhi, buildCanhDiemBlockedMessage,
} from "@/lib/canh-diem-remove-guard";
import { resolveCanhDiemChiPhiTarget } from "@/lib/canh-diem-cascade";
import { calcSoKhachThucTe } from "@/lib/foc-calc";
import type { TablesInsert, TablesUpdate } from "@/lib/database.types";

// ── Lookup types ──
export interface CanhDiemItem {
  id: number;
  ten: string;
  loai: string | null;
  co_phi: boolean | null;
  gia_mac_dinh: number | null;
  foc_khach: number | null;
  foc_mien: number | null;
  nguoi_thanh_toan: string | null;
  icon: string | null;
  dia_diem: string | null;
  so_dien_thoai: string | null;
  email: string | null;
  khach_san_id: number | null;
  ghi_chu: string | null;
  nha_cung_cap_id: number | null;
  /** Vé combo đã bao gồm bữa ăn ('trua'|'toi'|'ca_hai'|null) — CHỈ để cảnh báo
   *  hiển thị ở điều tour, KHÔNG dùng tính tiền (chưa có cột snapshot per-tour). */
  bao_gom_bua_an: string | null;
}

export interface NhaHangItem {
  id: number;
  ten: string;
  dia_chi: string | null;
  thong_tin_chung: string | null;
  nguoi_thanh_toan: string | null;
  so_dien_thoai: string | null;
  nha_cung_cap_id: number | null;
  foc_khach: number | null;
  foc_mien: number | null;
  chiet_khau_phan_tram: number | null;
  /** Đoàn MỚI tự đánh dấu chi phí nhà hàng này là định kỳ — xem lib/nh-dinh-ky.ts */
  thanh_toan_dinh_ky_mac_dinh: boolean | null;
}

export interface KhachSanItem {
  id: number;
  ten: string;
  dia_chi: string | null;
  thong_tin_chung: string | null;
  so_dien_thoai: string | null;
  foc_khach: number | null;
  foc_mien: number | null;
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
        .select("id, ten, loai, co_phi, gia_mac_dinh, foc_khach, foc_mien, nguoi_thanh_toan, icon, dia_diem, so_dien_thoai, email, khach_san_id, ghi_chu, nha_cung_cap_id, bao_gom_bua_an")
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
        .select("id, ten, dia_chi, thong_tin_chung, nguoi_thanh_toan, so_dien_thoai, nha_cung_cap_id, foc_khach, foc_mien, chiet_khau_phan_tram, thanh_toan_dinh_ky_mac_dinh")
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
        .select("id, ten, dia_chi, thong_tin_chung, so_dien_thoai, foc_khach, foc_mien")
        .order("ten");
      if (error) throw error;
      return data as KhachSanItem[];
    },
  });
}

// ── Data hooks ──
/**
 * List doan_ngay của 1 đoàn, filter optional theo nhóm.
 * - `doanNhomId=undefined` → fetch tất cả nhóm (legacy behavior, đoàn 1 nhóm OK)
 * - `doanNhomId=number` → chỉ nhóm đó (Phase 2: UI tabs nhóm pass id active)
 */
export function useDoanNgayList(doanId: number | undefined, doanNhomId?: number | null) {
  return useQuery({
    queryKey: ["doan_ngay", doanId, doanNhomId ?? null],
    enabled: !!doanId,
    queryFn: async () => {
      let q = externalSupabase
        .from("doan_ngay")
        .select("*")
        .eq("doan_id", doanId!)
        .order("ngay_so");
      if (doanNhomId != null) q = q.eq("doan_nhom_id", doanNhomId);
      const { data, error } = await q;
      if (error) throw error;
      return data as DoanNgayRow[];
    },
  });
}

/**
 * List doan_ngay_item của 1 đoàn, filter optional theo nhóm (qua doan_ngay).
 */
export function useDoanNgayItems(doanId: number | undefined, doanNhomId?: number | null) {
  return useQuery({
    queryKey: ["doan_ngay_item", doanId, doanNhomId ?? null],
    enabled: !!doanId,
    queryFn: async () => {
      // Filter qua doan_ngay: lấy id của các ngày thuộc nhóm trước
      let allowedNgayIds: number[] | null = null;
      if (doanNhomId != null) {
        const { data: ngayRows } = await externalSupabase
          .from("doan_ngay")
          .select("id")
          .eq("doan_id", doanId!)
          .eq("doan_nhom_id", doanNhomId);
        allowedNgayIds = (ngayRows ?? []).map((r) => r.id);
        if (allowedNgayIds.length === 0) return [] as DoanNgayItemRow[];
      }
      let q = externalSupabase
        .from("doan_ngay_item")
        .select("*")
        .eq("doan_id", doanId!)
        .order("thu_tu");
      if (allowedNgayIds) q = q.in("doan_ngay_id", allowedNgayIds);
      const { data, error } = await q;
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
  /** Nhóm active đang được save. Phase 2 UI tabs pass id của nhóm. Bỏ trống → mặc định nhóm thu_tu=1. */
  doanNhomId?: number | null;
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
    thu_tip?: boolean | null;
    tip_rate?: number | null;
    tip_so_ngay_override?: number | null;
    tip_so_khach_override?: number | null;
    tip_lump_sum?: number | null;
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
      // Lấy nhóm "Toàn đoàn" (thu_tu=1) — DB trigger đảm bảo đã có khi INSERT doan
      const { data: nhomDefault } = await externalSupabase
        .from("doan_nhom")
        .select("id")
        .eq("doan_id", doanId)
        .eq("thu_tu", 1)
        .maybeSingle();
      if (!nhomDefault) throw new Error("Đoàn chưa có nhóm mặc định");
      const thuMap = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
      const parseUTC = (s: string) => {
        const [y, m, d] = s.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d));
      };
      const start = parseUTC(ngayDi);
      const end = parseUTC(ngayVe);
      const rows: { doan_id: number; doan_nhom_id: number; ngay_so: number; ngay_date: string; thu: string }[] = [];
      let i = 1;
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        rows.push({
          doan_id: doanId,
          doan_nhom_id: nhomDefault.id,
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
// getActiveDnttIdsForChiPhi: chuyển sang @/lib/dntt-guard (dùng chung cho use-doan,
// use-doan-nhom — tránh circular import). Import ở đầu file.

// Pre-check trước khi user xóa cảnh điểm khỏi điều tour.
//   1. chi_phi liên kết đã có dntt_allocations ACTIVE → block (data integrity)
//   2. doan_booking_dv với NCC tương ứng đã gửi mail & chưa hủy → block (tránh lệch state booking)
// Caller nhận { ok, reason } để hiện toast.
export async function checkCanhDiemDeletable(
  itemId: number,
  options?: { doanId: number; canhDiem: CanhDiemItem },
): Promise<{ ok: boolean; reason?: string }> {
  const { data: cpRow } = await externalSupabase
    .from("doan_chi_phi")
    .select("id, mo_ta, so_tien_da_tt")
    .eq("ref_doan_ngay_item_id", itemId)
    .maybeSingle();
  if (cpRow) {
    const activeDnttIds = await getActiveDnttIdsForChiPhi(cpRow.id);
    const cdName = cpRow.mo_ta || `cảnh điểm #${itemId}`;
    if (activeDnttIds.length > 0) {
      const dnttIds = activeDnttIds.map((id) => `#${id}`).join(", ");
      return {
        ok: false,
        reason: `Không thể xóa "${cdName}" — đã có ĐNTT (${dnttIds}). Hủy ĐNTT trước khi xóa khỏi tour.`,
      };
    }
    // Đã trả tiền nhưng ĐNTT đã hủy (so_tien_da_tt còn > 0) → vẫn chặn xóa.
    if (Number(cpRow.so_tien_da_tt ?? 0) > 0) {
      return {
        ok: false,
        reason: `Không thể xóa "${cdName}" — đã thanh toán. Xử lý công nợ/hoàn tiền trước khi gỡ khỏi tour.`,
      };
    }
  }
  if (options) {
    // Khóa Booking DV gom theo NCC (đồng bộ dvGroupName trong sync).
    const nccNameById = await fetchNccNames([options.canhDiem.nha_cung_cap_id]);
    const ncc = dvGroupName(options.canhDiem, nccNameById);
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
    .select("id, mo_ta, so_tien_da_tt")
    .eq("ref_doan_ngay_id", doanNgayId)
    .eq("danh_muc", "nha_hang");
  const cpRow = (cpRows || []).find((r) => typeof r.mo_ta === "string" && r.mo_ta.endsWith(mealSuffix));
  if (cpRow) {
    const activeDnttIds = await getActiveDnttIdsForChiPhi(cpRow.id);
    if (activeDnttIds.length > 0) {
      const dnttIds = activeDnttIds.map((id) => `#${id}`).join(", ");
      return {
        ok: false,
        reason: `Không thể xóa "${nhaHangTen} (${buaLabel})" — đã có ĐNTT (${dnttIds}). Hủy ĐNTT trước khi xóa khỏi tour.`,
      };
    }
    // Đã trả tiền nhưng ĐNTT đã hủy (so_tien_da_tt còn > 0) → vẫn chặn đổi/xóa NH.
    if (Number(cpRow.so_tien_da_tt ?? 0) > 0) {
      return {
        ok: false,
        reason: `Không thể xóa "${nhaHangTen} (${buaLabel})" — đã thanh toán. Xử lý công nợ/hoàn tiền trước khi gỡ khỏi tour.`,
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

// GỠ 07/2026 — `checkKhachSanDeletable` (chặn cứng đổi/gỡ KS khi booking đã gửi).
//
// Nó tạo ngõ cụt: mở khóa duy nhất là ks_final_status ∈ {cho_ks_xac_nhan_huy,
// ks_xac_nhan_huy}, mà nút đặt được trạng thái đó lại nằm trong FinalSection của
// BookingKSTab — chỉ render khi KS đã xác nhận đặt-trước. Ở cho_ks_xac_nhan (mail
// vừa gửi, KS chưa trả lời — ~30% số dòng booking) OP không đổi / không gỡ / không
// hủy được bằng bất kỳ đường nào trên UI. Hệ quả: OP làm booking ngoài hệ thống.
//
// Thay bằng gate CÓ ĐƯỜNG THOÁT: `checkKsPhiHuyOnChange` (use-doi-ks-phi-huy.ts)
// chạy trong DoanDetail.doSave TRƯỚC khi ghi DB, phát hiện cả ĐNTT sống lẫn booking
// đã gửi, rồi mở modal hỏi phí hủy + mail hủy. Vị từ "booking còn sống" nay là
// `isKsBookingActive` trong cùng file đó.

export function useSaveDieuTour() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const lockGuard = useChiPhiLockGuard();
  return useMutation({
    mutationFn: async (payload: SaveDieuTourPayload) => {
      const { doanId, doanNhomId, doanFields, days, soKhach, canhDiemList, nhaHangList, khachSanList } = payload;

      // Counter cho toast notification ở caller (UX warning user về cascade side-effects)
      const counters = { thucTeClearCount: 0, nhOrphanDeleted: 0, nhOrphanKept: 0 };

      let defaultDoanNhomId: number | null = doanNhomId ?? null;

      // Đoàn đã quyết toán → lưu điều tour sẽ cascade sửa chi phí → chặn (trừ admin).
      // CỐ Ý để NGOÀI khối try bên dưới: đoàn bị khoá thì UI đã disable sửa, `days` local
      // (nếu có) là rác → revert về DB mới đúng. Ném Error thường → onError refetch.
      lockGuard(doanId);

      // ══ GIAI ĐOẠN 1 — CHỈ ĐỌC & KIỂM TRA. Không một byte nào được ghi trong khối này. ══
      //
      // Mọi lỗi ở đây (guard chặn, query hỏng, mất mạng, RLS timeout) đều có chung một sự
      // thật: DB nguyên vẹn, thao tác của OP vẫn đúng. Vì vậy gói tất cả thành
      // DieuTourGuardError để `DoanDetail.onError` GIỮ NGUYÊN state, không refetch.
      //
      // Bọc cả khối thay vì gắn nhãn từng chỗ throw: thêm pre-check mới sau này không phải
      // nhớ gắn nhãn, và lỗi SELECT (dự án từng có query RLS 5-8 giây) không còn xoá sạch
      // cả buổi làm của OP — đúng thứ bản vá này đi diệt.
      //
      // Ranh giới của giai đoạn 1 là lệnh `update doan` ngay bên dưới. Đừng ghi gì trước nó.
      try {

      // Resolve doan_nhom_id sớm — dùng cho backstop bên dưới + mọi query existing-row
      // & INSERT mới (tránh ghi đè cross-nhóm khi đoàn có nhiều nhóm).
      if (defaultDoanNhomId == null) {
        const { data: nhomDefault } = await externalSupabase
          .from("doan_nhom")
          .select("id")
          .eq("doan_id", doanId)
          .eq("thu_tu", 1)
          .maybeSingle();
        defaultDoanNhomId = nhomDefault?.id ?? null;
      }
      if (defaultDoanNhomId == null) {
        throw new DieuTourGuardError("Đoàn chưa có nhóm — không thể lưu điều tour");
      }

      // ── BACKSTOP: KHÔNG cho gỡ NH đã thanh toán / có ĐNTT khỏi chương trình ──
      // Chạy TRƯỚC mọi ghi DB (update doan, upsert doan_ngay) → khi throw thì chưa
      // đụng gì; caller onError refetch → days revert sạch (không nhấp nháy half-saved).
      // So theo Ô BỮA còn nhà hàng hay không (KHÔNG so tên → đổi tên NH trong danh mục
      // không bị chặn nhầm). Gộp cả ngày của nhóm khác (chi phí NH merge cross-nhóm).
      // CHỈ chặn khi CHÍNH lần lưu này gỡ bữa (slot CŨ có NH → MỚI trống). Orphan đã
      // tồn tại từ trước (slot cũ đã trống) KHÔNG chặn — nếu không, 1 orphan cũ sẽ
      // khoá cứng mọi lần lưu điều tour về sau; để tab Chi phí xử lý orphan cũ.
      {
        const { data: allDbDays, error: eDays } = await externalSupabase
          .from("doan_ngay")
          .select("ngay_so, an_trua_nha_hang_id, an_toi_nha_hang_id, doan_nhom_id")
          .eq("doan_id", doanId);
        if (eDays) throw eDays; // fail-safe: không verify được thì KHÔNG cho lưu
        const oldOccupied = buildOccupiedMealSlots(allDbDays ?? []);
        const otherNhomDays = (allDbDays ?? []).filter((d) => d.doan_nhom_id !== defaultDoanNhomId);
        const newOccupied = buildOccupiedMealSlots([
          ...days.map((d) => ({
            ngay_so: d.ngay_so,
            an_trua_nha_hang_id: d.an_trua_nha_hang_id,
            an_toi_nha_hang_id: d.an_toi_nha_hang_id,
          })),
          ...otherNhomDays,
        ]);
        const { data: nhCps, error: eNhCps } = await externalSupabase
          .from("doan_chi_phi")
          .select("id, ngay_so, mo_ta, so_tien_da_tt")
          .eq("doan_id", doanId)
          .eq("danh_muc", "nha_hang");
        if (eNhCps) throw eNhCps; // fail-safe
        // removed = chi phí NH có slot KHÔNG còn trong chương trình mới...
        const removed = findRemovedPaidNhChiPhi(nhCps ?? [], newOccupied);
        const blocked: string[] = [];
        for (const cp of removed) {
          // ...nhưng CHỈ xét nếu slot đó TRƯỚC khi lưu vẫn còn NH (lần lưu này mới gỡ).
          const slot = nhChiPhiSlot(cp.ngay_so, cp.mo_ta);
          if (!slot || !oldOccupied.has(slot)) continue;
          const paid = Number(cp.so_tien_da_tt ?? 0) > 0;
          const activeDnttIds = await getActiveDnttIdsForChiPhi(cp.id);
          if (paid || activeDnttIds.length > 0) {
            const tag = activeDnttIds.length > 0
              ? ` (ĐNTT ${activeDnttIds.map((i) => `#${i}`).join(", ")})`
              : " (đã thanh toán)";
            blocked.push(`"${cp.mo_ta}"${tag}`);
          }
        }
        if (blocked.length > 0) {
          throw new DieuTourGuardError(
            `Không thể gỡ khỏi chương trình bữa ăn đã thanh toán/có ĐNTT: ${blocked.join("; ")}. ` +
            `Hủy ĐNTT liên quan trước, hoặc giữ nhà hàng trong lịch trình. ` +
            `Lịch trình chưa bị thay đổi.`,
          );
        }
      }

      // ── BACKSTOP 2: CẢNH ĐIỂM — cùng lý do, cùng vị trí (TRƯỚC mọi ghi DB) ──
      //
      // `deleteChiPhiByItemIdSafe` (bên dưới) cũng chặn, NHƯNG nó chỉ chạy ở bước dọn
      // doan_ngay_item — tức SAU `update doan` và SAU khi upsert doan_ngay. Throw ở đó
      // để lại DB nửa vời: số khách đã lưu, lịch trình thì không. Với autosave (không có
      // nút Save) OP mất cả loạt thao tác mà chẳng hiểu vì sao — đúng thứ bào mòn niềm
      // tin khiến người ta ngại gõ vào Điều tour.
      //
      // Khối này tính TRƯỚC tập item sắp bị xóa, kiểm hết một lượt, gộp mọi dòng vướng
      // vào MỘT thông điệp. Chưa ghi gì nên throw là an toàn tuyệt đối.
      // Phần quyết định ở lib/canh-diem-remove-guard.ts (thuần, có test).
      {
        const { data: ngayRows, error: eNgay } = await externalSupabase
          .from("doan_ngay")
          .select("id, ngay_so")
          .eq("doan_id", doanId)
          .eq("doan_nhom_id", defaultDoanNhomId);
        if (eNgay) throw eNgay; // fail-safe: không verify được thì KHÔNG cho lưu

        const ngayIdToNgaySo = new Map<number, number>(
          (ngayRows ?? []).map((r) => [r.id as number, r.ngay_so as number]),
        );
        const ngayIds = [...ngayIdToNgaySo.keys()];

        if (ngayIds.length > 0) {
          const { data: dbItems, error: eItems } = await externalSupabase
            .from("doan_ngay_item")
            .select("id, doan_ngay_id, canh_diem_id")
            .in("doan_ngay_id", ngayIds);
          if (eItems) throw eItems;

          const doomedItemIds = findDoomedCanhDiemItems(
            (dbItems ?? []).map((it) => ({
              id: it.id as number,
              doan_ngay_id: it.doan_ngay_id as number,
              canh_diem_id: it.canh_diem_id ?? null,
            })),
            ngayIdToNgaySo,
            days.map((d) => ({
              ngay_so: d.ngay_so,
              canhDiemIds: d.items.map((it) => it.canh_diem_id).filter((id): id is number => !!id && id > 0),
            })),
          );

          if (doomedItemIds.length > 0) {
            // Dòng chi phí CHÍNH của các item sắp xóa...
            const { data: mainCps, error: eMain } = await externalSupabase
              .from("doan_chi_phi")
              .select("id, mo_ta, so_tien_da_tt")
              .in("ref_doan_ngay_item_id", doomedItemIds);
            if (eMain) throw eMain;

            // ...cộng extras phát sinh `[dvps_<mainId>]` (ref_doan_ngay_item_id NULL nên
            // query trên không thấy). Xóa main mà bỏ extras → extras thành mồ côi.
            const mainIds = new Set((mainCps ?? []).map((r) => r.id as number));
            let extraCps: typeof mainCps = [];
            if (mainIds.size > 0) {
              const { data: extras, error: eExtra } = await externalSupabase
                .from("doan_chi_phi")
                .select("id, mo_ta, so_tien_da_tt")
                .eq("doan_id", doanId)
                .like("mo_ta", "[dvps_%");
              if (eExtra) throw eExtra;
              extraCps = (extras ?? []).filter((r) => {
                const parent = extraParentId(r.mo_ta);
                return parent != null && mainIds.has(parent);
              });
            }

            const allRows = [...(mainCps ?? []), ...(extraCps ?? [])].map((r) => ({
              id: r.id as number,
              mo_ta: r.mo_ta ?? null,
              so_tien_da_tt: r.so_tien_da_tt ?? null,
            }));

            if (allRows.length > 0) {
              const activeDnttByChiPhi = await getActiveDnttIdsForChiPhiBatch(
                allRows.map((r) => r.id),
              );
              const blockedCd = findBlockedChiPhi(allRows, activeDnttByChiPhi);
              if (blockedCd.length > 0) throw new DieuTourGuardError(buildCanhDiemBlockedMessage(blockedCd));
            }
          }
        }
      }
      } catch (e: unknown) {
        // Chưa ghi gì → luôn là guard error, kể cả lỗi query/RLS/mạng. Giữ nguyên thông
        // điệp gốc để OP đọc được lý do thật.
        if (e instanceof DieuTourGuardError) throw e;
        const msg = e instanceof Error ? e.message : String(e ?? "");
        throw new DieuTourGuardError(
          msg || "Không kiểm tra được điều tour trước khi lưu — thử lại. Lịch trình chưa bị thay đổi.",
        );
      }
      // Chốt lại cho TypeScript (throw ở trong try không thu hẹp kiểu được ra ngoài).
      // Vẫn nằm TRƯỚC mọi lệnh ghi.
      if (defaultDoanNhomId == null) {
        throw new DieuTourGuardError("Đoàn chưa có nhóm — không thể lưu điều tour");
      }

      // ══ GIAI ĐOẠN 2 — GHI. Từ đây trở đi, lỗi = DB có thể nửa vời → onError refetch. ══

      // Pre-check DNTT trước khi delete chi_phi linked với doan_ngay_item.
      // Nếu chi_phi có dntt_allocations → THROW error tiếng Việt cụ thể (DNTT id + tên cảnh điểm).
      // User phải hủy/giải phóng allocation trước khi xóa cảnh điểm khỏi tour.
      const deleteChiPhiByItemIdSafe = async (itemId: number) => {
        // MỘT item có thể có NHIỀU dòng chi phí (day-use khách sạn gắn vào cảnh điểm bọc:
        // "Day Use", "extra bed", "ăn sáng"… — có thật trên dữ liệu chạy, và có item
        // mang khoản đã trả không nhỏ). `.maybeSingle()` cũ trả `{data: null, error}` khi ≥2 dòng,
        // mà error bị BỎ QUA → `cpRow` null → return sớm → guard tiền KHÔNG chạy, và lệnh
        // xoá doan_ngay_item sau đó đụng FK `NO ACTION` rồi thất bại trong im lặng.
        const { data: cpRows, error: eCp } = await externalSupabase
          .from("doan_chi_phi")
          .select("id, mo_ta, so_tien_da_tt")
          .eq("ref_doan_ngay_item_id", itemId);
        if (eCp) throw eCp; // fail-safe: không đọc được thì KHÔNG xoá
        if (!cpRows || cpRows.length === 0) return;
        const cdName = cpRows[0].mo_ta || `cảnh điểm #${itemId}`;

        // Main + extras phát sinh ([dvps_<mainId>]) phải xóa CÙNG nhau. Extras có
        // ref_doan_ngay_item_id = NULL → KHÔNG khớp query theo itemId ở trên; nếu
        // chỉ xóa main, extras thành MỒ CÔI (vô hình trong app vì group theo id cha
        // đã mất, nhưng vẫn lòi ở bản in Excel + cộng nhầm vào tổng tiền).
        const mainIds = new Set(cpRows.map((r) => r.id));
        const { data: extraCandidates, error: eExtra } = await externalSupabase
          .from("doan_chi_phi")
          .select("id, mo_ta, so_tien_da_tt")
          .eq("doan_id", doanId)
          .like("mo_ta", "[dvps_%");
        if (eExtra) throw eExtra;
        const extraRows = (extraCandidates ?? []).filter((r) => {
          const parent = extraParentId(r.mo_ta);
          return parent != null && mainIds.has(parent);
        });

        // Pre-check DNTT + đã-trả cho CẢ main lẫn extras TRƯỚC khi xóa bất kỳ dòng nào.
        // (Backstop giai đoạn 1 đã kiểm cùng điều kiện; giữ đây làm lớp phòng thủ thứ hai
        //  cho race — ai đó tạo ĐNTT giữa lúc backstop chạy và lúc xoá.)
        for (const r of [...cpRows, ...extraRows]) {
          const rName = r.mo_ta || cdName;
          const activeDnttIds = await getActiveDnttIdsForChiPhi(r.id);
          if (activeDnttIds.length > 0) {
            const dnttIds = activeDnttIds.map((id) => `#${id}`).join(", ");
            throw new Error(
              `Không thể xóa "${rName}" — đã có ĐNTT (${dnttIds}). Hủy ĐNTT trước khi xóa khỏi tour.`
            );
          }
          // Đã trả tiền nhưng ĐNTT đã hủy (so_tien_da_tt > 0) → vẫn chặn xóa (mất dấu đã trả).
          if (Number(r.so_tien_da_tt ?? 0) > 0) {
            throw new Error(
              `Không thể xóa "${rName}" — đã thanh toán. Xử lý công nợ/hoàn tiền trước khi gỡ khỏi tour.`
            );
          }
        }
        const { error: eDel } = await externalSupabase
          .from("doan_chi_phi")
          .delete()
          .in("id", [...cpRows.map((r) => r.id), ...extraRows.map((r) => r.id)]);
        // Không nuốt: xoá hụt dòng chi phí → lệnh xoá doan_ngay_item ngay sau đó đụng FK
        // `NO ACTION` và cũng hỏng → tour "lưu xong" mà cảnh điểm vẫn còn nguyên.
        if (eDel) throw eDel;
      };

      // 1. Update doan fields
      const so_khach =
        (doanFields.so_khach_lon ?? 0) +
        (doanFields.so_khach_em1 ?? 0) +
        (doanFields.so_khach_em2 ?? 0) +
        (doanFields.so_khach_tl ?? 0);
      // Fetch old doan + existing doan_ngay/items để diff log (chỉ log UPDATE)
      const { data: oldDoan } = await externalSupabase
        .from("doan")
        .select("so_khach_lon, so_khach_em1, so_khach_em2, so_khach_tl, bang_don, truong_doan, chuyen_bay_don, chuyen_bay_tien, co_tinh_suat_tl_nha_hang, chu_thich_khach, tang_pham, ghi_chu_dieu_tour, thu_tip")
        .eq("id", doanId)
        .maybeSingle();

      await externalSupabase
        .from("doan")
        .update({ ...doanFields, so_khach })
        .eq("id", doanId);

      // defaultDoanNhomId đã resolve + guard non-null ở đầu mutationFn (trước backstop).
      const { data: existingNgayRows } = await externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, khach_san_id, ks_ma_code, ks_loai_phong, an_trua_nha_hang_id, an_toi_nha_hang_id, an_trua_set_menu_id, an_toi_set_menu_id, thanh_pho")
        .eq("doan_id", doanId)
        .eq("doan_nhom_id", defaultDoanNhomId);
      type ExistingNgayRow = NonNullable<typeof existingNgayRows>[number];
      const existingByNgaySo = new Map<number, ExistingNgayRow>(
        (existingNgayRows ?? []).map((r) => [r.ngay_so, r]),
      );

      const existingDoanNgayIds = (existingNgayRows ?? []).map((r) => r.id).filter(Boolean);
      const existingItemsByNgayId = new Map<number, number[]>();
      if (existingDoanNgayIds.length > 0) {
        const { data: existingItems } = await externalSupabase
          .from("doan_ngay_item")
          .select("doan_ngay_id, canh_diem_id")
          .in("doan_ngay_id", existingDoanNgayIds);
        for (const it of existingItems ?? []) {
          if (it.doan_ngay_id == null || it.canh_diem_id == null) continue;
          if (!existingItemsByNgayId.has(it.doan_ngay_id)) {
            existingItemsByNgayId.set(it.doan_ngay_id, []);
          }
          existingItemsByNgayId.get(it.doan_ngay_id)!.push(it.canh_diem_id);
        }
      }

      const ksNameMap = new Map(khachSanList.map((k) => [k.id, k.ten]));
      const nhNameMap = new Map(nhaHangList.map((n) => [n.id, n.ten]));
      const cdNameMap = new Map(canhDiemList.map((c) => [c.id, c.ten]));
      const labelKS = (id: number | null | undefined) =>
        id ? (ksNameMap.get(id) || `KS #${id}`) : "—";
      const labelNH = (id: number | null | undefined) =>
        id ? (nhNameMap.get(id) || `NH #${id}`) : "—";
      const labelCD = (id: number) => cdNameMap.get(id) || `cảnh điểm #${id}`;
      const labelTxt = (v: unknown) => String(v ?? "").trim() || "—";
      const dieuTourLogs: string[] = [];

      // Diff log doan fields (chỉ log nếu old doan tồn tại — tức UPDATE)
      if (oldDoan) {
        const oldDoanRec = oldDoan as Record<string, unknown>;
        const num = (v: unknown) => Number(v ?? 0);
        const oldTotal = num(oldDoanRec.so_khach_lon) + num(oldDoanRec.so_khach_em1)
                       + num(oldDoanRec.so_khach_em2) + num(oldDoanRec.so_khach_tl);
        if (oldTotal !== so_khach) {
          dieuTourLogs.push(`Đổi số khách ${oldTotal} → ${so_khach}`);
        }
        const strFields: Array<{ key: keyof SaveDieuTourPayload["doanFields"]; label: string }> = [
          { key: "bang_don", label: "bảng đơn" },
          { key: "truong_doan", label: "trưởng đoàn" },
          { key: "chuyen_bay_don", label: "chuyến bay đón" },
          { key: "chuyen_bay_tien", label: "chuyến bay tiễn" },
          { key: "chu_thich_khach", label: "chú thích khách" },
          { key: "ghi_chu_dieu_tour", label: "ghi chú điều tour" },
        ];
        for (const f of strFields) {
          const newV = doanFields[f.key];
          if (newV === undefined) continue;
          const oldV = oldDoanRec[f.key];
          if ((oldV ?? "") !== (newV ?? "")) {
            dieuTourLogs.push(`Đổi ${f.label} "${labelTxt(oldV)}" → "${labelTxt(newV)}"`);
          }
        }
        if (doanFields.co_tinh_suat_tl_nha_hang !== undefined
            && oldDoanRec.co_tinh_suat_tl_nha_hang !== doanFields.co_tinh_suat_tl_nha_hang) {
          dieuTourLogs.push(
            `${doanFields.co_tinh_suat_tl_nha_hang ? "Bật" : "Tắt"} tính suất TL nhà hàng`,
          );
        }
        if (doanFields.thu_tip !== undefined && oldDoanRec.thu_tip !== doanFields.thu_tip) {
          dieuTourLogs.push(`${doanFields.thu_tip ? "Bật" : "Tắt"} thu tip`);
        }
        if (doanFields.tang_pham !== undefined) {
          const oldArr = Array.isArray(oldDoanRec.tang_pham) ? oldDoanRec.tang_pham as string[] : [];
          const newArr = Array.isArray(doanFields.tang_pham) ? doanFields.tang_pham : [];
          const added = newArr.filter((x: string) => !oldArr.includes(x));
          const removed = oldArr.filter((x: string) => !newArr.includes(x));
          if (added.length > 0) dieuTourLogs.push(`Thêm tặng phẩm: ${added.join(", ")}`);
          if (removed.length > 0) dieuTourLogs.push(`Bỏ tặng phẩm: ${removed.join(", ")}`);
        }
      }

      // 2. Upsert doan_ngay — use upsert to handle both new and existing rows
      // defaultDoanNhomId đã resolve + guard non-null ở đầu hàm (~line 571)
      for (let idx = 0; idx < days.length; idx++) {
        const day = days[idx];
        const ngayPayload: TablesInsert<"doan_ngay"> = {
          doan_id: doanId,
          doan_nhom_id: defaultDoanNhomId,
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
          // Tìm existing row PER NHÓM — không filter doan_nhom_id sẽ trúng nhóm khác
          // và overwrite dữ liệu nhóm 1 khi user save nhóm 2.
          const { data: existingRow } = await externalSupabase
            .from("doan_ngay")
            .select("id")
            .eq("doan_id", doanId)
            .eq("ngay_so", day.ngay_so)
            .eq("doan_nhom_id", defaultDoanNhomId)
            .maybeSingle();

          if (existingRow) {
            doanNgayId = existingRow.id;
            await externalSupabase.from("doan_ngay").update(ngayPayload).eq("id", doanNgayId);
          } else {
            const { data } = await externalSupabase.from("doan_ngay").insert(ngayPayload).select("id").single();
            if (data) doanNgayId = data.id;
          }
        }

        // Diff log: chỉ log khi đã có row cũ (UPDATE), bỏ qua INSERT lần đầu
        const oldRow = existingByNgaySo.get(day.ngay_so);
        if (oldRow) {
          const label = `Ngày ${day.ngay_so}`;
          if ((oldRow.khach_san_id ?? null) !== (day.khach_san_id ?? null)) {
            dieuTourLogs.push(`${label}: khách sạn ${labelKS(oldRow.khach_san_id)} → ${labelKS(day.khach_san_id)}`);
          }
          if ((oldRow.ks_ma_code ?? "").trim() !== (day.ks_ma_code ?? "").trim()) {
            dieuTourLogs.push(`${label}: mã code phòng "${labelTxt(oldRow.ks_ma_code)}" → "${labelTxt(day.ks_ma_code)}"`);
          }
          if ((oldRow.ks_loai_phong ?? "").trim() !== (day.ks_loai_phong ?? "").trim()) {
            dieuTourLogs.push(`${label}: loại phòng "${labelTxt(oldRow.ks_loai_phong)}" → "${labelTxt(day.ks_loai_phong)}"`);
          }
          if ((oldRow.an_trua_nha_hang_id ?? null) !== (day.an_trua_nha_hang_id ?? null)) {
            dieuTourLogs.push(`${label}: nhà hàng trưa ${labelNH(oldRow.an_trua_nha_hang_id)} → ${labelNH(day.an_trua_nha_hang_id)}`);
          }
          if ((oldRow.an_toi_nha_hang_id ?? null) !== (day.an_toi_nha_hang_id ?? null)) {
            dieuTourLogs.push(`${label}: nhà hàng tối ${labelNH(oldRow.an_toi_nha_hang_id)} → ${labelNH(day.an_toi_nha_hang_id)}`);
          }
          if ((oldRow.thanh_pho ?? "").trim() !== (day.thanh_pho ?? "").trim()) {
            dieuTourLogs.push(`${label}: thành phố "${labelTxt(oldRow.thanh_pho)}" → "${labelTxt(day.thanh_pho)}"`);
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
          const idsToDelete = itemsToDelete.map((it) => it.id);
          // Delete referencing doan_chi_phi rows first — pre-check DNTT
          for (const itemId of idsToDelete) {
            await deleteChiPhiByItemIdSafe(itemId);
          }
          // Now safe to delete doan_ngay_item
          // Không nuốt lỗi: FK doan_chi_phi.ref_doan_ngay_item_id là NO ACTION — còn sót
          // dòng chi phí thì lệnh này hỏng, và tour "lưu xong" mà cảnh điểm vẫn còn.
          const { error: eDelItem } = await externalSupabase
            .from("doan_ngay_item").delete().in("id", idsToDelete);
          if (eDelItem) throw eDelItem;
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
            const { error: eDelAll } = await externalSupabase
              .from("doan_ngay_item").delete().eq("doan_ngay_id", doanNgayId);
            if (eDelAll) throw eDelAll;
          }
        }

        const insertedItems: Array<{
          id: number;
          canh_diem_id: number | null;
          co_phi: boolean | null;
          don_gia: number | null;
          so_luong: number | null;
          nguoi_thanh_toan: string | null;
        }> = [];

        if (validItems.length > 0) {
          // Snapshot rule: don_gia (giá cảnh điểm) chỉ snap KHI INSERT lần đầu;
          // master canh_diem.gia_mac_dinh đổi sau KHÔNG được overwrite.
          // → tách insert (snap master) vs update (giữ snapshot cũ).
          const { data: existingRows } = await externalSupabase
            .from("doan_ngay_item")
            .select("id, canh_diem_id, don_gia, co_phi, so_luong, nguoi_thanh_toan")
            .eq("doan_ngay_id", doanNgayId);
          type ExistingItemRow = NonNullable<typeof existingRows>[number];
          const existingMap = new Map<number | null, ExistingItemRow>(
            (existingRows || []).map((r) => [r.canh_diem_id, r]),
          );

          for (let idx = 0; idx < validItems.length; idx++) {
            const it = validItems[idx];
            const cd = canhDiemList.find((c) => c.id === it.canh_diem_id);
            const existing = existingMap.get(it.canh_diem_id);
            const commonFields: TablesUpdate<"doan_ngay_item"> = {
              thu_tu: idx + 1,
              co_phi: cd?.co_phi ?? false,
              so_luong: soKhach,
              nguoi_thanh_toan: cd?.nguoi_thanh_toan ?? null,
              ghi_chu: it.ghi_chu || null,
            };
            if (existing) {
              // UPDATE: KHÔNG đụng don_gia (snapshot lock per tour)
              const { data } = await externalSupabase
                .from("doan_ngay_item")
                .update(commonFields)
                .eq("id", existing.id)
                .select("id, canh_diem_id, co_phi, don_gia, so_luong, nguoi_thanh_toan")
                .single();
              if (data) insertedItems.push(data);
            } else {
              // INSERT: snap master canh_diem.gia_mac_dinh tại thời điểm tạo
              const { data } = await externalSupabase
                .from("doan_ngay_item")
                .insert({
                  doan_ngay_id: doanNgayId,
                  doan_id: doanId,
                  canh_diem_id: it.canh_diem_id,
                  don_gia: cd?.gia_mac_dinh ?? 0,
                  ...commonFields,
                })
                .select("id, canh_diem_id, co_phi, don_gia, so_luong, nguoi_thanh_toan")
                .single();
              if (data) insertedItems.push(data);
            }
          }
        }

        // Diff log cảnh điểm — chỉ log khi ngày đã tồn tại (UPDATE).
        // Ngày mới (INSERT lần đầu) bỏ qua để không spam log lúc tạo đoàn.
        const oldRowForItems = existingByNgaySo.get(day.ngay_so);
        if (oldRowForItems) {
          const oldCdIds = new Set(existingItemsByNgayId.get(oldRowForItems.id) ?? []);
          const newCdIds = new Set(validItems.map((it) => it.canh_diem_id));
          for (const cdId of newCdIds) {
            if (!oldCdIds.has(cdId)) {
              dieuTourLogs.push(`Ngày ${day.ngay_so}: thêm cảnh điểm "${labelCD(cdId)}"`);
            }
          }
          for (const cdId of oldCdIds) {
            if (!newCdIds.has(cdId)) {
              dieuTourLogs.push(`Ngày ${day.ngay_so}: xóa cảnh điểm "${labelCD(cdId)}"`);
            }
          }
        }

        // 4. Auto-generate doan_chi_phi for co_phi items
        // Day-use wrapper (canh_diem.khach_san_id != null): KHÔNG auto-tạo chi phí ở đây
        // — chi phí KS day-use được quản lý thủ công trong tab Chi phí (giống KS qua đêm)
        // để tránh overwrite don_gia/so_luong khi user save lại điều tour
        //
        // Approach A merge cross-nhóm: dedupe chi phí by (doan_id, danh_muc, ngay_so, mo_ta).
        // 2 nhóm cùng cảnh điểm cùng ngày → 1 chi phí row, so_luong = SUM khách cả 2 nhóm.
        if (insertedItems.length > 0) {
          // Pre-fetch all doan_ngay rows của đoàn ngày này (để aggregate so_luong cross-nhóm)
          const { data: allNgayThisDay } = await externalSupabase
            .from("doan_ngay")
            .select("id")
            .eq("doan_id", doanId)
            .eq("ngay_so", day.ngay_so);
          const allNgayIdsThisDay = (allNgayThisDay || []).map((r) => r.id);

          for (const item of insertedItems) {
            if (!item.co_phi) continue;
            if (item.canh_diem_id == null) continue;
            const canhDiemId: number = item.canh_diem_id;
            const cd = canhDiemList.find((c) => c.id === canhDiemId);
            if (cd?.khach_san_id) continue; // Day-use wrapper — managed in Chi phí section
            const moTa = cd?.ten ?? "";
            const newDonGia  = item.don_gia ?? 0;
            const isHdv      = item.nguoi_thanh_toan === "hdv";

            // Aggregate so_luong: sum doan_ngay_item.so_luong cross-nhóm cho same (canh_diem, ngày)
            const { data: itemsForCD } = await externalSupabase
              .from("doan_ngay_item")
              .select("so_luong")
              .eq("doan_id", doanId)
              .eq("canh_diem_id", canhDiemId)
              .in("doan_ngay_id", allNgayIdsThisDay.length > 0 ? allNgayIdsThisDay : [-1]);
            const newSoLuong = (itemsForCD || []).reduce(
              (s, it) => s + (it.so_luong ?? soKhach),
              0,
            ) || (item.so_luong ?? soKhach);

            // FOC dịch vụ: tien tính trên số khách SAU TRỪ FOC. Build pricing theo
            // foc (kh: insert dùng master canh_diem; update dùng snapshot đã lock).
            const buildDvPricing = (
              focKhach: number | null,
              focMien: number | null,
            ): TablesUpdate<"doan_chi_phi"> => {
              const billed = calcSoKhachThucTe(newSoLuong, focKhach, focMien);
              const total = newDonGia * billed;
              return {
                don_gia: newDonGia,
                so_luong: newSoLuong,
                tien_cong_ty: isHdv ? 0 : total,
                tien_hdv:     isHdv ? total : 0,
              };
            };

            const masterFields: TablesInsert<"doan_chi_phi"> = {
              doan_id: doanId,
              ngay_so: day.ngay_so,
              loai: "chi",
              danh_muc: "canh_diem",
              ref_doan_ngay_item_id: item.id,
              ref_doan_ngay_id: doanNgayId,
              mo_ta: moTa,
              nha_cung_cap_id: cd?.nha_cung_cap_id ?? null,
            };

            // Dedupe cross-nhóm: tìm existing theo (doan_id, danh_muc, ngay_so, mo_ta)
            // thay vì ref_doan_ngay_item_id (vì mỗi nhóm có item.id riêng).
            // Đọc foc snapshot để update tính lại tien đúng (snapshot LOCK per-tour).
            const cdCpCols =
              "id, so_luong, don_gia, is_overridden, foc_khach_snapshot, foc_mien_snapshot";
            const { data: existingByMoTa } = await externalSupabase
              .from("doan_chi_phi")
              .select(cdCpCols)
              .eq("doan_id", doanId)
              .eq("danh_muc", "canh_diem")
              .eq("ngay_so", day.ngay_so)
              .eq("mo_ta", moTa)
              .maybeSingle();
            // Fallback theo ref_doan_ngay_item_id (đúng cột UNIQUE) — bắt case ĐỔI TÊN
            // cảnh điểm: mo_ta đổi mà ref giữ → dedupe mo_ta trượt → nếu INSERT sẽ đụng
            // UNIQUE (...ref_doan_ngay_item_id). Lấy lại dòng cũ để UPDATE (set mo_ta mới).
            let existingByRef = null as typeof existingByMoTa;
            if (!existingByMoTa) {
              ({ data: existingByRef } = await externalSupabase
                .from("doan_chi_phi")
                .select(cdCpCols)
                .eq("doan_id", doanId)
                .eq("danh_muc", "canh_diem")
                .eq("ngay_so", day.ngay_so)
                .eq("ref_doan_ngay_item_id", item.id)
                .maybeSingle());
            }
            const existing = resolveCanhDiemChiPhiTarget(existingByMoTa, existingByRef);

            if (existing) {
              if (existing.is_overridden) {
                // OP override → giữ so_luong/don_gia hiện tại, chỉ update master metadata
                // (KHÔNG đổi ref_doan_ngay_item_id để giữ ref nhóm save đầu)
                const masterOnly = { ...masterFields };
                delete (masterOnly as Record<string, unknown>).ref_doan_ngay_item_id;
                delete (masterOnly as Record<string, unknown>).ref_doan_ngay_id;
                await externalSupabase.from("doan_chi_phi")
                  .update(masterOnly).eq("id", existing.id);
              } else {
                const soLuongChanged = Number(existing.so_luong) !== newSoLuong
                                    || Number(existing.don_gia)  !== newDonGia;
                // Master metadata (không touch ref). Tien tính lại theo FOC snapshot
                // ĐÃ LOCK trên row — KHÔNG đụng foc_*_snapshot (giữ per-tour).
                const masterOnly = { ...masterFields };
                delete (masterOnly as Record<string, unknown>).ref_doan_ngay_item_id;
                delete (masterOnly as Record<string, unknown>).ref_doan_ngay_id;
                const pricing = buildDvPricing(
                  existing.foc_khach_snapshot, existing.foc_mien_snapshot,
                );
                const updatePayload: TablesUpdate<"doan_chi_phi"> = { ...masterOnly, ...pricing };
                if (soLuongChanged) {
                  updatePayload.thanh_tien_thuc_te = null;
                  counters.thucTeClearCount++;
                }
                await externalSupabase.from("doan_chi_phi")
                  .update(updatePayload).eq("id", existing.id);
              }
            } else {
              // INSERT: snap FOC từ master canh_diem (lock per-tour) + tính tien theo FOC.
              const pricing = buildDvPricing(cd?.foc_khach ?? null, cd?.foc_mien ?? null);
              await externalSupabase.from("doan_chi_phi")
                .insert({
                  ...masterFields,
                  ...pricing,
                  foc_khach_snapshot: cd?.foc_khach ?? null,
                  foc_mien_snapshot:  cd?.foc_mien  ?? null,
                });
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
              const moTaMeal = mealItem
                ? `${mealItem.ten}${meal.label === "an_trua" ? " (trưa)" : meal.label === "an_toi" ? " (tối)" : ""}`
                : "";
              const alwaysFields: TablesInsert<"doan_chi_phi"> = {
                doan_id: doanId,
                ngay_so: day.ngay_so,
                loai: "chi",
                danh_muc: "nha_hang",
                ref_doan_ngay_id: doanNgayId,
                mo_ta: moTaMeal,
                nha_cung_cap_id: mealItem?.nha_cung_cap_id ?? null,
              };
              // initialFields: chỉ INSERT (lần đầu), KHÔNG update.
              // Snapshot FOC + chiết khấu master tại lúc cascade insert — lock per tour.
              const initialFields: TablesInsert<"doan_chi_phi"> = {
                loai: "chi",
                tien_cong_ty: 0,
                tien_hdv: 0,
                foc_khach_snapshot: mealItem?.foc_khach ?? null,
                foc_mien_snapshot:  mealItem?.foc_mien  ?? null,
                chiet_khau_phan_tram_snapshot: mealItem?.chiet_khau_phan_tram ?? null,
                // Cờ định kỳ của danh mục chỉ với tới được dòng ở ĐÂY: cascade chạy
                // trước khi tab Chi phí NH mở lần nào, nên seed trong lib/nh-dinh-ky
                // (chỉ áp cho bữa CHƯA có dòng) không bao giờ tới lượt. INSERT thôi —
                // UPDATE lật cờ sẽ hồi sinh định kỳ mà OP đã tắt tay ở đoàn cũ.
                thanh_toan_dinh_ky: cascadeInsertDinhKyNH(mealItem?.thanh_toan_dinh_ky_mac_dinh),
              };

              // Approach A merge cross-nhóm: dedupe chi phí by (doan_id, danh_muc, ngay_so, mo_ta).
              // Nếu 2 nhóm cùng NH-bữa-ngày → 1 chi phí row (ref_doan_ngay_id = nhóm save đầu).
              // 2 nhóm khác NH cùng bữa-ngày → 2 chi phí rows (mo_ta khác nhau).
              const { data: existingRows } = await externalSupabase
                .from("doan_chi_phi")
                .select("id")
                .eq("doan_id", doanId)
                .eq("danh_muc", "nha_hang")
                .eq("ngay_so", day.ngay_so)
                .eq("mo_ta", moTaMeal)
                .limit(1);
              const existing = existingRows?.[0];
              if (existing) {
                // UPDATE: chỉ master metadata, KHÔNG touch ref_doan_ngay_id
                // (giữ ref của nhóm save đầu — display purpose).
                const updateFields = {
                  doan_id: doanId,
                  ngay_so: day.ngay_so,
                  loai: "chi" as const,
                  danh_muc: "nha_hang",
                  mo_ta: moTaMeal,
                  nha_cung_cap_id: mealItem?.nha_cung_cap_id ?? null,
                };
                await externalSupabase.from("doan_chi_phi").update(updateFields).eq("id", existing.id);
              } else {
                await externalSupabase.from("doan_chi_phi").insert({ ...alwaysFields, ...initialFields });
              }
            }
          }
        }
      }

      // 5b. Dọn chi phí NH mồ côi sau đổi chương trình.
      // Cascade bước 5 chỉ insert/update theo (ngay_so, mo_ta) — NH đổi ngày / thay NH
      // khác / bỏ bữa thì dòng cũ kẹt lại vĩnh viễn (vô hình trên UI nhưng vẫn in ra
      // Excel → double). Đối chiếu với chương trình của MỌI nhóm (đoàn-nhóm merge chi
      // phí cross-nhóm), không chỉ nhóm đang lưu.
      {
        const { data: allNgayRows } = await externalSupabase
          .from("doan_ngay")
          .select("id, ngay_so, an_trua_nha_hang_id, an_toi_nha_hang_id")
          .eq("doan_id", doanId);
        const { keys: expectedNhKeys, hasUnknownNh } = buildExpectedNhKeys(
          allNgayRows ?? [],
          nhNameMap,
        );
        // NH trong chương trình không còn trong catalog → không build được key chuẩn,
        // mọi dòng của NH đó sẽ bị coi nhầm là mồ côi → bỏ qua cleanup cho an toàn.
        if (!hasUnknownNh) {
          const { data: nhCpRows } = await externalSupabase
            .from("doan_chi_phi")
            .select("id, ngay_so, mo_ta, ref_doan_ngay_id, so_tien_da_tt")
            .eq("doan_id", doanId)
            .eq("danh_muc", "nha_hang");
          // Dòng phát sinh của ô bữa đã bị bỏ trống: phải dọn CÙNG dòng chính.
          // Chúng mang cờ định kỳ + NCC của bữa (lib/dinh-ky-nhom.ts) nên nếu ở lại
          // sẽ tiếp tục nằm trong cụm NCC × tháng và được TRẢ TIỀN, trong khi tab
          // Chi phí không còn hiển thị chúng để OP phát hiện.
          const occupiedSlotIds = buildOccupiedMealSlotIds(allNgayRows ?? []);
          const orphans = [
            ...findOrphanNhChiPhi(nhCpRows ?? [], expectedNhKeys),
            ...findOrphanNhExtras(nhCpRows ?? [], occupiedSlotIds),
          ];
          for (const cp of orphans) {
            // Đã trả tiền (ĐNTT có thể đã hủy) → giữ lại, xóa là mất dấu tiền đã trả.
            if (Number(cp.so_tien_da_tt ?? 0) > 0) {
              counters.nhOrphanKept++;
              continue;
            }
            // Còn ĐNTT hiệu lực → giữ lại cho luồng điều chỉnh/công nợ, báo caller toast.
            const activeDnttIds = await getActiveDnttIdsForChiPhi(cp.id);
            if (activeDnttIds.length > 0) {
              counters.nhOrphanKept++;
              continue;
            }
            // Đang được voucher phủ → xóa sẽ mồ côi voucher_su_dung (FK SET NULL).
            const { data: voucherRefs } = await externalSupabase
              .from("voucher_su_dung")
              .select("id")
              .eq("chi_phi_id", cp.id)
              .limit(1);
            if (voucherRefs && voucherRefs.length > 0) {
              counters.nhOrphanKept++;
              continue;
            }
            await externalSupabase.from("doan_chi_phi").delete().eq("id", cp.id);
            counters.nhOrphanDeleted++;
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
          // NH thay đổi → xóa booking chưa gửi / đã hủy (không cam kết với NCC)
          if (existingBkNh.nha_hang_id !== nhId) {
            if (["chua_gui", "khong_dat"].includes(existingBkNh.booking_status)) {
              await externalSupabase.from("doan_booking_nh").delete().eq("id", existingBkNh.id);
            }
            continue;
          }
          // Cùng NH nhưng set_menu thay đổi → sync set_menu + snapshot fields +
          // mon_an_snapshot (LUÔN override từ catalog, kể cả khi đã gửi mail).
          // Source of truth là điều tour: user đổi set ở đây thì booking PHẢI
          // theo, kể cả user đã chỉnh món trong tab Booking NH trước đó. Nếu
          // đã gửi mail thì dirty badge tự hiện → user gửi lại nếu cần.
          if (setMenuId !== existingBkNh.set_menu_id) {
            const updates: TablesUpdate<"doan_booking_nh"> = { set_menu_id: setMenuId ?? null };
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
              const { data: mons } = await externalSupabase
                .from("nha_hang_set_menu_mon")
                .select("ten_mon")
                .eq("set_menu_id", setMenuId)
                .order("thu_tu", { ascending: true });
              updates.mon_an_snapshot = (mons ?? []).map((m) => m.ten_mon);
            } else {
              updates.ten_set_snapshot = null;
              updates.gia_snapshot = null;
              updates.don_vi_snapshot = null;
              updates.mon_an_snapshot = [];
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
        khachKsIds = new Set((ksCheck || []).filter((k) => k.nguoi_thanh_toan === "khach").map((k) => k.id));
      }

      const { data: allBookingKs } = await externalSupabase
        .from("doan_booking_ks")
        .select("id, khach_san_id, ks_dat_truoc_status, ks_final_status, trang_thai")
        .eq("doan_id", doanId);
      const distinctKsIdsFull = allKsIdsInDays.filter((id) => !khachKsIds.has(id));
      if (allBookingKs) {
        for (const bk of allBookingKs) {
          // Delete "chua_gui" bookings for KS removed from tour or now set to "khach" payer.
          // Booking da_huy (Tầng 2 lifecycle — hủy có phí, guard đổi KS set TRƯỚC khi save
          // chạy tới đây) là LỊCH SỬ TIỀN → không bao giờ xóa.
          const removedOrKhach = !distinctKsIdsFull.includes(bk.khach_san_id) || khachKsIds.has(bk.khach_san_id);
          if (removedOrKhach && bk.trang_thai !== "da_huy") {
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
          .select("id, ks_final_status, trang_thai")
          .eq("doan_id", doanId)
          .eq("khach_san_id", ksId)
          .maybeSingle();

        if (!existing) {
          // New booking row
          await externalSupabase.from("doan_booking_ks").insert({ doan_id: doanId, khach_san_id: ksId });
        } else if (existing.trang_thai === "da_huy") {
          // KS từng hủy nay quay lại tour → reactivate flow booking (giữ nguyên
          // phi_huy/ly_do_huy làm lịch sử; dải "Đã hủy" vẫn hiện cụm ks_huy cũ).
          await externalSupabase
            .from("doan_booking_ks")
            .update({ trang_thai: "active" })
            .eq("id", existing.id);
        } else if (existing.ks_final_status === "ks_xac_nhan_huy") {
          // Reset cancelled booking.
          //
          // CỐ Ý chỉ 'ks_xac_nhan_huy' (KS đã xác nhận hủy), KHÔNG gồm
          // 'cho_ks_xac_nhan_huy'. Nút "Hủy booking" (tab Booking KS) và mode
          // booking_only đặt trạng thái "chờ KS xác nhận hủy" trong khi KS VẪN còn
          // trong tour (trang_thai='active'). Nếu reset ở đây thì autosave Điều tour
          // kế tiếp sẽ NULL ks_dat_truoc/ks_final (mất snapshot phòng/đêm) và lật
          // ngược việc hủy — trong khi mail hủy đã gửi thật cho khách sạn.
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

      // Flush log thay đổi điều tour (chỉ những thay đổi thật sự, không log lần insert đầu)
      if (dieuTourLogs.length > 0) {
        const log = buildAuditLogger(user?.user_id, user?.ho_ten);
        for (const moTa of dieuTourLogs) {
          log({ doan_id: doanId, action: "sua", table_name: "doan_ngay", record_id: doanId, mo_ta: moTa });
        }
      }

      // Trả counters cho caller hiển thị toast warning
      return counters;
    },
    onSuccess: () => {
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
    },
  });
}

// ── Sync Điều tour → Booking DV ──
export interface SyncWarning {
  ncc: string;
  services: string[];
}

/**
 * Tên nhóm Booking DV = gom theo NHÀ CUNG CẤP.
 *   - Cảnh điểm có nha_cung_cap_id → dùng TÊN NCC (nccNameById).
 *   - Chưa gắn NCC → fallback TÊN DỊCH VỤ (mỗi dịch vụ 1 nhóm).
 * KHÔNG gom theo dia_diem nữa (trước đây gom theo địa điểm gây "Kính gửi Phú Quốc").
 * Dùng chung cho: sync, pre-save warning, checkCanhDiemDeletable → phải nhất quán.
 */
export function dvGroupName(
  cd: { nha_cung_cap_id: number | null; ten: string },
  nccNameById: Map<number, string>,
): string {
  const nccTen = cd.nha_cung_cap_id != null ? nccNameById.get(cd.nha_cung_cap_id) : undefined;
  return (nccTen && nccTen.trim()) || cd.ten;
}

/** Lấy map id→ten cho danh sách NCC id (lọc null/trùng). Rỗng → map rỗng. */
async function fetchNccNames(ids: (number | null | undefined)[]): Promise<Map<number, string>> {
  const uniq = [...new Set(ids.filter((x): x is number => x != null))];
  if (uniq.length === 0) return new Map();
  const { data } = await externalSupabase.from("nha_cung_cap").select("id, ten").in("id", uniq);
  return new Map((data ?? []).map((n) => [n.id, n.ten ?? ""]));
}

export async function syncDieuTourToBookingDV(params: {
  doanId: number;
  days: DayLocal[];
  canhDiemList: CanhDiemItem[];
  soKhach: number;
}): Promise<{ synced: number; warnings: SyncWarning[] }> {
  const { doanId, days, canhDiemList, soKhach } = params;

  // Danh mục CHƯA TẢI XONG thì DỪNG, không được coi là "đoàn không có dịch vụ".
  // Mọi item tra `canhDiemList` để biết loai/co_phi; danh mục rỗng → không item nào
  // khớp → rơi vào nhánh "không còn dịch vụ nào" bên dưới và XÓA SẠCH booking chua_dat
  // của đoàn. Một lần autosave chạy trước khi query ["canh_diem"] kịp về (mở lại trang,
  // refetch, mất mạng chớp nhoáng) là đủ để thổi bay dữ liệu booking — im lặng.
  if (canhDiemList.length === 0) {
    throw new Error(
      "Chưa tải xong danh mục cảnh điểm/dịch vụ — bỏ qua đồng bộ Booking DV lần này " +
      "để không xóa nhầm booking đã có. Lưu lại điều tour sau khi trang tải đủ.",
    );
  }

  // Collect co_phi + tag dich_vu items (KHÔNG phụ thuộc nguoi_thanh_toan —
  // HDV trả cash vẫn cần gửi mail booking với NCC để giữ chỗ).
  const coPhiItems: { cd: CanhDiemItem; ngay_date: string }[] = [];
  for (const day of days) {
    for (const item of day.items) {
      const cd = canhDiemList.find((c) => c.id === item.canh_diem_id);
      if (cd && cd.co_phi && cd.loai === "dich_vu") {
        coPhiItems.push({ cd, ngay_date: day.ngay_date });
      }
    }
  }

  if (coPhiItems.length === 0) {
    // Xóa tất cả booking DV chua_dat vì không còn dịch vụ nào
    const { data: existingAll, error: eSel } = await externalSupabase
      .from("doan_booking_dv")
      .select("id, booking_status")
      .eq("doan_id", doanId);
    if (eSel) throw eSel;

    if (existingAll) {
      for (const bk of existingAll) {
        if (bk.booking_status === "chua_dat") {
          const { error: eDel } = await externalSupabase
            .from("doan_booking_dv").delete().eq("id", bk.id);
          if (eDel) throw eDel;
        }
      }
    }
    return { synced: 0, warnings: [] };
  }

  // Gom theo NHÀ CUNG CẤP (fallback tên dịch vụ khi cảnh điểm chưa gắn NCC).
  const nccNameById = await fetchNccNames(coPhiItems.map(({ cd }) => cd.nha_cung_cap_id));
  const groups = new Map<
    string,
    { email: string | null; dichVu: { ten_dv: string; ngay_date: string; so_khach: number; don_gia: number }[] }
  >();
  for (const { cd, ngay_date } of coPhiItems) {
    const ncc = dvGroupName(cd, nccNameById);
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
    const { data: existing, error: eSel } = await externalSupabase
      .from("doan_booking_dv")
      .select("id, booking_status, dich_vu_list")
      .eq("doan_id", doanId)
      .eq("ten_nha_cung_cap", ncc)
      .maybeSingle();
    // KHÔNG nuốt lỗi: đọc hụt ở đây làm code tưởng "chưa có dòng nào" rồi insert đè /
    // hoặc bỏ qua, mà caller thì không biết gì.
    if (eSel) throw eSel;

    if (!existing || existing.booking_status === "chua_dat") {
      if (existing) {
        if (dichVu.length === 0) {
          // Xóa luôn dòng booking DV nếu không còn dịch vụ nào
          const { error } = await externalSupabase
            .from("doan_booking_dv").delete().eq("id", existing.id);
          if (error) throw error;
        } else {
          // Cập nhật lại danh sách dịch vụ
          const { error } = await externalSupabase
            .from("doan_booking_dv")
            .update({ dich_vu_list: dichVu, email_nha_cung_cap: email })
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else if (dichVu.length > 0) {
        // Chỉ insert nếu có dịch vụ.
        // Ghi hụt ở ĐÂY chính là ca "tab Booking DV trống trơn mà không ai hay":
        // trước đây lỗi bị bỏ qua và `synced` vẫn cộng lên, nên caller báo thành công.
        const { error } = await externalSupabase.from("doan_booking_dv").insert({
          doan_id: doanId,
          ten_nha_cung_cap: ncc,
          email_nha_cung_cap: email,
          dich_vu_list: dichVu,
          booking_status: "chua_dat",
        });
        if (error) throw error;
      }
      synced += dichVu.length;
    } else if (["cho_xac_nhan", "da_xac_nhan"].includes(existing.booking_status)) {
      // Sent booking: update dich_vu_list để booking phản ánh "current plan".
      // mail_content_hash giữ snapshot mail đã gửi → dirty badge tự hiện nếu khác.
      const oldList = Array.isArray(existing.dich_vu_list) ? existing.dich_vu_list : [];
      const oldKeys = new Set(
        oldList.map((d) => {
          const dv = d as { ten_dv?: string; ngay_date?: string };
          return `${dv.ten_dv}|${dv.ngay_date}`;
        }),
      );
      const newKeys = new Set(dichVu.map((d) => `${d.ten_dv}|${d.ngay_date}`));
      const hasChange =
        oldKeys.size !== newKeys.size ||
        [...oldKeys].some((k) => !newKeys.has(k)) ||
        [...newKeys].some((k) => !oldKeys.has(k));
      if (hasChange) {
        const { error } = await externalSupabase
          .from("doan_booking_dv")
          .update({ dich_vu_list: dichVu, email_nha_cung_cap: email })
          .eq("id", existing.id);
        if (error) throw error;
      }

      if (hasChange) {
        warnings.push({ ncc, services: dichVu.map((d) => d.ten_dv) });
      }
    }
    // da_huy: skip silently
  }

  // Cleanup: xóa các booking chua_dat không còn trong điều tour hiện tại
  const { data: allExisting, error: eAll } = await externalSupabase
    .from("doan_booking_dv")
    .select("id, ten_nha_cung_cap, booking_status")
    .eq("doan_id", doanId);
  if (eAll) throw eAll;

  if (allExisting) {
    for (const bk of allExisting) {
      if (bk.booking_status === "chua_dat" && !groups.has(bk.ten_nha_cung_cap)) {
        const { error } = await externalSupabase
          .from("doan_booking_dv").delete().eq("id", bk.id);
        if (error) throw error;
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

  // NCC name map cho khóa Booking DV (gom theo NCC, đồng bộ dvGroupName trong sync).
  const dvNccNameById = await fetchNccNames(
    canhDiemList.filter((c) => c.loai === "dich_vu").map((c) => c.nha_cung_cap_id),
  );

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
        if (!cd || !cd.co_phi || cd.loai !== "dich_vu") continue;

        const ncc = dvGroupName(cd, dvNccNameById);
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
