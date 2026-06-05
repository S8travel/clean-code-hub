import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errMsg } from "@/lib/error";
import { format, subDays, parseISO } from "date-fns";
import { toast } from "sonner";
import { externalSupabase } from "@/lib/supabase-external";
import {
  useChiPhiList, useUpsertChiPhi, useDeleteChiPhi, useDNTTList, useInsertDNTT,
} from "@/hooks/use-chi-phi";
import { useChiPhiNHSection } from "@/hooks/use-chi-phi-nh";
import { useCancelDNTT, useUpdateDNTT, recalcChiPhiStatus } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi, createCanTruPayments } from "@/hooks/use-payments";
import { buildCanTruNote } from "@/lib/can-tru-note";
import { useCongNoList, isDnttPaidFromPrepaid } from "@/hooks/use-cong-no";
import { useRedemptionsByDoan, useRedeemVoucher, useUndoRedemption, type VoucherRow } from "@/hooks/use-voucher";
import { buildRedemptionMap } from "@/lib/voucher";
import type { VoucherTarget } from "./DungVoucherModal";
import { useCurrentUserName } from "@/hooks/use-doan";
import type { NHDocData, NHDocEntry } from "@/lib/export-dntt-nh-word";
import { calcSoKhachThucTe, resolveNHFoc, resolveNHChietKhau } from "@/lib/foc-calc";
import { applyChietKhau, calcDnttPriorPaid } from "@/lib/chi-phi-calc";
import { type CanTruSelection } from "./KSCongNoPanel";
import { type AggCommitNHTarget } from "./NHAggCommitModal";
import { type NHCancelTarget } from "./NHCancelModal";
import { extraPrefix, type LocalNHRow, type LocalNHExtra } from "./nh-section-shared";
import type { NHRowData, NHRowHandlers } from "./NHRow";

interface NHSectionParams {
  doanId: number;
  soKhachDefault?: number;
  soKhachKhongTL?: number;
  coTinhSuatTLNhaHang?: boolean;
  tenDoan?: string;
  /** Filter theo nhóm — Phase 2+ */
  doanNhomId?: number | null;
}

// Toàn bộ state + effect + handler của tab Chi phí Nhà hàng.
// Tách verbatim từ ChiPhiNHSection — component chỉ còn phần render.
export function useNHSection({
  doanId, soKhachDefault = 0, soKhachKhongTL, coTinhSuatTLNhaHang, tenDoan = "",
  doanNhomId,
}: NHSectionParams) {
  const { data: nhData, isLoading } = useChiPhiNHSection(doanId, doanNhomId);
  const { data: chiPhiRows = [], isLoading: chiPhiLoading } = useChiPhiList(doanId, doanNhomId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: paymentsList = [] } = usePaymentsByChiPhi(doanId);
  const { data: congNoList = [] } = useCongNoList({ doanId });

  // Voucher đã dùng cho đoàn này → map chi_phi_id → voucher (badge + khóa input).
  const { data: redemptions = [] } = useRedemptionsByDoan(doanId);
  const redemptionByChiPhiId = useMemo(() => buildRedemptionMap(redemptions), [redemptions]);
  const redeemMut = useRedeemVoucher();
  const undoRedeemMut = useUndoRedemption();
  const [voucherTarget, setVoucherTarget] = useState<VoucherTarget | null>(null);

  // Map dntt_id → tổng can_tru (cho hiển thị "Cấn trừ X" trên badge ĐNTT)
  const canTruByDnttId = useMemo(() => {
    // payment_so_tien đã pro-rate per-allocation trong usePaymentsByChiPhi.
    // KHÔNG dedupe theo payment_id (sẽ mất share của các allocs còn lại).
    const m: Record<number, number> = {};
    paymentsList.forEach((p) => {
      if (p.method !== "can_tru") return;
      m[p.dntt_id] = (m[p.dntt_id] || 0) + p.payment_so_tien;
    });
    return m;
  }, [paymentsList]);
  const { data: currentUserName = "" } = useCurrentUserName();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const cancelMut = useCancelDNTT();
  const insertDNTT = useInsertDNTT();
  const qc = useQueryClient();

  const [localRows, setLocalRows] = useState<Record<string, LocalNHRow>>({});
  const [extrasMap, setExtrasMap] = useState<Record<string, LocalNHExtra[]>>({});
  const localRowsRef = useRef(localRows);
  const extrasMapRef = useRef(extrasMap);
  useEffect(() => { localRowsRef.current = localRows; }, [localRows]);
  useEffect(() => { extrasMapRef.current = extrasMap; }, [extrasMap]);

  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [previewNHData, setPreviewNHData] = useState<NHDocData | null>(null);

  const [cancelTarget, setCancelTarget] = useState<NHCancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // Aggregate commit dialog (sửa inline xong → commit chênh lệch ở footer)
  const [aggCommit, setAggCommit] = useState<AggCommitNHTarget | null>(null);
  const [aggReason, setAggReason] = useState("");
  const [aggNgayCan, setAggNgayCan] = useState("");
  // Surplus mode khi delta < 0 (thừa): NCC giữ tiền (con_du) hoặc NCC trả lại cash (hoan_tien)
  const [aggSurplusMode, setAggSurplusMode] = useState<"con_du" | "hoan_tien">("con_du");
  // Cấn trừ cong_no khi delta > 0 (thiếu): chọn cong_no NCC để giảm DNTT cash phần
  const [aggCanTru, setAggCanTru] = useState<CanTruSelection[]>([]);

  // Sửa ĐNTT chờ duyệt
  const updateDNTT = useUpdateDNTT();
  const [editingDnttId, setEditingDnttId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  const [dnttModalKey, setDnttModalKey] = useState<string | null>(null);
  const [dnttModalMode, setDnttModalMode] = useState<"full" | "deposit">("full");
  const [dnttDepositAmount, setDnttDepositAmount] = useState(0);
  const [dnttAlreadyPaid, setDnttAlreadyPaid] = useState(0); // amount already paid (for partial flow)
  const [dnttBsAmount, setDnttBsAmount] = useState(0); // bổ sung: nhập tự do khi đã TT đủ
  const [dnttNgayCan, setDnttNgayCan] = useState(""); // ngày cần thanh toán
  const [dnttSubmitting, setDnttSubmitting] = useState(false);
  const [canTruByMeal, setCanTruByMeal] = useState<Record<string, CanTruSelection[]>>({});

  // Định kỳ per meal key
  const [dinhKyKeys, setDinhKyKeys] = useState<Set<string>>(new Set());
  const dinhKyKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => { dinhKyKeysRef.current = dinhKyKeys; }, [dinhKyKeys]);

  const initializedRef = useRef(false);
  const autoFixedHdvRef = useRef(false);

  // ── Load from DB ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!nhData || initializedRef.current) return;
    if (nhData.meals.length === 0) return;
    // Wait cho chiPhiRows load xong — nếu init khi chiPhiRows còn rỗng (race
    // condition do 2 query parallel), localRows[key].id sẽ undefined → handleDnttSubmit
    // fall back vào INSERT chi phí mới → duplicate key vs row đã tồn tại trong DB.
    if (chiPhiLoading) return;

    const nhChiPhi = chiPhiRows.filter((c) => c.danh_muc === "nha_hang");
    const rows: Record<string, LocalNHRow> = {};
    const extras: Record<string, LocalNHExtra[]> = {};

    for (const meal of nhData.meals) {
      const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
      const prefix = extraPrefix(meal.bua_an);
      const nh = nhData.nhaHangMap[meal.nha_hang_id];
      const nhName = nh?.ten || "Nhà hàng";
      const buaStr = meal.bua_an === "trua" ? "trưa" : "tối";
      const mainMoTa = `${nhName} (${buaStr})`;

      const mainCp = nhChiPhi.find(
        (cp) => cp.ref_doan_ngay_id === meal.doan_ngay_id && cp.mo_ta === mainMoTa,
      );
      const soKhachForNH = coTinhSuatTLNhaHang
        ? soKhachDefault
        : (nh?.tinh_suat_tl !== true)
          ? (soKhachKhongTL ?? soKhachDefault)
          : soKhachDefault;
      // HYBRID: nếu mainCp đã override → giữ nguyên giá trị DB.
      // Nếu KHÔNG override → sync so_khach + don_gia từ Điều tour (mới nhất).
      const overridden = mainCp?.is_overridden === true;
      rows[key] = {
        id: mainCp?.id,
        nha_hang_id: meal.nha_hang_id,
        doan_ngay_id: meal.doan_ngay_id,
        ngay_date: meal.ngay_date,
        ngay_so: meal.ngay_so,
        bua_an: meal.bua_an,
        so_khach: overridden
          ? (mainCp?.so_luong ?? 0)
          : (soKhachForNH || mainCp?.so_luong || 0),
        // Non-overridden: ưu tiên meal.gia_set_menu (Điều tour mới nhất), fallback DB.
        don_gia: overridden
          ? (mainCp?.don_gia ?? 0)
          : (meal.gia_set_menu != null && meal.gia_set_menu > 0
              ? meal.gia_set_menu
              : (mainCp?.don_gia ?? 0)),
        chiet_khau_phan_tram: resolveNHChietKhau(mainCp, nhData.nhaHangMap[meal.nha_hang_id]),
        nguoi_tt: (mainCp?.tien_hdv ?? 0) > 0 ? "hdv" : (nhData.nhaHangMap[meal.nha_hang_id]?.nguoi_thanh_toan === "hdv" ? "hdv" : "cong_ty"),
        foc_khach_snapshot: mainCp?.foc_khach_snapshot ?? null,
        foc_mien_snapshot:  mainCp?.foc_mien_snapshot  ?? null,
        chiet_khau_phan_tram_snapshot: mainCp?.chiet_khau_phan_tram_snapshot ?? null,
        is_overridden: overridden,
        trang_thai_thanh_toan: mainCp?.trang_thai_thanh_toan ?? "unpaid",
      };

      const extraCps = nhChiPhi.filter(
        (cp) => cp.ref_doan_ngay_id === meal.doan_ngay_id && cp.mo_ta?.startsWith(prefix),
      );
      if (extraCps.length > 0) {
        extras[key] = extraCps.map((cp) => ({
          id: cp.id,
          mo_ta: cp.mo_ta?.slice(prefix.length) || "",
          so_luong: cp.so_luong,
          don_gia: cp.don_gia,
          nguoi_tt: (cp.tien_hdv ?? 0) > 0 ? "hdv" : "cong_ty",
          chiet_khau_phan_tram: cp.chiet_khau_phan_tram_snapshot ?? 0,
          trang_thai_hoa_don: cp.trang_thai_hoa_don ?? null,
        }));
      }
    }

    setLocalRows(rows);
    setExtrasMap(extras);

    // Khởi tạo dinhKyKeys từ DB
    const dkSet = new Set<string>();
    for (const meal of nhData.meals) {
      const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
      const nh = nhData.nhaHangMap[meal.nha_hang_id];
      const nhName = nh?.ten || "Nhà hàng";
      const buaStr = meal.bua_an === "trua" ? "trưa" : "tối";
      const mainMoTa = `${nhName} (${buaStr})`;
      const mainCp = nhChiPhi.find(
        (cp) => cp.ref_doan_ngay_id === meal.doan_ngay_id && cp.mo_ta === mainMoTa,
      );
      if (mainCp?.thanh_toan_dinh_ky) dkSet.add(key);
    }
    if (dkSet.size > 0) setDinhKyKeys(dkSet);

    initializedRef.current = true;
  }, [nhData, chiPhiRows, soKhachDefault, chiPhiLoading]);

  // Chỉ reset khi doanId THỰC SỰ thay đổi, không chạy khi mount lần đầu
  const prevDoanIdRef = useRef(doanId);
  useEffect(() => {
    if (prevDoanIdRef.current === doanId) return;
    prevDoanIdRef.current = doanId;
    initializedRef.current = false;
    autoFixedHdvRef.current = false;
    setLocalRows({});
    setExtrasMap({});
  }, [doanId]);

  // Sync NEW meals added in Điều Tour SAU init (giữ lại edits của user trên rows cũ).
  // Không chạy nếu chưa init (init effect bên trên đã handle). Không overwrite key đã có.
  useEffect(() => {
    if (!nhData || !initializedRef.current) return;
    if (nhData.meals.length === 0) return;

    const nhChiPhi = chiPhiRows.filter((c) => c.danh_muc === "nha_hang");
    const existingKeys = new Set(Object.keys(localRowsRef.current));
    const newMeals = nhData.meals.filter(
      (m) => !existingKeys.has(`${m.doan_ngay_id}_${m.bua_an}`),
    );
    if (newMeals.length === 0) return;

    setLocalRows((prev) => {
      const next = { ...prev };
      for (const meal of newMeals) {
        const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
        const nh = nhData.nhaHangMap[meal.nha_hang_id];
        const nhName = nh?.ten || "Nhà hàng";
        const buaStr = meal.bua_an === "trua" ? "trưa" : "tối";
        const mainMoTa = `${nhName} (${buaStr})`;
        const mainCp = nhChiPhi.find(
          (cp) => cp.ref_doan_ngay_id === meal.doan_ngay_id && cp.mo_ta === mainMoTa,
        );
        const soKhachForNH = coTinhSuatTLNhaHang
          ? soKhachDefault
          : (nh?.tinh_suat_tl !== true)
            ? (soKhachKhongTL ?? soKhachDefault)
            : soKhachDefault;
        const overridden = mainCp?.is_overridden === true;
        next[key] = {
          id: mainCp?.id,
          nha_hang_id: meal.nha_hang_id,
          doan_ngay_id: meal.doan_ngay_id,
          ngay_date: meal.ngay_date,
          ngay_so: meal.ngay_so,
          bua_an: meal.bua_an,
          so_khach: overridden
            ? (mainCp?.so_luong ?? 0)
            : (soKhachForNH || mainCp?.so_luong || 0),
          don_gia: overridden
            ? (mainCp?.don_gia ?? 0)
            : (meal.gia_set_menu != null && meal.gia_set_menu > 0
                ? meal.gia_set_menu
                : (mainCp?.don_gia ?? 0)),
          chiet_khau_phan_tram: resolveNHChietKhau(mainCp, nh),
          nguoi_tt: (mainCp?.tien_hdv ?? 0) > 0 ? "hdv" : (nh?.nguoi_thanh_toan === "hdv" ? "hdv" : "cong_ty"),
          foc_khach_snapshot: mainCp?.foc_khach_snapshot ?? null,
          foc_mien_snapshot:  mainCp?.foc_mien_snapshot  ?? null,
          chiet_khau_phan_tram_snapshot: mainCp?.chiet_khau_phan_tram_snapshot ?? null,
          is_overridden: overridden,
          trang_thai_thanh_toan: mainCp?.trang_thai_thanh_toan ?? "unpaid",
        };
      }
      return next;
    });

    // Cũng load extras nếu có
    setExtrasMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const meal of newMeals) {
        const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
        if (next[key]) continue;
        const prefix = extraPrefix(meal.bua_an);
        const extraCps = nhChiPhi.filter(
          (cp) => cp.ref_doan_ngay_id === meal.doan_ngay_id && cp.mo_ta?.startsWith(prefix),
        );
        if (extraCps.length > 0) {
          next[key] = extraCps.map((cp) => ({
            id: cp.id,
            mo_ta: cp.mo_ta?.slice(prefix.length) || "",
            so_luong: cp.so_luong,
            don_gia: cp.don_gia,
            nguoi_tt: (cp.tien_hdv ?? 0) > 0 ? "hdv" : "cong_ty",
            chiet_khau_phan_tram: cp.chiet_khau_phan_tram_snapshot ?? 0,
            trang_thai_hoa_don: cp.trang_thai_hoa_don ?? null,
          }));
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [nhData, chiPhiRows, soKhachDefault, soKhachKhongTL, coTinhSuatTLNhaHang]);

  // Sync localRows cho rows KHÔNG override khi Điều tour đổi set menu.
  // NH cascade ở useSaveDieuTour chỉ update master metadata, KHÔNG đụng don_gia
  // (để tránh đè user edit). Effect này tự detect: meal.gia_set_menu khác → sync.
  // Override rows giữ nguyên user edit.
  useEffect(() => {
    if (!nhData || !initializedRef.current) return;
    setLocalRows((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const meal of nhData.meals) {
        const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
        const row = next[key];
        if (!row) continue;
        if (row.is_overridden) continue; // override → giữ user edit
        // Ưu tiên meal.gia_set_menu (mới nhất từ Điều tour). Fallback DB don_gia.
        const dbRow = row.id ? chiPhiRows.find((cp) => cp.id === row.id) : null;
        const nh = nhData.nhaHangMap[meal.nha_hang_id];
        const targetDonGia = meal.gia_set_menu ?? dbRow?.don_gia ?? row.don_gia;
        // ⚠️ KHÔNG sync so_khach từ dbRow.so_luong ở đây. Số khách của row
        // non-override do effect `soKhachDefault` (= tổng khách đoàn / trừ T/L)
        // quản lý. Nếu đè từ dbRow.so_luong, các row chưa từng lưu (DB giữ
        // default so_luong=1) sẽ kéo so_khach về 1 mỗi khi chiPhiRows refetch
        // (tức sau MỖI lần blur save bất kỳ row nào) → "số khách NH khác nhảy về 1".
        // FOC + chiết khấu: lấy từ snapshot CỦA TOUR (dbRow = doan_chi_phi),
        // KHÔNG đọc master. resolveNHChietKhau chỉ fallback master khi
        // snapshot null (legacy) — đúng hành vi init.
        const targetFocK = dbRow ? (dbRow.foc_khach_snapshot ?? null) : (row.foc_khach_snapshot ?? null);
        const targetFocM = dbRow ? (dbRow.foc_mien_snapshot ?? null) : (row.foc_mien_snapshot ?? null);
        const targetCkSnap = dbRow ? (dbRow.chiet_khau_phan_tram_snapshot ?? null) : (row.chiet_khau_phan_tram_snapshot ?? null);
        const targetCk = resolveNHChietKhau({ chiet_khau_phan_tram_snapshot: targetCkSnap }, nh);
        if (
          targetDonGia !== row.don_gia ||
          targetFocK !== (row.foc_khach_snapshot ?? null) ||
          targetFocM !== (row.foc_mien_snapshot ?? null) ||
          targetCkSnap !== (row.chiet_khau_phan_tram_snapshot ?? null) ||
          targetCk !== row.chiet_khau_phan_tram
        ) {
          next[key] = {
            ...row,
            don_gia: targetDonGia,
            foc_khach_snapshot: targetFocK,
            foc_mien_snapshot: targetFocM,
            chiet_khau_phan_tram_snapshot: targetCkSnap,
            chiet_khau_phan_tram: targetCk,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [nhData, chiPhiRows]);

  // Khi soKhachDefault load xong (async), cập nhật rows chưa có số khách.
  // SKIP overridden rows — user đã chốt giá trị, không được auto-cascade.
  useEffect(() => {
    if (soKhachDefault <= 0) return;
    setLocalRows((prev) => {
      if (!nhData) return prev;
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const row = next[key];
        if (row.is_overridden) continue; // giữ user edit
        const nh = nhData.nhaHangMap[row.nha_hang_id];
        const target = coTinhSuatTLNhaHang
          ? soKhachDefault
          : (nh?.tinh_suat_tl !== true)
            ? (soKhachKhongTL ?? soKhachDefault)
            : soKhachDefault;
        if (row.so_khach !== target) {
          next[key] = { ...row, so_khach: target };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [soKhachDefault, soKhachKhongTL, coTinhSuatTLNhaHang, nhData]);

  // Auto-fix: đảm bảo tất cả NH rows có valid data đều tồn tại trong DB với đúng giá trị.
  // Case 1: HDV row bị save sai tien_cong_ty > 0
  // Case 2: Row chưa có trong DB (chưa từng blur)
  // Case 3: Row trong DB nhưng so_luong stale (save lúc soKhachDefault chưa load xong)
  useEffect(() => {
    if (autoFixedHdvRef.current || !initializedRef.current) return;
    if (!nhData || Object.keys(localRows).length === 0) return;

    autoFixedHdvRef.current = true;

    for (const [key, row] of Object.entries(localRows)) {
      if (!row.don_gia || !row.so_khach) continue;

      const nh = nhData.nhaHangMap[row.nha_hang_id];
      const dbRow = row.id ? chiPhiRows.find((cp) => cp.id === row.id) : null;

      // Case 1: HDV row với tien_cong_ty sai
      if (nh?.nguoi_thanh_toan === "hdv" && (!dbRow || (dbRow.tien_cong_ty != null && dbRow.tien_cong_ty > 0))) {
        handleSave(key); continue;
      }
      // Case 2: chưa có trong DB
      if (!row.id) {
        handleSave(key); continue;
      }
      // Case 3: DB so_luong khác local so_khach (stale)
      if (dbRow && row.so_khach > 1 && dbRow.so_luong !== row.so_khach) {
        handleSave(key);
      }
    }
  }, [localRows, nhData, chiPhiRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-xóa chi phí NH orphaned khi đã giải quyết hoàn toàn:
  //   (1) Chưa có DNTT nào
  //   (2) "Hủy dịch vụ": DNTT da_huy + paid > 0 (cong_no tạo bởi useCancelDNTT)
  //   (3) "Xử lý chênh lệch thừa" agg modal: cong_no đã cover full sumPaid (DNTT giữ active)
  const autoDeletedNhIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!nhData || chiPhiRows.length === 0) return;
    const currentNgayIds = new Set(nhData.meals.map((m) => m.doan_ngay_id));
    const toDelete = chiPhiRows.filter((cp) => {
      if (cp.danh_muc !== "nha_hang") return false;
      if (cp.ref_doan_ngay_id == null) return false;
      if (currentNgayIds.has(cp.ref_doan_ngay_id)) return false;
      if (cp.mo_ta?.startsWith("[trua] ") || cp.mo_ta?.startsWith("[toi] ")) return false;
      if (!cp.id || autoDeletedNhIdsRef.current.has(cp.id)) return false;
      // Đừng auto-xóa dòng đang được voucher phủ → tránh mồ côi voucher_su_dung
      // (FK chi_phi_id ON DELETE SET NULL) → tồn voucher mất dấu liên kết. User
      // phải gỡ voucher trước thì dòng mới đủ điều kiện dọn.
      if (redemptionByChiPhiId[cp.id]) return false;
      const cpDntts = dnttList.filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === cp.id);
      // Case 1: chưa có DNTT
      if (cpDntts.length === 0) return true;
      // Case 2: hủy dịch vụ
      if (cpDntts.some((d) => d.trang_thai_duyet === "da_huy" && (d.paid_amount || 0) > 0)) return true;
      // Case 3: agg-settled — cong_no đã cover full sumPaid
      const sumPaid = cpDntts.reduce((s, d) => s + (d.paid_amount || 0), 0);
      const dnttIds = new Set(cpDntts.map((d) => d.id));
      const sumCongNo = congNoList
        .filter((c) => c.dntt_goc_id != null && dnttIds.has(c.dntt_goc_id))
        .reduce((s, c) => s + Number(c.so_tien_goc || 0), 0);
      return sumPaid > 0 && sumCongNo >= sumPaid;
    });
    for (const cp of toDelete) {
      autoDeletedNhIdsRef.current.add(cp.id!);
      deleteMut.mutate({ id: cp.id!, doanId });
    }
  }, [nhData, chiPhiRows, dnttList, congNoList, doanId, deleteMut, redemptionByChiPhiId]);

  // ── Main row handlers ─────────────────────────────────────────────────────

  const handleChange = useCallback((key: string, field: "so_khach" | "don_gia" | "chiet_khau_phan_tram", value: number) => {
    // Sửa tay 1 field = override → set is_overridden NGAY (không đợi handleSave) để
    // effect "Sync localRows" (cascade Điều tour) không ghi đè giá trị vừa nhập.
    setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value, is_overridden: true } }));
  }, []);

  const handleSave = useCallback((key: string, nguoiTtOverride?: "cong_ty" | "hdv") => {
    const row = localRowsRef.current[key];
    if (!row || (!row.don_gia && !row.so_khach)) return;

    const nh = nhData?.nhaHangMap[row.nha_hang_id];
    const nhName = nh?.ten || "Nhà hàng";
    const buaStr = row.bua_an === "trua" ? "trưa" : "tối";
    const focResolved = resolveNHFoc(row, nh);
    const soKhachThucTe = calcSoKhachThucTe(row.so_khach, focResolved.foc_khach, focResolved.foc_mien);
    const thanhTienTruocCK = soKhachThucTe * row.don_gia;
    const ck = row.chiet_khau_phan_tram ?? nh?.chiet_khau_phan_tram ?? null;
    const thanhTien = applyChietKhau(thanhTienTruocCK, ck);
    const nguoiTt = nguoiTtOverride ?? row.nguoi_tt ?? (nh?.nguoi_thanh_toan !== "hdv" ? "cong_ty" : "hdv");

    // Optimistic: mark override ngay để UI hiện badge 🔒 + nút ↺ trước khi mutation return.
    if (!row.is_overridden) {
      setLocalRows((prev) => ({
        ...prev,
        [key]: { ...prev[key], is_overridden: true, nguoi_tt: nguoiTt },
      }));
    }

    upsertMut.mutate(
      {
        id: row.id,
        doan_id: doanId,
        ngay_so: row.ngay_so,
        loai: "chi",
        danh_muc: "nha_hang",
        ref_doan_ngay_id: row.doan_ngay_id,
        mo_ta: `${nhName} (${buaStr})`,
        don_gia: row.don_gia,
        so_luong: row.so_khach,
        tien_cong_ty: nguoiTt !== "hdv" ? thanhTien : 0,
        tien_hdv: nguoiTt === "hdv" ? thanhTien : 0,
        thanh_toan_dinh_ky: dinhKyKeysRef.current.has(key),
        // Snapshot FOC + chiết khấu: lần đầu auto từ master, lần sau giữ snapshot hiện có.
        foc_khach_snapshot: focResolved.foc_khach,
        foc_mien_snapshot:  focResolved.foc_mien,
        chiet_khau_phan_tram_snapshot: row.chiet_khau_phan_tram,
        // HYBRID: user save NH section = override → cascade Điều tour bỏ qua
        is_overridden: true,
        // Sửa inline = giá trị mới CHÍNH là thực tế → xóa override thực tế cũ
        // (nếu có) để footer aggregate đọc đúng tien_cong_ty mới.
        thanh_tien_thuc_te: null,
      },
      {
        onSuccess: (data) => {
          if (!row.id && data?.id) {
            setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], id: data.id } }));
          }
        },
      },
    );
  }, [doanId, upsertMut, nhData]);

  // Reset override → cascade NGAY từ Điều tour (so_khach computed như load, don_gia
  // từ set menu hiện tại). Tách verbatim từ inline handler của nút ↺.
  const handleResetOverrideNH = async (key: string) => {
    const row = localRowsRef.current[key];
    if (!row || row.id == null) return;
    const meal = nhData?.meals.find((m) => `${m.doan_ngay_id}_${m.bua_an}` === key);
    const nh = nhData?.nhaHangMap[row.nha_hang_id];
    const sk = coTinhSuatTLNhaHang
      ? soKhachDefault
      : (nh?.tinh_suat_tl !== true
          ? (soKhachKhongTL ?? soKhachDefault)
          : soKhachDefault);
    const newSoKhach = sk || row.so_khach;
    const newDonGia  = meal?.gia_set_menu ?? row.don_gia;
    const isHdv = (nh?.nguoi_thanh_toan === "hdv");
    // Trừ FOC + CK giống handleSave — trước đây dùng newSoKhach*newDonGia thô
    // → tien_cong_ty không khớp "Thành tiền"/ĐNTT (cùng bug NHFocEditor).
    const focResolved = resolveNHFoc(row, nh);
    const soKhachThucTe = calcSoKhachThucTe(newSoKhach, focResolved.foc_khach, focResolved.foc_mien);
    const newTotal = applyChietKhau(soKhachThucTe * newDonGia, row.chiet_khau_phan_tram ?? nh?.chiet_khau_phan_tram ?? null);
    // Route qua upsertMut (KHÔNG raw update) để tự hưởng lockGuard — đoàn đã
    // quyết toán + non-admin → ném lỗi, không sửa được con số chi phí.
    try {
      await upsertMut.mutateAsync({
        id: row.id,
        doan_id: doanId,
        so_luong: newSoKhach,
        don_gia:  newDonGia,
        tien_cong_ty: isHdv ? 0 : newTotal,
        tien_hdv:     isHdv ? newTotal : 0,
        is_overridden: false,
        thanh_tien_thuc_te: null,
      });
    } catch (err: unknown) {
      toast.error(errMsg(err) || "Lỗi reset");
      return;
    }
    // Cập nhật localRows NGAY để UI reflect — query invalidate
    // không tự đè localRows (local state independent của chiPhiRows).
    setLocalRows((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        so_khach: newSoKhach,
        don_gia: newDonGia,
        is_overridden: false,
        nguoi_tt: isHdv ? "hdv" : "cong_ty",
      },
    }));
    qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
    qc.invalidateQueries({ queryKey: ["chi_phi_nh_section", doanId] });
  };

  const handleToggleDinhKyNH = useCallback((key: string) => {
    setDinhKyKeys((prev) => {
      const next = new Set(prev);
      const newVal = !next.has(key);
      if (newVal) next.add(key); else next.delete(key);
      // Cập nhật chi phí row trong DB nếu đã tồn tại
      const row = localRowsRef.current[key];
      if (row?.id) {
        upsertMut.mutate({ id: row.id, doan_id: doanId, thanh_toan_dinh_ky: newVal });
      }
      return next;
    });
  }, [doanId, upsertMut]);

  const handleToggleNguoiTtNH = useCallback((key: string) => {
    const row = localRowsRef.current[key];
    if (!row) return;
    const nh = nhData?.nhaHangMap[row.nha_hang_id];
    const current = row.nguoi_tt ?? (nh?.nguoi_thanh_toan === "hdv" ? "hdv" : "cong_ty");
    const next: "cong_ty" | "hdv" = current === "hdv" ? "cong_ty" : "hdv";
    setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], nguoi_tt: next } }));
    handleSave(key, next);
  }, [handleSave, nhData]);

  // ── Extra handlers ────────────────────────────────────────────────────────

  const addExtra = useCallback((key: string) => {
    // Extra mới: CK% mặc định = CK% của bữa (dòng chính) — sửa được; để 0 nếu HDV.
    const mealCk = localRowsRef.current[key]?.chiet_khau_phan_tram ?? 0;
    setExtrasMap((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), { mo_ta: "", so_luong: 1, don_gia: 0, nguoi_tt: "cong_ty", chiet_khau_phan_tram: mealCk }],
    }));
  }, []);

  const handleExtraChange = useCallback((
    key: string, idx: number, field: keyof LocalNHExtra, value: LocalNHExtra[keyof LocalNHExtra],
  ) => {
    setExtrasMap((prev) => {
      const list = [...(prev[key] || [])];
      list[idx] = { ...list[idx], [field]: value };
      return { ...prev, [key]: list };
    });
  }, []);

  const handleExtraSave = useCallback((key: string, idx: number, nguoiTtOverride?: "cong_ty" | "hdv") => {
    const extra = extrasMapRef.current[key]?.[idx];
    const row = localRowsRef.current[key];
    if (!extra || !row || (!extra.mo_ta && !extra.don_gia)) return;

    const prefix = extraPrefix(row.bua_an);
    // CK riêng từng extra — áp per dòng (làm tròn 1 lần/dòng, đúng Mức A).
    const thanhTien = applyChietKhau(extra.so_luong * extra.don_gia, extra.chiet_khau_phan_tram);
    const nguoiTt = nguoiTtOverride ?? extra.nguoi_tt;

    upsertMut.mutate(
      {
        id: extra.id,
        doan_id: doanId,
        ngay_so: row.ngay_so,
        loai: "chi",
        danh_muc: "nha_hang",
        ref_doan_ngay_id: row.doan_ngay_id,
        mo_ta: `${prefix}${extra.mo_ta}`,
        don_gia: extra.don_gia,
        so_luong: extra.so_luong,
        tien_cong_ty: nguoiTt !== "hdv" ? thanhTien : 0,
        tien_hdv: nguoiTt === "hdv" ? thanhTien : 0,
        chiet_khau_phan_tram_snapshot: extra.chiet_khau_phan_tram,
      },
      {
        onSuccess: (data) => {
          if (!extra.id && data?.id) {
            setExtrasMap((prev) => {
              const list = [...(prev[key] || [])];
              list[idx] = { ...list[idx], id: data.id };
              return { ...prev, [key]: list };
            });
          }
        },
      },
    );
  }, [doanId, upsertMut]);

  const handleExtraDelete = useCallback((key: string, idx: number) => {
    const extra = extrasMapRef.current[key]?.[idx];
    const remove = () =>
      setExtrasMap((prev) => {
        const list = [...(prev[key] || [])];
        list.splice(idx, 1);
        return { ...prev, [key]: list };
      });
    if (extra?.id) {
      deleteMut.mutate({ id: extra.id, doanId }, { onSuccess: remove });
    } else {
      remove();
    }
  }, [doanId, deleteMut]);

  // ── DNTT ─────────────────────────────────────────────────────────────────

  const handleDnttSubmit = async () => {
    const key = dnttModalKey;
    if (!key) return;
    let row = localRows[key];
    const extras = extrasMap[key] || [];
    if (!row) return;

    // Auto-save chi_phi nếu chưa có id
    if (!row.id) {
      const nh0 = nhData?.nhaHangMap[row.nha_hang_id];
      const nhName0 = nh0?.ten || "Nhà hàng";
      const buaStr0 = row.bua_an === "trua" ? "trưa" : "tối";
      const expectedMoTa = `${nhName0} (${buaStr0})`;
      // Defensive: lookup chi phí có sẵn trong DB. Trường hợp localRows lệch
      // với DB (init race, hoặc cascade từ điều tour sau init) → reuse id thay
      // vì INSERT (sẽ collide ux_doan_chi_phi_nh_unique).
      const { data: existingCp } = await externalSupabase
        .from("doan_chi_phi")
        .select("id")
        .eq("doan_id", doanId)
        .eq("danh_muc", "nha_hang")
        .eq("ref_doan_ngay_id", row.doan_ngay_id)
        .eq("mo_ta", expectedMoTa)
        .maybeSingle();
      if (existingCp?.id) {
        setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], id: existingCp.id } }));
        row = { ...row, id: existingCp.id };
      } else {
        const focResolved0 = resolveNHFoc(row, nh0);
        const skTT0 = calcSoKhachThucTe(row.so_khach, focResolved0.foc_khach, focResolved0.foc_mien);
        const thanhTien0 = applyChietKhau(skTT0 * row.don_gia, row.chiet_khau_phan_tram ?? nh0?.chiet_khau_phan_tram ?? null);
        try {
          const saved = await upsertMut.mutateAsync({
            doan_id: doanId,
            ngay_so: row.ngay_so,
            loai: "chi",
            danh_muc: "nha_hang",
            ref_doan_ngay_id: row.doan_ngay_id,
            mo_ta: expectedMoTa,
            don_gia: row.don_gia,
            so_luong: row.so_khach,
            tien_cong_ty: nh0?.nguoi_thanh_toan !== "hdv" ? thanhTien0 : 0,
            tien_hdv: nh0?.nguoi_thanh_toan === "hdv" ? thanhTien0 : 0,
            foc_khach_snapshot: focResolved0.foc_khach,
            foc_mien_snapshot:  focResolved0.foc_mien,
            chiet_khau_phan_tram_snapshot: row.chiet_khau_phan_tram,
          });
          if (saved?.id) {
            setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], id: saved.id } }));
            row = { ...row, id: saved.id };
          }
        } catch (err: unknown) {
          toast.error("Lỗi lưu chi phí: " + (errMsg(err) || ""));
          return;
        }
      }
    }

    if (!row?.id) { toast.error("Chưa lưu chi phí bữa ăn"); return; }

    const nh = nhData?.nhaHangMap[row.nha_hang_id];
    const focResolved = resolveNHFoc(row, nh);
    const soKhachThucTe = calcSoKhachThucTe(row.so_khach, focResolved.foc_khach, focResolved.foc_mien);
    const mainTotalTruocCK = soKhachThucTe * row.don_gia;
    // Extras công ty — mỗi dòng áp CK riêng. HDV extras loại trừ (HDV trả tiền mặt).
    const extrasTotal = extras
      .filter((e) => e.nguoi_tt !== "hdv")
      .reduce((s, e) => s + applyChietKhau(e.so_luong * e.don_gia, e.chiet_khau_phan_tram), 0);
    const ckPct = row?.chiet_khau_phan_tram ?? nh?.chiet_khau_phan_tram ?? null;
    // Voucher: TẶNG → suất chính miễn phí, loại khỏi ĐNTT (chỉ phát sinh).
    //          MUA → suất chính GIỮ giá trị (đã trả bằng voucher) → ĐNTT gồm đủ,
    //          phần chính ghi 1 payment 'voucher' sau khi tạo ĐNTT.
    const redInfo = redemptionByChiPhiId[row.id];
    const isCoveredTang = redInfo?.voucherLoai === "tang";
    const isCoveredMua = redInfo?.voucherLoai === "mua";
    const mainContribution = isCoveredTang ? 0 : applyChietKhau(mainTotalTruocCK, ckPct);
    const totalBua = mainContribution + extrasTotal;
    // Số tiền chưa đề nghị (trừ phần đã cọc + thanh toán trước)
    const effectiveTotalBua = Math.max(0, totalBua - dnttAlreadyPaid);
    const isBSMode = effectiveTotalBua <= 0;
    const soTien = isBSMode ? dnttBsAmount : (dnttModalMode === "full" ? effectiveTotalBua : dnttDepositAmount);
    if (soTien <= 0) { toast.error("Số tiền phải lớn hơn 0"); return; }

    setDnttSubmitting(true);
    try {
      const nhName = nh?.ten || "Nhà hàng";
      const buaLabel = row.bua_an === "trua" ? "trưa" : "tối";
      const dateLabel = row.ngay_date
        ? format(new Date(row.ngay_date + "T00:00:00"), "dd/MM")
        : "?";

      const sels = canTruByMeal[key] ?? [];
      const nccId = nh?.nha_cung_cap_id || null;
      // Gộp nhiều cấn trừ cùng NCC — clamp tổng ≤ soTien (số tiền ĐNTT)
      const canTruItems: { congNoId: number; soTien: number; sourceTenDoan: string }[] = [];
      let ctRemain = soTien;
      if (nccId) {
        for (const s of sels) {
          if (s.soTienCanTru <= 0 || ctRemain <= 0) continue;
          const amt = Math.min(s.soTienCanTru, ctRemain);
          if (amt <= 0) continue;
          canTruItems.push({ congNoId: s.congNoId, soTien: amt, sourceTenDoan: s.tenDoan });
          ctRemain -= amt;
        }
      }
      const canTruAmount = canTruItems.reduce((a, b) => a + b.soTien, 0);

      // Allocation: thường dồn vào dòng chính. Voucher TẶNG → suất chính =0 (bị loại
      // khỏi sumCompanyChiPhi) → dồn vào dòng phát sinh công ty đầu tiên có giá>0.
      // Voucher MUA → suất chính giữ giá trị → dồn vào chính như bình thường.
      let allocChiPhiId = row.id;
      if (isCoveredTang) {
        const firstCompanyExtra = extras.find((e) => e.nguoi_tt !== "hdv" && e.id && e.don_gia > 0);
        if (!firstCompanyExtra?.id) {
          toast.error("Voucher tặng phủ suất chính. Hãy thêm dòng phát sinh (vd trẻ em), nhập giá rồi rời ô để lưu trước khi tạo ĐNTT.");
          return;
        }
        allocChiPhiId = firstCompanyExtra.id;
      }

      // Tạo 1 ĐNTT cho FULL amount; can_tru được ghi nhận như 1 payment riêng.
      const mainNhRecord = await insertDNTT.mutateAsync({
        doan_id: doanId,
        loai: "nha_hang",
        mo_ta: `${nhName} (${buaLabel}) - Ngày ${row.ngay_so} ${dateLabel}${isCoveredTang ? " - phát sinh" : ""}`,
        nha_cung_cap_id: nccId,
        ten_nha_cung_cap: nh?.ten_ncc || null,
        so_tai_khoan: nh?.ncc_so_tai_khoan || null,
        ngan_hang: nh?.ncc_ngan_hang || null,
        so_tien: soTien,
        la_coc: dnttModalMode === "deposit",
        trang_thai_duyet: "cho_duyet",
        ref_loai: "doan_chi_phi",
        ref_id: row.id,
        ngay_can_thanh_toan: dnttNgayCan || null,
        allocations: [{ chi_phi_id: allocChiPhiId, so_tien: soTien }],
      });
      const mainNhId = mainNhRecord?.id ?? null;

      // Voucher MUA: phần suất chính trả bằng voucher → ghi 1 payment 'voucher' =
      // giá trị suất chính (đếm vào da_tt sau khi kế toán duyệt). Phát sinh = cash.
      if (isCoveredMua && mainNhId && mainContribution > 0 && dnttModalMode === "full" && !isBSMode) {
        const { data: auth } = await externalSupabase.auth.getUser();
        await externalSupabase.from("payments").insert({
          dntt_id: mainNhId,
          method: "voucher",
          so_tien: mainContribution,
          nguon: "voucher",
          ghi_chu: "Thanh toán phần suất chính bằng voucher",
          tao_boi: auth?.user?.id ?? null,
        });
        // KHÔNG gắn voucher_su_dung.dntt_id (model mới): gỡ voucher tìm payment
        // 'voucher' qua ref_id=chi_phi, KHÔNG xóa ĐNTT. dntt_id chỉ còn cho legacy
        // (ĐNTT voucher cũ ref_loai='voucher') → tránh gỡ xóa nhầm ĐNTT bữa.
      }

      const allIds = [row.id, ...extras.filter((e) => e.id).map((e) => e.id!)];
      await externalSupabase
        .from("doan_chi_phi")
        .update({ trang_thai_dntt: "cho_duyet" })
        .in("id", allIds);

      if (canTruAmount > 0 && nccId && mainNhId) {
        await createCanTruPayments({
          dnttId: mainNhId,
          consumingDoanLog: tenDoan || `#${doanId}`,
          items: canTruItems,
          recalcChiPhiIds: allIds,
        });
        setCanTruByMeal((prev) => ({ ...prev, [key]: [] }));
        qc.invalidateQueries({ queryKey: ["cong-no"] });
        qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
        qc.invalidateQueries({ queryKey: ["payments-by-chi-phi", doanId] });
      }
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });

      toast.success("Đã tạo đề nghị thanh toán");
      setDnttModalKey(null);
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || "Không thể tạo ĐNTT"));
    } finally {
      setDnttSubmitting(false);
    }
  };

  const handleEditAmountSave = (dnttId: number) => {
    const v = parseInt(editAmount.replace(/\D/g, ""), 10);
    if (!isNaN(v) && v > 0) {
      updateDNTT.mutate({ id: dnttId, soTien: v });
      setEditingDnttId(null);
    }
  };

  const handleCancelSubmit = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.dnttId, mode: cancelTarget.isPaid ? cancelMode : undefined },
      {
        onSuccess: () => {
          toast.success(cancelTarget.isPaid ? "Đã hủy khoản thanh toán" : "Đã hủy đề nghị");
          setCancelTarget(null);
        },
        onError: (err: unknown) => toast.error(errMsg(err) || "Lỗi khi hủy"),
      },
    );
  };

  // ── Aggregate commit (chênh lệch sau adjust + extras) ───────────────────────

  const handleAggCommit = async () => {
    if (!aggCommit) return;
    const { mainRow, delta, paidDntt, nccId, nccName, nhName } = aggCommit;
    const absDelta = Math.abs(delta);
    if (!nccId) {
      toast.error("Bữa ăn không có NCC — không thể tạo công nợ/ĐNTT bổ sung");
      return;
    }
    try {
      if (delta < 0) {
        // Thừa → tạo cong_no (con_du = NCC giữ credit, hoan_tien = NCC trả cash)
        const trang_thai = aggSurplusMode === "hoan_tien" ? "da_hoan_tien" : "con_du";
        const lyDoLabel = aggSurplusMode === "hoan_tien" ? "hoàn tiền" : "công nợ";
        const fromPrepaid =
          trang_thai === "con_du" && (await isDnttPaidFromPrepaid(paidDntt?.id));
        const { error } = await externalSupabase.from("cong_no").insert({
          doan_id: doanId,
          dntt_goc_id: paidDntt?.id ?? null,
          nha_cung_cap_id: nccId,
          ten_nha_cung_cap: nccName ?? paidDntt?.ten_nha_cung_cap ?? null,
          so_tien_goc: absDelta,
          trang_thai,
          loai: fromPrepaid ? "tra_truoc" : "phat_sinh",
          ly_do: aggReason
            ? `Điều chỉnh giảm bữa ăn (${nhName}) — ${lyDoLabel}. Lý do: ${aggReason}`
            : `Điều chỉnh giảm bữa ăn (${nhName}) — ${lyDoLabel}`,
        });
        if (error) throw error;
        await recalcChiPhiStatus([mainRow.id]);
        toast.success(
          aggSurplusMode === "hoan_tien"
            ? `Đã ghi nhận hoàn tiền ${absDelta.toLocaleString("vi-VN")} ₫`
            : `Đã ghi nhận công nợ ${absDelta.toLocaleString("vi-VN")} ₫`,
        );
      } else {
        // Thiếu → tạo DNTT bổ sung (cho_duyet) + cấn trừ cong_no nếu user chọn
        const newDntt = await insertDNTT.mutateAsync({
          doan_id: doanId,
          loai: "nha_hang",
          mo_ta: `[Bổ sung] ${mainRow.mo_ta || nhName}`.trim(),
          nha_cung_cap_id: nccId,
          ten_nha_cung_cap: nccName ?? null,
          so_tien: absDelta,
          la_coc: false,
          trang_thai_duyet: "cho_duyet",
          ref_loai: "doan_chi_phi",
          ref_id: mainRow.id,
          ngay_can_thanh_toan: aggNgayCan || null,
          ghi_chu: aggReason ? `Lý do: ${aggReason}` : null,
          allocations: [{ chi_phi_id: mainRow.id, so_tien: absDelta }],
        });
        const newDnttId = newDntt?.id ?? null;

        // Gộp nhiều cấn trừ cùng NCC — clamp tổng ≤ absDelta
        const canTruItems: { congNoId: number; soTien: number; sourceTenDoan: string }[] = [];
        let ctRemain = absDelta;
        for (const s of aggCanTru) {
          if (s.soTienCanTru <= 0 || ctRemain <= 0) continue;
          const amt = Math.min(s.soTienCanTru, ctRemain);
          if (amt <= 0) continue;
          canTruItems.push({ congNoId: s.congNoId, soTien: amt, sourceTenDoan: s.tenDoan });
          ctRemain -= amt;
        }
        const canTruAmt = canTruItems.reduce((a, b) => a + b.soTien, 0);
        if (canTruAmt > 0 && newDnttId) {
          await createCanTruPayments({
            dnttId: newDnttId,
            consumingDoanLog: tenDoan || `#${doanId}`,
            items: canTruItems,
            recalcChiPhiIds: [mainRow.id],
          });
        }

        toast.success(
          canTruAmt > 0
            ? `Đã tạo ĐNTT bổ sung ${absDelta.toLocaleString("vi-VN")} ₫ (cấn trừ ${canTruAmt.toLocaleString("vi-VN")} ₫, cash còn ${(absDelta - canTruAmt).toLocaleString("vi-VN")} ₫)`
            : `Đã tạo ĐNTT bổ sung ${absDelta.toLocaleString("vi-VN")} ₫`,
        );
      }
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      qc.invalidateQueries({ queryKey: ["cong-no"] });
      qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
      qc.invalidateQueries({ queryKey: ["payments-by-chi-phi", doanId] });
      setAggCommit(null);
      setAggReason("");
      setAggNgayCan("");
      setAggCanTru([]);
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || ""));
    }
  };

  // ── Voucher (Phase 2): đổi 1 suất chính bằng voucher GIÁ-BIẾN-THIÊN ─────────
  // Áp: ghi voucher_su_dung (gia_tri = giá trị công ty) + chi phí về tien_cong_ty=0,
  // is_overridden=true (cascade Điều tour bỏ qua) — gross vẫn hiển thị từ so_khach×đơn giá.

  const handleApplyVoucher = async (voucher: VoucherRow) => {
    const target = voucherTarget;
    if (!target) return;
    try {
      // 1 vé = 1 khách tính tiền (sau FOC). Trừ kho theo số vé.
      await redeemMut.mutateAsync({
        voucher_id: voucher.id,
        doan_id: doanId,
        chi_phi_id: target.chiPhiId,
        so_luong: target.soVe > 0 ? target.soVe : 1,
        gia_tri: target.coverValue,
        ghi_chu: target.itemName,
      });

      // KHÔNG tự tạo ĐNTT (OP tự bấm nút ĐNTT → ĐNTT gồm cả phần này).
      // - MUA: giữ nguyên giá trị suất chính (đã trả bằng voucher) → ĐNTT đầy đủ,
      //   phần chính ghi payment 'voucher' khi tạo ĐNTT.
      // - TẶNG: miễn phí → công ty = 0.
      const isTang = voucher.loai === "tang";
      const { error } = await externalSupabase.from("doan_chi_phi").update({
        tien_cong_ty: isTang ? 0 : target.coverValue,
        tien_hdv: 0,
        is_overridden: true,
        thanh_tien_thuc_te: null,
      }).eq("id", target.chiPhiId);
      if (error) throw error;
      await recalcChiPhiStatus([target.chiPhiId]);
      setLocalRows((prev) => {
        const k = Object.keys(prev).find((key) => prev[key].id === target.chiPhiId);
        return k ? { ...prev, [k]: { ...prev[k], is_overridden: true } } : prev;
      });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["chi_phi_nh_section", doanId] });
      qc.invalidateQueries({ queryKey: ["voucher-su-dung-by-doan", doanId] });
      toast.success("Đã dùng voucher");
      setVoucherTarget(null);
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || "Không áp được voucher"));
    }
  };

  const handleRemoveVoucher = async (chiPhiId: number) => {
    const info = redemptionByChiPhiId[chiPhiId];
    if (!info) return;
    try {
      // Legacy: CHỈ xóa ĐNTT khi đó là ĐNTT voucher cũ (ref_loai='voucher'). Model
      // mới KHÔNG gắn dntt_id nên block này không đụng ĐNTT bữa (ref_loai='doan_chi_phi').
      if (info.dnttId) {
        const { data: dnttRow } = await externalSupabase
          .from("de_nghi_thanh_toan")
          .select("ref_loai, hoa_don_url, hoa_don_so_tien, trang_thai_hoa_don")
          .eq("id", info.dnttId)
          .maybeSingle();
        if (dnttRow?.ref_loai === "voucher") {
          const hasInvoice =
            !!dnttRow.hoa_don_url ||
            dnttRow.hoa_don_so_tien != null ||
            dnttRow.trang_thai_hoa_don === "da_co";
          if (hasInvoice && !window.confirm(
            "ĐNTT voucher này đã có hóa đơn nhập. Gỡ voucher sẽ xóa luôn hóa đơn đó. Tiếp tục?",
          )) {
            return;
          }
          await externalSupabase.from("de_nghi_thanh_toan").delete().eq("id", info.dnttId);
        }
      }
      // Xóa khoản "trả bằng voucher" (payment method='voucher') trên các ĐNTT của
      // bữa — phần chính trở lại chưa trả. (ĐNTT giữ nguyên, OP xử lý sau.)
      const mealDnttIds = dnttList
        .filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === chiPhiId)
        .map((d) => d.id);
      if (mealDnttIds.length > 0) {
        await externalSupabase.from("payments").delete()
          .in("dntt_id", mealDnttIds).eq("method", "voucher");
      }
      await undoRedeemMut.mutateAsync({ id: info.redemptionId, voucherId: info.voucherId, doanId });
      // Khôi phục giá trị công ty = gia_tri (giá trị suất chính); is_overridden=false.
      const { error } = await externalSupabase.from("doan_chi_phi").update({
        tien_cong_ty: info.giaTri, tien_hdv: 0, is_overridden: false, thanh_tien_thuc_te: null,
      }).eq("id", chiPhiId);
      if (error) throw error;
      await recalcChiPhiStatus([chiPhiId]);
      setLocalRows((prev) => {
        const k = Object.keys(prev).find((key) => prev[key].id === chiPhiId);
        return k ? { ...prev, [k]: { ...prev[k], is_overridden: false } } : prev;
      });
      qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
      qc.invalidateQueries({ queryKey: ["chi_phi_nh_section", doanId] });
      qc.invalidateQueries({ queryKey: ["voucher-su-dung-by-doan", doanId] });
      qc.invalidateQueries({ queryKey: ["payments-by-chi-phi", doanId] });
      qc.invalidateQueries({ queryKey: ["hoa-don-unc"] });
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });
      toast.success("Đã gỡ voucher");
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || "Không gỡ được voucher"));
    }
  };

  // ── Print handler ─────────────────────────────────────────────────────────

  const buildSelectedEntries = useCallback((): NHDocEntry[] | undefined => {
    if (!nhData || selectedKeys.length === 0) return undefined;
    const entries: NHDocEntry[] = [];
    const canTruShownByNcc: Record<number, boolean> = {};

    for (const key of selectedKeys) {
        const row = localRowsRef.current[key];
        if (!row) continue;
        const nh = nhData.nhaHangMap[row.nha_hang_id];
        if (!nh) continue;

        // Số khách thực tế (trừ FOC) — dùng snapshot trên row
        const focResolvedNH = resolveNHFoc(row, nh);
        const soLuongThuc = calcSoKhachThucTe(row.so_khach, focResolvedNH.foc_khach, focResolvedNH.foc_mien);

        // Build items: main meal + extras
        const extras = extrasMapRef.current[key] || [];
        const items: NHDocEntry["items"] = [];
        const mainCkPct = row.chiet_khau_phan_tram ?? nh.chiet_khau_phan_tram ?? 0;
        // Voucher TẶNG → suất chính miễn phí, KHÔNG in. MUA → giữ (đã trả bằng voucher).
        const coveredTangPrint = row.id != null && redemptionByChiPhiId[row.id]?.voucherLoai === "tang";
        if (!coveredTangPrint && row.don_gia > 0) {
          items.push({ so_luong: soLuongThuc, don_gia: row.don_gia, ghi_chu: "", chiet_khau_phan_tram: mainCkPct });
        }
        extras.forEach((e) => {
          if (e.don_gia > 0) {
            items.push({ so_luong: e.so_luong, don_gia: e.don_gia, ghi_chu: e.mo_ta, chiet_khau_phan_tram: e.chiet_khau_phan_tram });
          }
        });
        if (items.length === 0) continue;

        // DNTT for this meal
        const chiPhiId = row.id;
        const mealDntts = chiPhiId
          ? dnttList.filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === chiPhiId)
          : [];

        // ĐNTT đang chờ in: chọn cái đầu tiên chưa hủy / chưa từ chối / chưa paid.
        // Ưu tiên cọc (la_coc=true) trước → in cọc ra trước, full sau.
        const liveDntts = mealDntts.filter(
          (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi"
                 && d.payment_status !== "paid",
        );
        const activeDntt = liveDntts.find((d) => d.la_coc) ?? liveDntts[0] ?? null;

        // Chiết khấu áp PER dòng (main + extras, mỗi dòng CK riêng) — làm tròn 1 lần/dòng.
        const totalEntry = items.reduce(
          (s, i) => s + applyChietKhau(i.so_luong * i.don_gia, i.chiet_khau_phan_tram ?? 0),
          0,
        );

        // "Số tiền cọc" = tiền đã thanh toán TRƯỚC qua các ĐNTT KHÁC của bữa này
        // (cọc HOẶC trả 1 phần). Dùng paid_amount THỰC TẾ + KHÔNG lọc la_coc —
        // trả 1 phần thường ghi qua ĐNTT non-cọc (la_coc=false). Có pending → vẫn
        // cộng paid_amount của các ĐNTT khác (không phải cái đang in); KHÔNG còn ép 0
        // (trước đây ép 0 → cột hiện "—" dù đã thanh toán 1 phần).
        const soCoc = activeDntt
          ? calcDnttPriorPaid(mealDntts, activeDntt.id)
          : mealDntts
              .filter((d) => d.la_coc && d.trang_thai_duyet !== "da_huy" && d.payment_status === "paid")
              .reduce((s, d) => s + d.so_tien, 0);

        // Cấn trừ: tổng can_tru payments — của ĐNTT đang in (nếu có) hoặc cả meal.
        const nccId = nh.nha_cung_cap_id ?? null;
        let canTruAmount = 0;
        let canTruNote: string | undefined;
        if (nccId && !canTruShownByNcc[nccId] && chiPhiId) {
          const canTruPays = activeDntt
            ? paymentsList.filter((p) => p.dntt_id === activeDntt.id && p.method === "can_tru")
            : paymentsList.filter((p) => p.chi_phi_id === chiPhiId && p.method === "can_tru");
          canTruAmount = canTruPays.reduce((s, p) => s + p.payment_so_tien, 0);
          if (canTruAmount > 0) {
            canTruShownByNcc[nccId] = true;
            canTruNote = buildCanTruNote(canTruPays); // "Cấn trừ từ đoàn: <nguồn>"
          }
        }

        // Phần suất chính trả bằng voucher (payment method='voucher' của ĐNTT đang in)
        // → cộng vào cột Cấn trừ + trừ khỏi "số tiền còn thanh toán" (chỉ in phần cash).
        const voucherAmount = activeDntt
          ? paymentsList
              .filter((p) => p.dntt_id === activeDntt.id && p.method === "voucher")
              .reduce((s, p) => s + p.payment_so_tien, 0)
          : 0;

        // Số tiền cần thanh toán: có pending → đúng so_tien ĐNTT đó (trừ cấn trừ + voucher);
        // không có → in phần còn lại = tổng meal − cọc đã trả − cấn trừ − voucher.
        const soTienConTT = activeDntt
          ? Math.max(0, activeDntt.so_tien - canTruAmount - voucherAmount)
          : Math.max(0, totalEntry - soCoc - canTruAmount - voucherAmount);

        // Format ngay_date
        const d = new Date(row.ngay_date + "T00:00:00");
        const ngayDisplay = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

        entries.push({
          ngay_date: ngayDisplay,
          ten_nh: nh.ten,
          so_khach: row.so_khach,
          foc_khach: focResolvedNH.foc_khach && focResolvedNH.foc_mien ? focResolvedNH.foc_khach : null,
          foc: focResolvedNH.foc_khach && focResolvedNH.foc_mien ? focResolvedNH.foc_mien : null,
          items,
          chiet_khau_phan_tram: mainCkPct,
          ncc: { ten: nh.ten_ncc || undefined, so_tai_khoan: nh.ncc_so_tai_khoan || undefined, ngan_hang: nh.ncc_ngan_hang || undefined },
          tai_khoan_thanh_toan: nh.tai_khoan_thanh_toan || null,
          so_tien_coc: soCoc,
          can_tru: canTruAmount,
          can_tru_note: canTruNote,
          voucher_amount: voucherAmount,
          so_tien_con_tt: soTienConTT,
          la_coc: !!activeDntt?.la_coc,
        });
    }

    return entries;
  }, [nhData, selectedKeys, dnttList, paymentsList, redemptionByChiPhiId]);

  const handlePrintSelected = () => {
    try {
      const entries = buildSelectedEntries();
      if (!entries || entries.length === 0) {
        toast.error("Không có dữ liệu để xuất");
        return;
      }
      setPreviewNHData({
        doan: { ten_doan: tenDoan || String(doanId) },
        entries,
        nguoiDeNghi: currentUserName,
      });
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || ""));
    }
  };

  // ── Clustered props cho <NHRow> ────────────────────────────────────────────

  const nhaHangMap = nhData?.nhaHangMap ?? {};

  const nhRowData: NHRowData = {
    localRows, extrasMap, nhaHangMap, selectedKeys, dinhKyKeys,
    dnttList, paymentsList, congNoList, chiPhiRows, canTruByDnttId,
    editingDnttId, editAmount, doanId, redemptionByChiPhiId,
    upsertPending: upsertMut.isPending,
    updateDNTTPending: updateDNTT.isPending,
  };
  const nhRowHandlers: NHRowHandlers = {
    setSelectedKeys, handleChange, handleSave, handleToggleNguoiTtNH,
    handleToggleDinhKyNH, addExtra, handleExtraChange, handleExtraSave,
    handleExtraDelete, handleResetOverrideNH, handleEditAmountSave,
    setEditingDnttId, setEditAmount,
    setCancelMode, setCancelTarget,
    setDnttAlreadyPaid, setDnttModalMode, setDnttDepositAmount, setDnttNgayCan, setDnttModalKey,
    setAggCommit, setAggReason, setAggSurplusMode, setAggCanTru, setAggNgayCan,
    onOpenVoucher: (target) => setVoucherTarget(target),
    onRemoveVoucher: handleRemoveVoucher,
  };

  // ── DNTT modal derived ─────────────────────────────────────────────────────

  const dnttModalRow = dnttModalKey ? (localRows[dnttModalKey] ?? null) : null;
  const dnttModalExtras = dnttModalKey ? (extrasMap[dnttModalKey] ?? []) : [];
  const dnttModalNh = dnttModalRow ? nhaHangMap[dnttModalRow.nha_hang_id] : undefined;
  const dnttModalCanTru = dnttModalKey ? (canTruByMeal[dnttModalKey] ?? []) : [];
  const setDnttModalCanTru = (v: CanTruSelection[]) => {
    if (dnttModalKey) setCanTruByMeal((prev) => ({ ...prev, [dnttModalKey]: v }));
  };

  return {
    isLoading,
    meals: nhData?.meals ?? [],
    nhRowData, nhRowHandlers,
    selectedKeys, setSelectedKeys,
    chiPhiRows, dnttList, congNoList,
    buildSelectedEntries, handlePrintSelected,
    previewNHData, setPreviewNHData,
    // DNTT modal
    dnttModalRow, dnttModalExtras, dnttModalNh,
    dnttModalMode, setDnttModalMode,
    dnttDepositAmount, setDnttDepositAmount,
    dnttAlreadyPaid,
    dnttBsAmount, setDnttBsAmount,
    dnttNgayCan, setDnttNgayCan,
    dnttModalCanTru, setDnttModalCanTru,
    dnttSubmitting, handleDnttSubmit,
    closeDnttModal: () => setDnttModalKey(null),
    // Aggregate commit modal
    aggCommit, aggReason, setAggReason, aggNgayCan, setAggNgayCan,
    aggSurplusMode, setAggSurplusMode, aggCanTru, setAggCanTru,
    handleAggCommit, insertPending: insertDNTT.isPending,
    closeAggCommit: () => {
      setAggCommit(null); setAggReason(""); setAggNgayCan("");
      setAggSurplusMode("con_du"); setAggCanTru([]);
    },
    // Cancel modal
    cancelTarget, setCancelTarget, cancelMode, setCancelMode,
    handleCancelSubmit, cancelPending: cancelMut.isPending,
    // Voucher modal
    voucherTarget, handleApplyVoucher,
    closeVoucher: () => setVoucherTarget(null),
    voucherSubmitting: redeemMut.isPending || undoRedeemMut.isPending,
  };
}
