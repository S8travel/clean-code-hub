import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { externalSupabase } from "@/lib/supabase-external";
import { recalcChiPhiStatus, type DNTTRow as DNTTRowFromHook } from "@/hooks/use-dntt";
import { useAuth } from "@/hooks/use-auth";
import { useChiPhiLockGuard } from "@/hooks/use-chi-phi-lock";
import { buildAuditLogger } from "@/hooks/use-activity-log";
import { buildChiPhiChangeList } from "@/lib/chi-phi-diff";
import { markChiPhiSavedLocally } from "@/lib/chi-phi-sync-bus";
import { errMsg } from "@/lib/error";
import type { Tables, TablesInsert, TablesUpdate } from "@/lib/database.types";

export type DNTTRow = DNTTRowFromHook;

const DANH_MUC_LABEL: Record<string, string> = {
  nha_hang: "nhà hàng",
  khach_san: "khách sạn",
  hdv: "HDV",
  xe: "xe",
  ve_may_bay: "vé máy bay",
  phi_visa: "phí visa",
  tham_quan: "tham quan",
  mua_sam: "mua sắm",
  dich_vu: "dịch vụ",
  khac: "khác",
};

function fmtVND(n: number) {
  return n.toLocaleString("vi-VN") + " VND";
}

export interface ChiPhiRow {
  id: number;
  doan_id: number;
  ngay_so: number | null;
  loai: string;
  danh_muc: string;
  ref_doan_ngay_item_id: number | null;
  ref_doan_ngay_id: number | null;
  mo_ta: string | null;
  don_gia: number;
  so_luong: number;
  thanh_tien: number;
  trang_thai_thanh_toan: string;
  ngay_thanh_toan: string | null;
  created_at: string;
  tien_cong_ty: number;
  tien_hdv: number;
  nha_cung_cap_id: number | null;
  trang_thai_dntt: string;
  de_nghi_tt_id: number | null;
  so_tien_da_dntt: number;
  so_tien_da_tt: number;
  thanh_tien_thuc_te: number | null;
  thanh_toan_dinh_ky: boolean;
  // FOC snapshot — chốt config FOC tại thời điểm save để master changes không
  // thay đổi tính toán cho đoàn cũ. Editable per-tour qua UI ở ChiPhi sections.
  foc_khach_snapshot: number | null;
  foc_mien_snapshot: number | null;
  // Chiết khấu NH snapshot — lock per-tour tương tự FOC.
  chiet_khau_phan_tram_snapshot: number | null;
  // KS chi phí: phân biệt loại row để tính FOC riêng.
  // 'phong' (mặc định) | 'dich_vu_an' | 'dich_vu_ve' | 'dich_vu_khac' | null (non-KS).
  loai_row: string | null;
  // FOC count per-row, OP tự nhập cho service KS rows (manual).
  // Rooms KS không dùng (vẫn pro-rata per-day qua foc_*_snapshot).
  foc_count: number;
  // HYBRID flag: true = OP đã override SL/đơn giá thủ công ở Chi phí section
  // → cascade từ Điều tour bỏ qua row này. Reset = set false.
  is_overridden: boolean;
  // Visa: ngoại tệ + tỷ giá + chiết khấu (nhập tay). don_gia / tien_cong_ty
  // trong DB lưu giá trị VND đã quy đổi để consistent với section khác.
  // don_gia_raw lưu giá trị raw (USD/RMB/NT) — source of truth cho UI edit.
  tien_te_loai: string | null;     // 'USD' | 'RMB' | 'NT' | null
  ty_gia: number | null;
  chiet_khau_pct: number | null;
  don_gia_raw: number | null;
  // VAT % (xe). NULL=không VAT. don_gia = round(don_gia_raw*(1+vat_pct/100)).
  vat_pct: number | null;
  // Trạng thái hóa đơn cho dòng HDV trả (không có ĐNTT). NULL=chua_co.
  trang_thai_hoa_don: string | null;
}

// NCC rút gọn (chỉ field cần để hiển thị thông tin chuyển khoản).
type NccLite = Pick<Tables<"nha_cung_cap">, "id" | "ten" | "so_tai_khoan" | "ngan_hang">;

// KS data dùng trong ChiPhiKSSection — ks fields đã select + thông tin NCC join.
// ten coerce về string (đoàn luôn gắn KS có tên) để consumer không phải xử lý null.
type KhachSanWithNcc = Pick<
  Tables<"khach_san">,
  "id" | "foc_khach" | "foc_mien" | "dia_diem"
  | "nha_cung_cap_id" | "nguoi_thanh_toan" | "tai_khoan_thanh_toan"
> & {
  ten: string;
  ten_ncc: string | null;
  ncc_so_tai_khoan: string | null;
  ncc_ngan_hang: string | null;
};

// NH data dùng trong ChiPhiNHSection — nh fields đã select + thông tin NCC join.
type NhaHangWithNcc = Pick<
  Tables<"nha_hang">,
  "id" | "ten" | "dia_chi" | "nha_cung_cap_id" | "chiet_khau_phan_tram" | "nguoi_thanh_toan"
> & {
  ten_ncc: string | null;
  ncc_so_tai_khoan: string | null;
  ncc_ngan_hang: string | null;
};

interface NHMeal {
  doan_ngay_id: number;
  ngay_date: string | null;
  bua_an: "trua" | "toi";
  nha_hang_id: number;
}

interface NHBookingLite {
  doan_ngay_id: number | null;
  bua_an: string | null;
  ten_set_snapshot: string | null;
  gia_snapshot: number | null;
}

// ── Queries ──

/**
 * List chi phí của đoàn, filter optional theo nhóm.
 *
 * Rule filter:
 * - Chi phí có `ref_doan_ngay_id` (NH, DV extras `[dvps_]`/`[trua]`/`[toi]`):
 *   thuộc nhóm theo doan_ngay.doan_nhom_id
 * - Chi phí có `ref_doan_ngay_item_id` (cảnh điểm): thuộc nhóm theo
 *   doan_ngay_item → doan_ngay → doan_nhom_id
 * - Chi phí KHÔNG có ref (KS, Visa, Xe, Bảo hiểm, HDV): đoàn-level →
 *   SHARE giữa các nhóm (hiển thị cho mọi tab nhóm)
 */
export function useChiPhiList(doanId?: number, doanNhomId?: number | null) {
  return useQuery({
    queryKey: ["doan_chi_phi", doanId, doanNhomId ?? null],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("doan_chi_phi")
        .select("*")
        .eq("doan_id", doanId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as ChiPhiRow[];
      if (doanNhomId == null) return rows;

      // Fetch mapping doan_ngay.id → doan_nhom_id
      const { data: ngayRows } = await externalSupabase
        .from("doan_ngay")
        .select("id, doan_nhom_id")
        .eq("doan_id", doanId!);
      const ngayToNhom = new Map<number, number>();
      (ngayRows ?? []).forEach((r) => {
        if (r.doan_nhom_id != null) ngayToNhom.set(r.id, r.doan_nhom_id);
      });

      // Fetch mapping doan_ngay_item.id → doan_ngay_id (để chain → nhóm)
      const { data: itemRows } = await externalSupabase
        .from("doan_ngay_item")
        .select("id, doan_ngay_id")
        .eq("doan_id", doanId!);
      const itemToNgay = new Map<number, number>();
      (itemRows ?? []).forEach((r) => {
        if (r.doan_ngay_id != null) itemToNgay.set(r.id, r.doan_ngay_id);
      });

      return rows.filter((cp) => {
        // Chi phí có ref_doan_ngay_id (NH chính, extras NH/DV)
        if (cp.ref_doan_ngay_id != null) {
          return ngayToNhom.get(cp.ref_doan_ngay_id) === doanNhomId;
        }
        // Chi phí có ref_doan_ngay_item_id (cảnh điểm)
        if (cp.ref_doan_ngay_item_id != null) {
          const ngayId = itemToNgay.get(cp.ref_doan_ngay_item_id);
          return ngayId != null && ngayToNhom.get(ngayId) === doanNhomId;
        }
        // Không có ref → đoàn-level (KS, Visa, Xe, Bảo hiểm, HDV) → share mọi nhóm
        return true;
      });
    },
  });
}

export function useDNTTList(doanId?: number) {
  return useQuery({
    queryKey: ["de_nghi_thanh_toan", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("dntt_with_payment_status")
        .select("*")
        .eq("doan_id", doanId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DNTTRow[];
    },
  });
}

// KS data from doan_ngay + khach_san + nha_cung_cap
// Also includes KS referenced in DNTT records (even if removed from tour schedule)
// Bổ sung: KS day-use qua wrapper canh_diem.khach_san_id (lấy từ doan_ngay_item)
export function useChiPhiKSData(doanId?: number, doanNhomId?: number | null) {
  return useQuery({
    queryKey: ["chi_phi_ks_data", doanId, doanNhomId ?? null],
    enabled: !!doanId,
    queryFn: async () => {
      let ngayQuery = externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date, khach_san_id, ks_ma_code, ks_loai_phong")
        .eq("doan_id", doanId!)
        .not("khach_san_id", "is", null)
        .order("ngay_date", { ascending: true });
      if (doanNhomId != null) ngayQuery = ngayQuery.eq("doan_nhom_id", doanNhomId);
      const { data: rawNgayRows, error: e1 } = await ngayQuery;
      if (e1) throw e1;

      // Dedup khi 2 nhóm cùng KS cùng ngày → 1 row hiển thị (gộp).
      // Giữ doan_ngay_id thấp nhất (nhóm save trước). Khi khác KS cùng ngày
      // → key (khach_san_id, ngay_date) khác → KHÔNG gộp.
      const ksDedupMap = new Map<string, NonNullable<typeof rawNgayRows>[number]>();
      const sortedKsRaw = [...(rawNgayRows ?? [])].sort((a, b) => a.id - b.id);
      for (const r of sortedKsRaw) {
        if (r.khach_san_id == null) continue;
        const k = `${r.khach_san_id}_${r.ngay_date}`;
        if (!ksDedupMap.has(k)) ksDedupMap.set(k, r);
      }
      const ngayRows = [...ksDedupMap.values()].sort(
        (a, b) => (a.ngay_date ?? "").localeCompare(b.ngay_date ?? ""),
      );

      // Also collect KS ids from DNTT records (hoan_tien/cong_no may reference removed KS)
      const { data: dnttRows } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .select("ref_id")
        .eq("doan_id", doanId!)
        .eq("ref_loai", "khach_san")
        .not("ref_id", "is", null);

      // Day-use KS: doan_ngay_item links đến canh_diem có khach_san_id
      const { data: itemsWithCanhDiem } = await externalSupabase
        .from("doan_ngay_item")
        .select("id, doan_ngay_id, canh_diem_id, don_gia, so_luong, canh_diem:canh_diem_id (id, ten, khach_san_id)")
        .eq("doan_id", doanId!);
      const dayUseItems = (itemsWithCanhDiem || []).filter(
        (it) => it.canh_diem?.khach_san_id != null,
      );
      // Build map ngày từ doan_ngay (kể cả ngày không có khach_san_id) để tra ngay_date cho item
      const { data: allNgayRows } = await externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date")
        .eq("doan_id", doanId!);
      // ngay_date trong DB là string | null nhưng đoàn_ngày luôn có ngày → assert.
      const ngayInfoById: Record<number, { ngay_so: number; ngay_date: string }> = {};
      (allNgayRows || []).forEach((n) => {
        ngayInfoById[n.id] = { ngay_so: n.ngay_so, ngay_date: n.ngay_date! };
      });
      // Map item_id → { khach_san_id, ngay_so, ngay_date, doan_ngay_id }
      const dayUseItemMap: Record<number, { khach_san_id: number; ngay_so: number; ngay_date: string; doan_ngay_id: number; don_gia: number; so_luong: number; canh_diem_ten: string }> = {};
      const ksIdsFromDayUse = new Set<number>();
      dayUseItems.forEach((it) => {
        const doanNgayId = it.doan_ngay_id;
        if (doanNgayId == null) return;
        const ng = ngayInfoById[doanNgayId];
        if (!ng) return;
        const ksId = it.canh_diem?.khach_san_id;
        if (ksId == null) return;
        ksIdsFromDayUse.add(ksId);
        dayUseItemMap[it.id] = {
          khach_san_id: ksId,
          ngay_so: ng.ngay_so,
          ngay_date: ng.ngay_date,
          doan_ngay_id: doanNgayId,
          don_gia: it.don_gia ?? 0,
          so_luong: it.so_luong ?? 0,
          canh_diem_ten: it.canh_diem?.ten ?? "",
        };
      });

      const ksIdsFromNgay = new Set(
        (ngayRows || []).map((r) => r.khach_san_id).filter((x): x is number => x != null),
      );
      const ksIdsFromDntt = new Set(
        (dnttRows || []).map((r) => r.ref_id).filter((x): x is number => x != null),
      );
      const allKsIds = [...new Set([...ksIdsFromNgay, ...ksIdsFromDntt, ...ksIdsFromDayUse])];
      // Track which KS ids are "orphaned" (in DNTT but no longer in tour schedule + not day-use)
      const orphanedKsIds = [...ksIdsFromDntt].filter((id) => !ksIdsFromNgay.has(id) && !ksIdsFromDayUse.has(id));

      if (allKsIds.length === 0) return { ngayRows: [], khachSanMap: {}, orphanedKsIds: [], dayUseItemMap: {}, dayUseKsIds: [] };

      const { data: ksList, error: e2 } = await externalSupabase
        .from("khach_san")
        .select("id, ten, foc_khach, foc_mien, dia_diem, nha_cung_cap_id, nguoi_thanh_toan, tai_khoan_thanh_toan")
        .in("id", allKsIds);
      if (e2) throw e2;

      const nccIds = [
        ...new Set(
          (ksList || [])
            .map((k) => k.nha_cung_cap_id)
            .filter((x): x is number => x != null),
        ),
      ];
      const nccMap: Record<number, NccLite> = {};
      if (nccIds.length > 0) {
        const { data: nccList } = await externalSupabase
          .from("nha_cung_cap")
          .select("id, ten, so_tai_khoan, ngan_hang")
          .in("id", nccIds);
        (nccList || []).forEach((n) => {
          nccMap[n.id] = n;
        });
      }

      const khachSanMap: Record<number, KhachSanWithNcc> = {};
      (ksList || []).forEach((ks) => {
        const ncc = ks.nha_cung_cap_id ? nccMap[ks.nha_cung_cap_id] : null;
        khachSanMap[ks.id] = {
          ...ks,
          ten: ks.ten ?? "",
          ten_ncc: ncc?.ten || null,
          ncc_so_tai_khoan: ncc?.so_tai_khoan || null,
          ncc_ngan_hang: ncc?.ngan_hang || null,
        };
      });

      const filteredNgayRows = (ngayRows || []).filter(
        (r) => r.khach_san_id != null && khachSanMap[r.khach_san_id]?.nguoi_thanh_toan !== "khach"
      );
      // Filter dayUseItemMap: bỏ các item mà KS có nguoi_thanh_toan='khach'
      const filteredDayUseItemMap: typeof dayUseItemMap = {};
      Object.entries(dayUseItemMap).forEach(([itemId, info]) => {
        if (khachSanMap[info.khach_san_id]?.nguoi_thanh_toan !== "khach") {
          filteredDayUseItemMap[Number(itemId)] = info;
        }
      });
      const filteredDayUseKsIds = [...ksIdsFromDayUse].filter(
        (id) => khachSanMap[id]?.nguoi_thanh_toan !== "khach"
      );
      return {
        ngayRows: filteredNgayRows,
        khachSanMap,
        orphanedKsIds,
        dayUseItemMap: filteredDayUseItemMap,
        dayUseKsIds: filteredDayUseKsIds,
      };
    },
  });
}

// NH data from doan_ngay
export function useChiPhiNHData(doanId?: number) {
  return useQuery({
    queryKey: ["chi_phi_nh_data", doanId],
    enabled: !!doanId,
    queryFn: async () => {
      const { data: ngayRows, error: e1 } = await externalSupabase
        .from("doan_ngay")
        .select("id, ngay_so, ngay_date, an_trua_nha_hang_id, an_toi_nha_hang_id")
        .eq("doan_id", doanId!)
        .order("ngay_date", { ascending: true });
      if (e1) throw e1;

      const nhIds = new Set<number>();
      (ngayRows || []).forEach((r) => {
        if (r.an_trua_nha_hang_id) nhIds.add(r.an_trua_nha_hang_id);
        if (r.an_toi_nha_hang_id) nhIds.add(r.an_toi_nha_hang_id);
      });
      if (nhIds.size === 0) return { meals: [], nhaHangMap: {} };

      const { data: nhList, error: e2 } = await externalSupabase
        .from("nha_hang")
        .select("id, ten, dia_chi, nha_cung_cap_id, chiet_khau_phan_tram, nguoi_thanh_toan")
        .in("id", [...nhIds]);
      if (e2) throw e2;

      const nccNhIds = [
        ...new Set(
          (nhList || [])
            .map((n) => n.nha_cung_cap_id)
            .filter((x): x is number => x != null),
        ),
      ];
      const nccNhMap: Record<number, NccLite> = {};
      if (nccNhIds.length > 0) {
        const { data: nccList } = await externalSupabase
          .from("nha_cung_cap")
          .select("id, ten, so_tai_khoan, ngan_hang")
          .in("id", nccNhIds);
        (nccList || []).forEach((n) => { nccNhMap[n.id] = n; });
      }

      const nhaHangMap: Record<number, NhaHangWithNcc> = {};
      (nhList || []).forEach((nh) => {
        const ncc = nh.nha_cung_cap_id ? nccNhMap[nh.nha_cung_cap_id] : null;
        nhaHangMap[nh.id] = {
          ...nh,
          ten_ncc: ncc?.ten ?? null,
          ncc_so_tai_khoan: ncc?.so_tai_khoan ?? null,
          ncc_ngan_hang: ncc?.ngan_hang ?? null,
        };
      });

      const meals: NHMeal[] = [];
      (ngayRows || []).forEach((r) => {
        if (r.an_trua_nha_hang_id) {
          meals.push({
            doan_ngay_id: r.id,
            ngay_date: r.ngay_date,
            bua_an: "trua",
            nha_hang_id: r.an_trua_nha_hang_id,
          });
        }
        if (r.an_toi_nha_hang_id) {
          meals.push({ doan_ngay_id: r.id, ngay_date: r.ngay_date, bua_an: "toi", nha_hang_id: r.an_toi_nha_hang_id });
        }
      });

      const { data: bookings } = await externalSupabase
        .from("doan_booking_nh")
        .select("doan_ngay_id, bua_an, ten_set_snapshot, gia_snapshot")
        .eq("doan_id", doanId!);

      const bookingMap: Record<string, NHBookingLite> = {};
      (bookings || []).forEach((b) => {
        bookingMap[`${b.doan_ngay_id}_${b.bua_an}`] = b;
      });

      return { meals, nhaHangMap, bookingMap };
    },
  });
}

// ── Mutations ──

// HYBRID adjust: update chi_phi state ONLY (so_luong, don_gia, tien_*, thanh_tien_thuc_te,
// is_overridden=true). KHÔNG tạo cong_no/DNTT — defer to aggregate commit button.
// Caller pass new SL + đơn giá; hook tự compute tien_cong_ty/hdv theo isHdv hiện tại.
export function useUpdateChiPhiActual() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const lockGuard = useChiPhiLockGuard();
  return useMutation({
    mutationFn: async (args: {
      id: number;
      doan_id: number;
      so_luong: number;
      don_gia: number;
      ly_do?: string;
      // Override total cho NH (FOC + chiết khấu khiến SL × đơn_giá ≠ tổng).
      // DV không truyền → fallback newTotal = so_luong * don_gia.
      total_override?: number;
    }) => {
      lockGuard(args.doan_id); // đoàn đã quyết toán → chặn (trừ admin)
      const newTotal = args.total_override ?? args.so_luong * args.don_gia;
      // Detect isHdv từ row hiện tại
      const { data: cur } = await externalSupabase
        .from("doan_chi_phi")
        .select("tien_hdv")
        .eq("id", args.id)
        .single();
      const isHdv = Number(cur?.tien_hdv ?? 0) > 0;
      const { data, error } = await externalSupabase
        .from("doan_chi_phi")
        .update({
          so_luong: args.so_luong,
          don_gia:  args.don_gia,
          tien_cong_ty: isHdv ? 0 : newTotal,
          tien_hdv:     isHdv ? newTotal : 0,
          thanh_tien_thuc_te: newTotal,
          is_overridden: true,
        })
        .eq("id", args.id)
        .select("id, doan_id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, vars) => {
      markChiPhiSavedLocally(vars.doan_id);
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", vars.doan_id] });
      const log = buildAuditLogger(user?.user_id, user?.ho_ten);
      log({
        doan_id: vars.doan_id,
        action: "sua",
        table_name: "doan_chi_phi",
        record_id: data?.id,
        mo_ta: `Điều chỉnh thực tế: SL=${vars.so_luong}, đơn giá=${fmtVND(vars.don_gia)}${vars.ly_do ? ` (${vars.ly_do})` : ""}`,
      });
    },
  });
}

export function useUpsertChiPhi() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const lockGuard = useChiPhiLockGuard();
  return useMutation({
    mutationFn: async (payload: Partial<ChiPhiRow> & { doan_id: number }) => {
      lockGuard(payload.doan_id); // đoàn đã quyết toán → chặn (trừ admin)
      // thanh_tien là generated column — loại trước khi insert/update.
      const { thanh_tien, ...clean } = payload;
      void thanh_tien;
      if (clean.id) {
        const { id, ...rest } = clean;
        // Snapshot giá trị cũ TRƯỚC update để audit log dựng "cũ → mới".
        const { data: oldRow } = await externalSupabase
          .from("doan_chi_phi")
          .select("so_luong, don_gia, tien_cong_ty, tien_hdv, foc_count, thanh_tien_thuc_te")
          .eq("id", id)
          .maybeSingle();
        const { data, error } = await externalSupabase
          .from("doan_chi_phi")
          .update(rest as TablesUpdate<"doan_chi_phi">)
          .eq("id", id)
          .select("id")
          .single();
        if (error) throw error;
        return { id: data.id, old: oldRow ?? null };
      } else {
        const { data, error } = await externalSupabase
          .from("doan_chi_phi")
          .insert(clean as unknown as TablesInsert<"doan_chi_phi">)
          .select("id")
          .single();
        if (error) throw error;
        return { id: data.id, old: null };
      }
    },
    onSuccess: (data, variables) => {
      markChiPhiSavedLocally(variables.doan_id);
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", variables.doan_id] });
      const log = buildAuditLogger(user?.user_id, user?.ho_ten);
      const isNew = !variables.id;
      const dm = DANH_MUC_LABEL[variables.danh_muc ?? ""] ?? (variables.danh_muc ?? "");
      const tien = (variables.tien_cong_ty ?? 0) + (variables.tien_hdv ?? 0);
      const changes = buildChiPhiChangeList(data?.old, variables);
      const moTa = isNew
        ? `Thêm chi phí ${dm}${variables.mo_ta ? ": " + variables.mo_ta : ""} — ${fmtVND(tien)}`
        : `Cập nhật chi phí ${dm}${variables.mo_ta ? ": " + variables.mo_ta : ""}` +
          (changes.length ? ` (${changes.join(", ")})` : "");
      log({ doan_id: variables.doan_id, action: isNew ? "tao" : "sua", table_name: "doan_chi_phi", record_id: data?.id, mo_ta: moTa });
    },
  });
}

export function useDeleteChiPhi() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const lockGuard = useChiPhiLockGuard();
  return useMutation({
    mutationFn: async ({ id, doanId, mo_ta, danh_muc }: { id: number; doanId: number; mo_ta?: string | null; danh_muc?: string | null }) => {
      lockGuard(doanId); // đoàn đã quyết toán → chặn (trừ admin)
      // GUARD: chặn xóa chi phí đang nằm trong ĐNTT chưa hủy.
      // dntt_allocations.chi_phi_id FK = ON DELETE CASCADE → xóa chi phí sẽ xóa
      // luôn allocation (kể cả của ĐNTT cọc đã thanh toán) → mất dấu phần đã
      // cọc/đã trả → ĐNTT khoản còn lại tính sai (trả dư/thiếu).
      // User PHẢI dùng "Điều chỉnh" sửa SL/đơn giá về 0 thay vì xóa.
      // ĐNTT đã hủy (da_huy) không chặn — flow auto-xóa chi phí orphan sau khi
      // hủy ĐNTT vẫn chạy được.
      const { data: allocs, error: allocErr } = await externalSupabase
        .from("dntt_allocations")
        .select("dntt_id")
        .eq("chi_phi_id", id);
      if (allocErr) throw allocErr;
      const dnttIds = [...new Set((allocs ?? []).map((a) => a.dntt_id))];
      if (dnttIds.length > 0) {
        const { data: actives, error: dnttErr } = await externalSupabase
          .from("de_nghi_thanh_toan")
          .select("id")
          .in("id", dnttIds)
          .neq("trang_thai_duyet", "da_huy");
        if (dnttErr) throw dnttErr;
        if (actives && actives.length > 0) {
          const ids = actives.map((d) => d.id).sort((a, b) => a - b);
          throw new Error(
            `Chi phí này đang nằm trong ĐNTT #${ids.join(", #")} — không thể xóa. ` +
            `Hãy dùng nút "Điều chỉnh" sửa số lượng/đơn giá về 0 thay vì xóa ` +
            `(xóa sẽ làm mất dấu phần đã cọc/đã thanh toán, khiến ĐNTT sau tính sai).`,
          );
        }
      }

      const { error } = await externalSupabase.from("doan_chi_phi").delete().eq("id", id);
      if (error) throw error;
      return { doanId, id, mo_ta, danh_muc };
    },
    onSuccess: ({ doanId, id, mo_ta, danh_muc }) => {
      markChiPhiSavedLocally(doanId);
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      const log = buildAuditLogger(user?.user_id, user?.ho_ten);
      const dm = DANH_MUC_LABEL[danh_muc ?? ""] ?? (danh_muc ?? "");
      log({ doan_id: doanId, action: "xoa", table_name: "doan_chi_phi", record_id: id, mo_ta: `Xóa chi phí ${dm}${mo_ta ? ": " + mo_ta : ""}` });
    },
    onError: (err: unknown) => {
      // Toast mặc định cho mọi caller (nhiều handleDelete không có onError riêng).
      toast.error(errMsg(err) || "Không xóa được chi phí");
    },
  });
}

// Đổi trạng thái hóa đơn của 1 dòng chi phí HDV trả (NH/DV/KS, không có ĐNTT).
// KHÔNG qua lockGuard — theo dõi hóa đơn thuộc luồng thanh toán, không phải con số.
export function useUpdateChiPhiHoaDon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id: number; value: "chua_co" | "da_co" | "khong_can" }) => {
      const { error } = await externalSupabase
        .from("doan_chi_phi")
        .update({ trang_thai_hoa_don: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["doan_chi_phi"] });
      qc.invalidateQueries({ queryKey: ["chi_phi_nh_section"] });
      qc.invalidateQueries({ queryKey: ["chi_phi_ks_data"] });
    },
  });
}

export interface AllocationRow {
  chi_phi_id: number;
  so_tien: number;
  ghi_chu?: string;
}

export function useInsertDNTT() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown> & { doan_id: number; allocations?: AllocationRow[] }) => {
      const { allocations, ...dnttPayload } = payload;
      // Lấy user_id trực tiếp từ auth (tránh race với useAuth state)
      const { data: authData } = await externalSupabase.auth.getUser();
      const taoBoi = authData?.user?.id ?? user?.user_id ?? null;
      const { data, error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .insert({ ...dnttPayload, tao_boi: taoBoi } as unknown as TablesInsert<"de_nghi_thanh_toan">)
        .select("id")
        .single();
      if (error) throw error;

      const chiPhiIds: number[] = [];
      if (allocations && allocations.length > 0) {
        const rows = allocations.map((a) => ({
          dntt_id: data.id,
          chi_phi_id: a.chi_phi_id,
          so_tien: a.so_tien,
          ghi_chu: a.ghi_chu ?? null,
        }));
        const { error: allocErr } = await externalSupabase
          .from("dntt_allocations")
          .insert(rows);
        if (allocErr) throw allocErr;
        chiPhiIds.push(...allocations.map((a) => a.chi_phi_id));
      }

      await recalcChiPhiStatus(chiPhiIds);
      return data;
    },
    onSuccess: (data, v) => {
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", v.doan_id] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", v.doan_id] });
      qc.invalidateQueries({ queryKey: ["dntt_allocations_by_doan", v.doan_id] });
      const log = buildAuditLogger(user?.user_id, user?.ho_ten);
      const loai = (v.loai as string | null | undefined) ?? "";
      const soTien = (v.so_tien as number | null | undefined) ?? 0;
      const loaiLabel = DANH_MUC_LABEL[loai] ?? loai;
      log({ doan_id: v.doan_id, action: "tao", table_name: "de_nghi_thanh_toan", record_id: data?.id, mo_ta: `Tạo ĐNTT ${loaiLabel} — ${fmtVND(soTien)}` });
    },
  });
}

export function useDNTTAllocations(dnttId: number | null | undefined) {
  return useQuery({
    queryKey: ["dntt_allocations", dnttId],
    enabled: !!dnttId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("dntt_allocations")
        .select("id, chi_phi_id, so_tien, ghi_chu, created_at")
        .eq("dntt_id", dnttId!);
      if (error) throw error;
      return data as { id: number; chi_phi_id: number; so_tien: number; ghi_chu: string | null; created_at: string }[];
    },
  });
}

/** Allocations (chi_phi_id → dntt_id, so_tien) cho TẤT CẢ chi phí của 1 đoàn.
 *  Dùng để map 1 dòng chi phí → các ĐNTT phân bổ vào nó (kể cả ĐNTT gộp nhiều dòng,
 *  vì ĐNTT gộp chỉ ref_id 1 dòng nhưng allocate cho nhiều). */
export interface DnttAllocByDoan { chi_phi_id: number; dntt_id: number; so_tien: number }
export function useDNTTAllocationsByDoan(doanId?: number) {
  return useQuery({
    queryKey: ["dntt_allocations_by_doan", doanId],
    enabled: !!doanId,
    queryFn: async (): Promise<DnttAllocByDoan[]> => {
      const { data: cps } = await externalSupabase
        .from("doan_chi_phi").select("id").eq("doan_id", doanId!);
      const ids = (cps ?? []).map((c) => c.id);
      if (ids.length === 0) return [];
      const { data, error } = await externalSupabase
        .from("dntt_allocations")
        .select("chi_phi_id, dntt_id, so_tien")
        .in("chi_phi_id", ids);
      if (error) throw error;
      return (data ?? []).map((a) => ({
        chi_phi_id: a.chi_phi_id as number,
        dntt_id: a.dntt_id as number,
        so_tien: Number(a.so_tien),
      }));
    },
  });
}

export function useChiPhiAllocations(chiPhiId: number | null | undefined) {
  return useQuery({
    queryKey: ["chi_phi_allocations", chiPhiId],
    enabled: !!chiPhiId,
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from("dntt_allocations")
        .select("id, dntt_id, so_tien, ghi_chu, de_nghi_thanh_toan:dntt_id(so_tien, trang_thai_duyet, mo_ta)")
        .eq("chi_phi_id", chiPhiId!);
      if (error) throw error;

      // Bổ sung payment_status từ view (1 query phụ)
      const dnttIds = [
        ...new Set((data || []).map((r) => r.dntt_id).filter((x): x is number => x != null)),
      ];
      const paidMap: Record<number, { paid_amount: number; payment_status: string }> = {};
      if (dnttIds.length > 0) {
        const { data: paidRows } = await externalSupabase
          .from("dntt_with_payment_status")
          .select("id, paid_amount, payment_status")
          .in("id", dnttIds);
        (paidRows || []).forEach((p) => {
          if (p.id != null) {
            paidMap[p.id] = {
              paid_amount: p.paid_amount ?? 0,
              payment_status: p.payment_status ?? "unpaid",
            };
          }
        });
      }

      return (data || []).map((r) => ({
        ...r,
        de_nghi_thanh_toan: {
          ...r.de_nghi_thanh_toan,
          paid_amount: paidMap[r.dntt_id]?.paid_amount ?? 0,
          payment_status: paidMap[r.dntt_id]?.payment_status ?? "unpaid",
        },
      })) as unknown as {
        id: number;
        dntt_id: number;
        so_tien: number;
        ghi_chu: string | null;
        de_nghi_thanh_toan: {
          so_tien: number;
          trang_thai_duyet: string;
          mo_ta: string | null;
          paid_amount: number;
          payment_status: "unpaid" | "partial" | "paid";
        };
      }[];
    },
  });
}

export function useDeleteDNTT() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, doanId }: { id: number; doanId: number; refId?: number | null }) => {
      // Lấy chi_phi_ids trước khi xóa (allocations sẽ bị cascade delete)
      const { data: allocBefore } = await externalSupabase
        .from("dntt_allocations")
        .select("chi_phi_id")
        .eq("dntt_id", id);
      const chiPhiIds = (allocBefore || []).map((r) => r.chi_phi_id);

      // Reverse adjustment artifacts: xóa cong_no có dntt_goc_id = id + reset thanh_tien_thuc_te
      const { data: relatedCongNos } = await externalSupabase
        .from("cong_no")
        .select("id")
        .eq("dntt_goc_id", id);
      if (relatedCongNos && relatedCongNos.length > 0) {
        const cnIds = relatedCongNos.map((c) => c.id);
        await externalSupabase.from("payments").delete().in("cong_no_id", cnIds);
        await externalSupabase.from("cong_no").delete().in("id", cnIds);
      }
      if (chiPhiIds.length > 0) {
        await externalSupabase
          .from("doan_chi_phi")
          .update({ thanh_tien_thuc_te: null })
          .in("id", chiPhiIds);
      }

      // Lấy cong_no IDs bị ảnh hưởng để reset trạng thái
      const { data: payments } = await externalSupabase
        .from("payments")
        .select("cong_no_id")
        .eq("dntt_id", id)
        .eq("method", "can_tru");
      const affectedCongNoIds = [
        ...new Set(
          (payments || [])
            .map((p) => p.cong_no_id)
            .filter((x): x is number => x != null),
        ),
      ];

      const { error } = await externalSupabase.from("de_nghi_thanh_toan").delete().eq("id", id);
      if (error) throw error;

      // Reset cong_no trạng thái về 'con_du' nếu balance khôi phục sau cascade-delete
      for (const cnId of affectedCongNoIds) {
        const { data: cnRow } = await externalSupabase
          .from("cong_no_with_status")
          .select("so_tien_con_lai, trang_thai")
          .eq("id", cnId)
          .single();
        if (cnRow && Number(cnRow.so_tien_con_lai) > 0 && cnRow.trang_thai === "da_can_tru") {
          await externalSupabase
            .from("cong_no")
            .update({ trang_thai: "con_du" })
            .eq("id", cnId);
        }
      }

      await recalcChiPhiStatus(chiPhiIds);
      return doanId;
    },
    onSuccess: (doanId, vars) => {
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan"] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
      const log = buildAuditLogger(user?.user_id, user?.ho_ten);
      log({ doan_id: doanId, action: "xoa", table_name: "de_nghi_thanh_toan", record_id: vars.id, mo_ta: `Xóa ĐNTT #${vars.id}` });
    },
  });
}

export function useUpdateDNTT() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, doanId, ...rest }: { id: number; doanId: number } & Record<string, unknown>) => {
      const { error } = await externalSupabase
        .from("de_nghi_thanh_toan")
        .update(rest as TablesUpdate<"de_nghi_thanh_toan">)
        .eq("id", id);
      if (error) throw error;

      return doanId;
    },
    onSuccess: (doanId, vars) => {
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      const log = buildAuditLogger(user?.user_id, user?.ho_ten);
      let action: "sua" | "duyet" | "tu_choi" | "thanh_toan" = "sua";
      let moTa = `Cập nhật ĐNTT #${vars.id}`;
      if (vars.trang_thai_duyet === "duyet") { action = "duyet"; moTa = `Duyệt ĐNTT #${vars.id}`; }
      else if (vars.trang_thai_duyet === "tu_choi") { action = "tu_choi"; moTa = `Từ chối ĐNTT #${vars.id}`; }
      else if (vars.payment_status === "paid") { action = "thanh_toan"; moTa = `Thanh toán ĐNTT #${vars.id}`; }
      log({ doan_id: doanId, action, table_name: "de_nghi_thanh_toan", record_id: vars.id, mo_ta: moTa });
    },
  });
}
