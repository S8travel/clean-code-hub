import { useState, useEffect, useCallback, useMemo, useRef, useImperativeHandle, forwardRef, Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, getDay, subDays, parseISO } from "date-fns";
import { Plus, Ban, Printer, Trash2, SlidersHorizontal, Pencil, Check, X, CalendarClock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DNTTRow } from "@/hooks/use-dntt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useChiPhiList, useUpsertChiPhi, useDeleteChiPhi, useDNTTList, useInsertDNTT, useUpdateChiPhiActual,
} from "@/hooks/use-chi-phi";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";
import { useChiPhiNHSection } from "@/hooks/use-chi-phi-nh";
import { useCancelDNTT, useUpdateDNTT, recalcChiPhiStatus } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi } from "@/hooks/use-payments";
import { useCongNoList, appendCanTruLog } from "@/hooks/use-cong-no";
import { useCurrentUserName } from "@/hooks/use-doan";
import { externalSupabase } from "@/lib/supabase-external";
import type { NHDocData, NHDocEntry } from "@/lib/export-dntt-nh-word";
import DNTTNHPreviewModal from "./DNTTNHPreviewModal";
import CatalogHoverCard from "./CatalogHoverCard";
import KSCongNoPanel, { type CanTruSelection } from "./KSCongNoPanel";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("vi-VN");

const dayLabel = (dateStr: string) => {
  const d = new Date(dateStr + "T00:00:00");
  const names = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return names[getDay(d)];
};

function calcSoKhachThucTe(soKhach: number, focKhach: number | null, focMien: number | null): number {
  if (!focKhach || !focMien || focKhach <= 0) return soKhach;
  return soKhach - Math.floor(soKhach / focKhach) * focMien;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet:     { text: "Chờ duyệt",  cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:      { text: "Đã duyệt",   cls: "bg-teal-100 text-teal-700" },
  da_thanh_toan: { text: "Đã TT",      cls: "bg-emerald-100 text-emerald-700" },
  hoan_tien:     { text: "Hoàn tiền",  cls: "bg-blue-100 text-blue-700" },
  cong_no:       { text: "Công nợ",    cls: "bg-purple-100 text-purple-700" },
  tu_choi:       { text: "Từ chối",    cls: "bg-red-100 text-red-700" },
};

// Extra rows are identified by this prefix in mo_ta column
const extraPrefix = (bua: "trua" | "toi") => `[${bua}] `;

// Parse "NH Name (trưa/tối)" → { name, bua }
function parseNHMoTa(moTa: string | null): { name: string; bua: string; buaIcon: string } {
  if (!moTa) return { name: "—", bua: "—", buaIcon: "" };
  const m = moTa.match(/^(.+)\s+\((trưa|tối)\)$/);
  if (m) return { name: m[1], bua: m[2], buaIcon: m[2] === "trưa" ? "🌤" : "🌙" };
  return { name: moTa, bua: "—", buaIcon: "" };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LocalNHRow {
  id?: number;
  nha_hang_id: number;
  doan_ngay_id: number;
  ngay_date: string;
  ngay_so: number;
  bua_an: "trua" | "toi";
  so_khach: number;
  don_gia: number;
  chiet_khau_phan_tram: number;
  nguoi_tt?: "cong_ty" | "hdv";
  foc_khach_snapshot?: number | null;
  foc_mien_snapshot?: number | null;
  chiet_khau_phan_tram_snapshot?: number | null;
  is_overridden?: boolean;
  trang_thai_thanh_toan?: string;
}

// Resolve FOC: snapshot trên row > master nha_hang. Snapshot lock per-tour
// → master changes không thay đổi calculation đoàn cũ.
function resolveNHFoc(
  row: { foc_khach_snapshot?: number | null; foc_mien_snapshot?: number | null } | null | undefined,
  nh: { foc_khach: number | null; foc_mien: number | null } | null | undefined,
): { foc_khach: number | null; foc_mien: number | null } {
  if (row && (row.foc_khach_snapshot != null || row.foc_mien_snapshot != null)) {
    return {
      foc_khach: row.foc_khach_snapshot ?? null,
      foc_mien:  row.foc_mien_snapshot  ?? null,
    };
  }
  return {
    foc_khach: nh?.foc_khach ?? null,
    foc_mien:  nh?.foc_mien  ?? null,
  };
}

// Resolve chiết khấu: snapshot > master. Lock per-tour.
function resolveNHChietKhau(
  row: { chiet_khau_phan_tram_snapshot?: number | null } | null | undefined,
  nh: { chiet_khau_phan_tram: number | null } | null | undefined,
): number {
  if (row && row.chiet_khau_phan_tram_snapshot != null) {
    return row.chiet_khau_phan_tram_snapshot;
  }
  return nh?.chiet_khau_phan_tram ?? 0;
}

interface LocalNHExtra {
  id?: number;
  mo_ta: string;
  so_luong: number;
  don_gia: number;
  nguoi_tt: "cong_ty" | "hdv";
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  doanId: number;
  soKhachDefault?: number;
  soKhachKhongTL?: number;
  coTinhSuatTLNhaHang?: boolean;
  tenDoan?: string;
}

export interface ChiPhiNHSectionHandle {
  /** Build entries từ selection hiện tại (undefined nếu không có gì chọn) */
  buildSelectedEntries: () => NHDocEntry[] | undefined;
  clearSelection: () => void;
  getSelectedCount: () => number;
}

const ChiPhiNHSection = forwardRef<ChiPhiNHSectionHandle, Props>(function ChiPhiNHSection({ doanId, soKhachDefault = 0, soKhachKhongTL, coTinhSuatTLNhaHang, tenDoan = "" }, ref) {
  const { data: nhData, isLoading } = useChiPhiNHSection(doanId);
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: paymentsList = [] } = usePaymentsByChiPhi(doanId);
  const { data: congNoList = [] } = useCongNoList({ doanId });

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

  const [cancelTarget, setCancelTarget] = useState<{
    dnttId: number; isPaid: boolean; nhName: string;
  } | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // Điều chỉnh sau thanh toán — HYBRID: edit chi_phi state (so_khach + đơn giá).
  // Aggregate commit ở footer xử lý chênh lệch (cong_no / DNTT bổ sung).
  const updateActualMut = useUpdateChiPhiActual();
  interface AdjustNHTarget {
    chiPhi: ChiPhiRow;
    mainMoTa: string;        // "<NH name> (trưa|tối)"
    nhName: string;
    focKhach: number | null;
    focMien: number | null;
    ckPct: number;
  }
  const [adjustTarget, setAdjustTarget] = useState<AdjustNHTarget | null>(null);
  const [adjustSoKhach, setAdjustSoKhach] = useState("");
  const [adjustDonGia,  setAdjustDonGia]  = useState("");
  const [adjustReason,  setAdjustReason]  = useState("");

  // Aggregate commit dialog (sau khi adjust + extras → commit chênh lệch)
  interface AggCommitNHTarget {
    mainRow: ChiPhiRow;
    nhName: string;
    nccId: number | null;
    nccName: string | null;
    delta: number;       // < 0 = thừa (cong_no), > 0 = thiếu (DNTT bổ sung)
    sumActual: number;
    sumPaid: number;
    groupCongNoCN: number;
    groupCongNoHT: number;
    paidDntt: DNTTRow | null;
    ngayDate: string | null;
  }
  const [aggCommit, setAggCommit] = useState<AggCommitNHTarget | null>(null);
  const [aggReason, setAggReason] = useState("");
  const [aggNgayCan, setAggNgayCan] = useState("");
  // Surplus mode khi delta < 0 (thừa): NCC giữ tiền (con_du) hoặc NCC trả lại cash (hoan_tien)
  const [aggSurplusMode, setAggSurplusMode] = useState<"con_du" | "hoan_tien">("con_du");
  // Cấn trừ cong_no khi delta > 0 (thiếu): chọn cong_no NCC để giảm DNTT cash phần
  const [aggCanTru, setAggCanTru] = useState<CanTruSelection | null>(null);

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
  const [canTruByMeal, setCanTruByMeal] = useState<Record<string, CanTruSelection | null>>({});

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
  }, [nhData, chiPhiRows, soKhachDefault]);

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
        const targetSoLuong = dbRow?.so_luong ?? row.so_khach;
        // FOC + chiết khấu: lấy từ snapshot CỦA TOUR (dbRow = doan_chi_phi),
        // KHÔNG đọc master. resolveNHChietKhau chỉ fallback master khi
        // snapshot null (legacy) — đúng hành vi init.
        const targetFocK = dbRow ? (dbRow.foc_khach_snapshot ?? null) : (row.foc_khach_snapshot ?? null);
        const targetFocM = dbRow ? (dbRow.foc_mien_snapshot ?? null) : (row.foc_mien_snapshot ?? null);
        const targetCkSnap = dbRow ? (dbRow.chiet_khau_phan_tram_snapshot ?? null) : (row.chiet_khau_phan_tram_snapshot ?? null);
        const targetCk = resolveNHChietKhau({ chiet_khau_phan_tram_snapshot: targetCkSnap }, nh);
        if (
          targetDonGia !== row.don_gia ||
          targetSoLuong !== row.so_khach ||
          targetFocK !== (row.foc_khach_snapshot ?? null) ||
          targetFocM !== (row.foc_mien_snapshot ?? null) ||
          targetCkSnap !== (row.chiet_khau_phan_tram_snapshot ?? null) ||
          targetCk !== row.chiet_khau_phan_tram
        ) {
          next[key] = {
            ...row,
            don_gia: targetDonGia,
            so_khach: targetSoLuong,
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
  }, [soKhachDefault, soKhachKhongTL, coTinhSuatTLNhaHang, nhData]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [nhData, chiPhiRows, dnttList, congNoList, doanId, deleteMut]);

  // ── Main row handlers ─────────────────────────────────────────────────────

  const handleChange = useCallback((key: string, field: "so_khach" | "don_gia" | "chiet_khau_phan_tram", value: number) => {
    setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
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
    const thanhTien = ck && ck > 0 ? Math.round(thanhTienTruocCK * (1 - ck / 100)) : thanhTienTruocCK;
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

  const handleToggleDinhKyNH = useCallback((key: string) => {
    setDinhKyKeys((prev) => {
      const next = new Set(prev);
      const newVal = !next.has(key);
      if (newVal) next.add(key); else next.delete(key);
      // Cập nhật chi phí row trong DB nếu đã tồn tại
      const row = localRowsRef.current[key];
      if (row?.id) {
        upsertMut.mutate({ id: row.id, doan_id: doanId, thanh_toan_dinh_ky: newVal } as any);
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
    setExtrasMap((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), { mo_ta: "", so_luong: 1, don_gia: 0, nguoi_tt: "cong_ty" }],
    }));
  }, []);

  const handleExtraChange = useCallback((key: string, idx: number, field: keyof LocalNHExtra, value: any) => {
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
    const thanhTien = extra.so_luong * extra.don_gia;
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
  }, [doanId, upsertMut, nhData]);

  const handleExtraDelete = useCallback((key: string, idx: number) => {
    const extra = extrasMap[key]?.[idx];
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
  }, [extrasMap, doanId, deleteMut]);

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
      const focResolved0 = resolveNHFoc(row, nh0);
      const skTT0 = calcSoKhachThucTe(row.so_khach, focResolved0.foc_khach, focResolved0.foc_mien);
      try {
        const saved = await upsertMut.mutateAsync({
          doan_id: doanId,
          ngay_so: row.ngay_so,
          loai: "chi",
          danh_muc: "nha_hang",
          ref_doan_ngay_id: row.doan_ngay_id,
          mo_ta: `${nhName0} (${buaStr0})`,
          don_gia: row.don_gia,
          so_luong: row.so_khach,
          tien_cong_ty: nh0?.nguoi_thanh_toan !== "hdv" ? Math.round(skTT0 * row.don_gia * (1 - (row.chiet_khau_phan_tram ?? nh0?.chiet_khau_phan_tram ?? 0) / 100)) : 0,
          tien_hdv: nh0?.nguoi_thanh_toan === "hdv" ? Math.round(skTT0 * row.don_gia * (1 - (row.chiet_khau_phan_tram ?? nh0?.chiet_khau_phan_tram ?? 0) / 100)) : 0,
          foc_khach_snapshot: focResolved0.foc_khach,
          foc_mien_snapshot:  focResolved0.foc_mien,
          chiet_khau_phan_tram_snapshot: row.chiet_khau_phan_tram,
        });
        if (saved?.id) {
          setLocalRows((prev) => ({ ...prev, [key]: { ...prev[key], id: saved.id } }));
          row = { ...row, id: saved.id };
        }
      } catch (err: any) {
        toast.error("Lỗi lưu chi phí: " + (err?.message || ""));
        return;
      }
    }

    if (!row?.id) { toast.error("Chưa lưu chi phí bữa ăn"); return; }

    const nh = nhData?.nhaHangMap[row.nha_hang_id];
    const focResolved = resolveNHFoc(row, nh);
    const soKhachThucTe = calcSoKhachThucTe(row.so_khach, focResolved.foc_khach, focResolved.foc_mien);
    const mainTotalTruocCK = soKhachThucTe * row.don_gia;
    const allExtrasTotal = extras.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
    const hdvExtrasTotal = extras.filter(e => e.nguoi_tt === "hdv").reduce((s, e) => s + e.so_luong * e.don_gia, 0);
    const extrasTotal = allExtrasTotal - hdvExtrasTotal;
    const ckPct = row?.chiet_khau_phan_tram ?? nh?.chiet_khau_phan_tram ?? null;
    const chietKhau = ckPct && ckPct > 0 ? Math.round(mainTotalTruocCK * ckPct / 100) : 0;
    const totalBua = mainTotalTruocCK - chietKhau + extrasTotal;
    // Số tiền chưa đề nghị (trừ phần đã cọc + thanh toán trước)
    const effectiveTotalBua = Math.max(0, totalBua - dnttAlreadyPaid);
    const isBSMode = effectiveTotalBua <= 0;
    const soTien = isBSMode ? dnttBsAmount : (dnttModalMode === "full" ? effectiveTotalBua : dnttDepositAmount);
    const soTienConLai = isBSMode ? 0 : (dnttModalMode === "full" ? 0 : effectiveTotalBua - dnttDepositAmount);
    if (soTien <= 0) { toast.error("Số tiền phải lớn hơn 0"); return; }

    setDnttSubmitting(true);
    try {
      const nhName = nh?.ten || "Nhà hàng";
      const buaLabel = row.bua_an === "trua" ? "trưa" : "tối";
      const dateLabel = row.ngay_date
        ? format(new Date(row.ngay_date + "T00:00:00"), "dd/MM")
        : "?";

      const canTru = canTruByMeal[key];
      const nccId = nh?.nha_cung_cap_id || null;
      const canTruAmount = (canTru && nccId && canTru.soTienCanTru > 0)
        ? Math.min(canTru.soTienCanTru, soTien)
        : 0;

      // Tạo 1 ĐNTT cho FULL amount; can_tru được ghi nhận như 1 payment riêng.
      const mainNhRecord = await insertDNTT.mutateAsync({
        doan_id: doanId,
        loai: "nha_hang",
        mo_ta: `${nhName} (${buaLabel}) - Ngày ${row.ngay_so} ${dateLabel}`,
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
        allocations: [{ chi_phi_id: row.id, so_tien: soTien }],
      });
      const mainNhId = (mainNhRecord as any)?.id ?? null;

      const allIds = [row.id, ...extras.filter((e) => e.id).map((e) => e.id!)];
      await externalSupabase
        .from("doan_chi_phi")
        .update({ trang_thai_dntt: "cho_duyet" })
        .in("id", allIds);

      if (canTruAmount > 0 && nccId && canTru && mainNhId) {
        const { error: payErr } = await externalSupabase.from("payments").insert({
          dntt_id: mainNhId,
          method: "can_tru",
          so_tien: canTruAmount,
          cong_no_id: canTru.congNoId,
          ghi_chu: `Cấn trừ từ đoàn: ${canTru.tenDoan}`,
        });
        if (payErr) throw payErr;
        await appendCanTruLog(canTru.congNoId, canTruAmount, tenDoan || `#${doanId}`);
        await recalcChiPhiStatus(allIds);
        setCanTruByMeal((prev) => ({ ...prev, [key]: null }));
        qc.invalidateQueries({ queryKey: ["cong-no"] });
        qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
        qc.invalidateQueries({ queryKey: ["payments-by-chi-phi", doanId] });
      }
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });

      toast.success("Đã tạo đề nghị thanh toán");
      setDnttModalKey(null);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Không thể tạo ĐNTT"));
    } finally {
      setDnttSubmitting(false);
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
        onError: (err: any) => toast.error(err?.message || "Lỗi khi hủy"),
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
        const { error } = await externalSupabase.from("cong_no").insert({
          doan_id: doanId,
          dntt_goc_id: paidDntt?.id ?? null,
          nha_cung_cap_id: nccId,
          ten_nha_cung_cap: nccName ?? paidDntt?.ten_nha_cung_cap ?? null,
          so_tien_goc: absDelta,
          trang_thai,
          ly_do: aggReason
            ? `Điều chỉnh giảm bữa ăn (${nhName}) — ${lyDoLabel}. Lý do: ${aggReason}`
            : `Điều chỉnh giảm bữa ăn (${nhName}) — ${lyDoLabel}`,
        });
        if (error) throw error;
        await recalcChiPhiStatus([mainRow.id]);
        toast.success(
          aggSurplusMode === "hoan_tien"
            ? `Đã ghi nhận hoàn tiền ${fmt(absDelta)} ₫`
            : `Đã ghi nhận công nợ ${fmt(absDelta)} ₫`,
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
        } as any);
        const newDnttId = (newDntt as any)?.id ?? null;

        const canTruAmt = aggCanTru ? Math.min(aggCanTru.soTienCanTru, absDelta) : 0;
        if (canTruAmt > 0 && newDnttId && aggCanTru) {
          const { error: payErr } = await externalSupabase.from("payments").insert({
            dntt_id: newDnttId,
            method: "can_tru",
            so_tien: canTruAmt,
            cong_no_id: aggCanTru.congNoId,
            ghi_chu: `Cấn trừ từ đoàn: ${aggCanTru.tenDoan}`,
          });
          if (payErr) throw payErr;
          await appendCanTruLog(aggCanTru.congNoId, canTruAmt, tenDoan || `#${doanId}`);
          await recalcChiPhiStatus([mainRow.id]);
        }

        toast.success(
          canTruAmt > 0
            ? `Đã tạo ĐNTT bổ sung ${fmt(absDelta)} ₫ (cấn trừ ${fmt(canTruAmt)} ₫, cash còn ${fmt(absDelta - canTruAmt)} ₫)`
            : `Đã tạo ĐNTT bổ sung ${fmt(absDelta)} ₫`,
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
      setAggCanTru(null);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || ""));
    }
  };

  const handleAdjustSubmit = () => {
    if (!adjustTarget) return;
    const newSK = parseInt(adjustSoKhach.replace(/\D/g, ""), 10);
    const newGia = parseFloat(adjustDonGia.replace(/\.$/, "")) || 0;
    if (isNaN(newSK) || !newGia) return;
    const skTT = calcSoKhachThucTe(newSK, adjustTarget.focKhach, adjustTarget.focMien);
    const totalTruocCK = skTT * newGia;
    const ckTien = adjustTarget.ckPct > 0 ? Math.round(totalTruocCK * adjustTarget.ckPct / 100) : 0;
    const totalSauCK = totalTruocCK - ckTien;
    updateActualMut.mutate(
      {
        id: adjustTarget.chiPhi.id,
        doan_id: doanId,
        so_luong: newSK,
        don_gia: newGia,
        ly_do: adjustReason,
        total_override: totalSauCK,
      },
      {
        onSuccess: () => {
          toast.success("Đã cập nhật bữa ăn thực tế");
          setAdjustTarget(null);
          setAdjustSoKhach("");
          setAdjustDonGia("");
          setAdjustReason("");
        },
        onError: (err: any) => toast.error(err?.message || "Lỗi cập nhật"),
      },
    );
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
        if (row.don_gia > 0) {
          items.push({ so_luong: soLuongThuc, don_gia: row.don_gia, ghi_chu: "" });
        }
        extras.forEach((e) => {
          if (e.don_gia > 0) {
            items.push({ so_luong: e.so_luong, don_gia: e.don_gia, ghi_chu: e.mo_ta });
          }
        });
        if (items.length === 0) continue;

        // DNTT for this meal
        const chiPhiId = row.id;
        const mealDntts = chiPhiId
          ? dnttList.filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === chiPhiId)
          : [];

        // Cọc đã thanh toán thực sự (paid)
        const soCoc = mealDntts
          .filter((d) => d.la_coc && d.trang_thai_duyet !== "da_huy" && d.payment_status === "paid")
          .reduce((s, d) => s + d.so_tien, 0);

        // Cấn trừ: tổng can_tru payments của các DNTT thuộc meal này (NCC-level dedupe)
        const nccId = nh.nha_cung_cap_id ?? null;
        let canTruAmount = 0;
        if (nccId && !canTruShownByNcc[nccId] && chiPhiId) {
          canTruAmount = paymentsList
            .filter((p) => p.chi_phi_id === chiPhiId && p.method === "can_tru")
            .reduce((s, p) => s + p.payment_so_tien, 0);
          if (canTruAmount > 0) canTruShownByNcc[nccId] = true;
        }

        // Chiết khấu chỉ áp main row (items[0]). Resolve theo pattern row override → nh master.
        const ckPct = row.chiet_khau_phan_tram ?? nh.chiet_khau_phan_tram ?? 0;
        const mainItem = items[0];
        const ckAmount = ckPct > 0 && mainItem
          ? Math.round(mainItem.so_luong * mainItem.don_gia * ckPct / 100)
          : 0;
        const totalEntry = items.reduce((s, i) => s + i.so_luong * i.don_gia, 0) - ckAmount;
        const soTienConTT = Math.max(0, totalEntry - soCoc - canTruAmount);

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
          chiet_khau_phan_tram: ckPct,
          ncc: { ten: nh.ten_ncc || undefined, so_tai_khoan: nh.ncc_so_tai_khoan || undefined, ngan_hang: nh.ncc_ngan_hang || undefined },
          tai_khoan_thanh_toan: nh.tai_khoan_thanh_toan || null,
          so_tien_coc: soCoc,
          can_tru: canTruAmount,
          so_tien_con_tt: soTienConTT,
        });
    }

    return entries;
  }, [nhData, selectedKeys, dnttList, paymentsList]);

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
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || ""));
    }
  };

  // Expose imperative API cho ChiPhiTab (in DNTT gộp NH + DV).
  useImperativeHandle(ref, () => ({
    buildSelectedEntries,
    clearSelection: () => setSelectedKeys([]),
    getSelectedCount: () => selectedKeys.length,
  }), [buildSelectedEntries, selectedKeys.length]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return <div className="text-sm text-muted-foreground">Đang tải nhà hàng...</div>;

  const meals = nhData?.meals || [];
  const nhaHangMap = nhData?.nhaHangMap || {};

  if (meals.length === 0) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-900 px-3 py-1.5 rounded-md">
          🍽️ Nhà hàng
          <Badge variant="secondary" className="text-xs">Điều tour</Badge>
        </h3>
        <p className="text-sm text-muted-foreground">Chưa có nhà hàng trong lịch trình.</p>
      </div>
    );
  }

  const mealKeys = meals.map((m) => `${m.doan_ngay_id}_${m.bua_an}`);
  const allSelected = selectedKeys.length === meals.length && meals.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {/* Header + toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2 bg-orange-50 border border-orange-100 text-orange-900 px-3 py-1.5 rounded-md">
          🍽️ Nhà hàng
          <Badge variant="secondary" className="text-xs">Điều tour</Badge>
        </h3>
        {selectedKeys.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handlePrintSelected}
            >
              <Printer className="h-3.5 w-3.5 mr-1" />
              In ĐNTT ({selectedKeys.length})
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedKeys([])}>
              Bỏ chọn
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-xs min-w-[820px] print:min-w-0">
          <colgroup>
            <col className="w-[28px]" />
            <col className="w-[64px]" />
            <col />
            <col className="w-[56px]" />
            <col className="w-[108px]" />
            <col className="w-[136px]" />
            <col className="w-[64px]" />
            <col className="w-[110px]" />
            <col className="w-[70px]" />
            <col className="w-[180px]" />
            <col className="w-[150px]" />
            <col className="w-[100px]" />
          </colgroup>
          {/* Header */}
          <thead>
            <tr className="bg-muted/50 border-b border-border text-[11px] font-medium text-muted-foreground">
              <th className="px-2 py-1.5 text-left">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => v ? setSelectedKeys(mealKeys) : setSelectedKeys([])}
                  className="h-3.5 w-3.5"
                />
              </th>
              <th className="px-3 py-2 text-center font-medium">Ngày</th>
              <th className="px-3 py-2 text-left font-medium">Nhà hàng</th>
              <th className="px-3 py-2 text-center font-medium">Bữa</th>
              <th className="px-3 py-2 text-center font-medium">Số khách</th>
              <th className="px-3 py-2 text-center font-medium">Đơn giá</th>
              <th className="px-3 py-2 text-center font-medium">CK%</th>
              <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
              <th className="px-2 py-2 text-center font-medium">Nguồn</th>
              <th className="px-3 py-2 text-center font-medium">TT ĐNTT</th>
              <th className="px-3 py-2 text-center font-medium">TT Thanh toán</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          {/* Rows */}
          <tbody>
        {meals.map((meal, mealIdx) => {
          const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
          const row = localRows[key];
          const extras = extrasMap[key] || [];
          const nh = nhaHangMap[meal.nha_hang_id];
          const selected = selectedKeys.includes(key);

          const focResolvedRow = resolveNHFoc(row, nh);
          const soKhachThucTe = row
            ? calcSoKhachThucTe(row.so_khach, focResolvedRow.foc_khach, focResolvedRow.foc_mien)
            : 0;
          const focMienSo = row ? row.so_khach - soKhachThucTe : 0;
          const mainTotal = row ? soKhachThucTe * row.don_gia : 0;
          const extrasTotal = extras.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
          const totalTruocCK = mainTotal + extrasTotal;
          // Chiết khấu % từ local row (override) hoặc từ nha_hang — chỉ áp dụng cho main row
          const ckPhanTram = row?.chiet_khau_phan_tram ?? nh?.chiet_khau_phan_tram ?? 0;
          const chietKhauSoTien = ckPhanTram > 0
            ? Math.round(mainTotal * ckPhanTram / 100)
            : 0;
          const mainThanhTien = mainTotal - chietKhauSoTien;
          const totalBua = mainThanhTien + extrasTotal;

          const dateLabel = meal.ngay_date
            ? `N${meal.ngay_so} · ${format(new Date(meal.ngay_date + "T00:00:00"), "d/M")}`
            : `N${meal.ngay_so}`;
          const buaLabel = meal.bua_an === "trua" ? "Trưa" : "Tối";
          const buaIcon = meal.bua_an === "trua" ? "🌤" : "🌙";

          const isMealDinhKy = dinhKyKeys.has(key);
          const nguoiTtMain = row?.nguoi_tt ?? (nh?.nguoi_thanh_toan === "hdv" ? "hdv" : "cong_ty");

          // ── DNTT state per meal ──────────────────────────────────────────
          const allMealDntts = row?.id ? dnttList.filter(
            (d) => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id,
          ) : [];
          const activeDntts = allMealDntts.filter(
            (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
          );
          // daTT = tổng paid_amount của các ĐNTT đang active của meal này
          const daTT = activeDntts.reduce((s, d) => s + (d.paid_amount || 0), 0);
          // pendingDntts: ĐNTT chưa được thanh toán đủ
          const paidDntts = activeDntts.filter((d) => d.payment_status === "paid");
          const pendingDntts = activeDntts.filter((d) => d.payment_status !== "paid");
          const daDeNghi = pendingDntts.reduce((s, d) => s + (d.so_tien - (d.paid_amount || 0)), 0);
          // canTruAmtForNh: tổng can_tru payments thuộc về chi_phi này
          const canTruAmtForNh = row?.id
            ? paymentsList
                .filter((p) => p.chi_phi_id === row.id && p.method === "can_tru")
                .reduce((s, p) => s + p.payment_so_tien, 0)
            : 0;
          const isDaTT = totalBua > 0 && daTT >= totalBua;
          const conLai = Math.max(0, totalBua - daTT);
          // Primary DNTT for cancel: prefer pending over paid
          const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
          const canCancel = activeDntt && (
            activeDntt.trang_thai_duyet === "cho_duyet" ||
            activeDntt.trang_thai_duyet === "da_duyet" ||
            activeDntt.payment_status === "paid"
          );
          // Pending badge: show status of first pending DNTT
          const pendingStatusInfo = pendingDntts[0]
            ? STATUS_LABEL[pendingDntts[0].trang_thai_duyet] ?? STATUS_LABEL.cho_duyet
            : null;
          // hoan_tien: cong_no records linked to this meal's DNTTs with trang_thai='da_hoan_tien'
          const mealDnttIds = allMealDntts.map((d) => d.id);
          const hoanTienAmount = congNoList
            .filter((c) => c.dntt_goc_id != null && mealDnttIds.includes(c.dntt_goc_id) && c.trang_thai === "da_hoan_tien")
            .reduce((s, c) => s + c.so_tien_goc, 0);

          // Hoàn tiền chỉ ẩn row khi DNTT đã bị cancel hết (legacy cancelDNTT flow).
          // Hoàn tiền partial từ aggregate commit (DNTTs vẫn active) → giữ row hiển thị.
          if (hoanTienAmount > 0 && activeDntts.length === 0) return null;

          // Tổng cong_no đã ghi nhận cho group này. Split CN/HT cho display modal.
          const groupCongNoForGroup = congNoList.filter(
            (c) => c.dntt_goc_id != null && mealDnttIds.includes(c.dntt_goc_id),
          );
          const groupCongNoCN = groupCongNoForGroup
            .filter((c) => c.trang_thai === "con_du" || c.trang_thai === "da_can_tru")
            .reduce((s, c) => s + Number(c.so_tien_goc ?? 0), 0);
          const groupCongNoHT = groupCongNoForGroup
            .filter((c) => c.trang_thai === "da_hoan_tien")
            .reduce((s, c) => s + Number(c.so_tien_goc ?? 0), 0);
          const groupCongNoTotal = groupCongNoCN + groupCongNoHT;

          // Aggregate-after-edits delta (CHỈ phần công ty thanh toán).
          // Group = main chi_phi (id=row.id) + extras chi_phi (mo_ta startsWith [trua]/[toi]).
          const nhMainMoTa = `${nh?.ten || "Nhà hàng"} (${meal.bua_an === "trua" ? "trưa" : "tối"})`;
          const extraPrefixStr = extraPrefix(meal.bua_an);
          const groupChiPhi = chiPhiRows.filter((cp) =>
            cp.danh_muc === "nha_hang" &&
            cp.ref_doan_ngay_id === meal.doan_ngay_id &&
            (cp.id === row?.id || cp.mo_ta?.startsWith(extraPrefixStr)),
          );
          const companyChiPhi = groupChiPhi.filter((c) => Number(c.tien_cong_ty ?? 0) > 0);
          const sumActual = companyChiPhi.reduce(
            (s, c) => s + Number(c.thanh_tien_thuc_te ?? c.tien_cong_ty ?? 0), 0
          );
          const sumPaid = companyChiPhi.reduce(
            (s, c) => s + Number(c.so_tien_da_tt ?? 0), 0
          );
          const aggDelta = sumActual - sumPaid;
          // effectiveDelta = chênh lệch còn LẠI sau khi trừ cong_no đã ghi nhận.
          const effectiveDelta = aggDelta + groupCongNoTotal;
          const showAggBtn =
            nguoiTtMain === "cong_ty" &&
            daDeNghi === 0 &&
            sumPaid > 0 &&
            effectiveDelta !== 0;
          const aggPaidDntt = paidDntts[0] ?? null;
          const mainChiPhiRow = row?.id ? chiPhiRows.find((c) => c.id === row.id) : null;

          // Mismatch warning: chi_phi total ≠ DNTT committed (cho_duyet/da_duyet),
          // sau khi trừ cong_no đã ghi nhận. Trigger khi cascade số khách cập nhật
          // chi_phi.tien_cong_ty nhưng DNTT.so_tien chưa sửa.
          const sumCommitted = activeDntts.reduce((s, d) => s + Number(d.so_tien), 0);
          const effectiveCommitted = sumCommitted - groupCongNoTotal;
          const hasCommittedDntt = activeDntts.some((d) =>
            d.trang_thai_duyet === "cho_duyet" || d.trang_thai_duyet === "da_duyet",
          );
          // Hide badge when footer button shows (redundant — same info conveyed).
          // sumActual === 0 nghĩa là chi_phi.tien_cong_ty CHƯA được persist (NH
          // tính tiền từ snapshot booking, ghi tien_cong_ty lazily) — KHÔNG phải
          // "tổng thực = 0". So 0 với committed sẽ ra lệch −full giả trên mọi
          // dòng NH chưa lưu tay → chỉ cảnh báo khi có số chi_phi thật để so.
          const dnttMismatch = hasCommittedDntt && sumActual > 0 && sumActual !== effectiveCommitted && !showAggBtn
            ? sumActual - effectiveCommitted : 0;

          return (
            <Fragment key={key}>
              {/* Main meal row */}
              <tr
                className={`border-b border-border last:border-b-0 ${selected ? "bg-primary/5" : ""} hover:bg-muted/30 transition-colors`}
              >
                {/* Checkbox */}
                <td className="px-2 py-1.5">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      setSelectedKeys((prev) =>
                        prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key],
                      )
                    }
                    className="h-3.5 w-3.5"
                  />
                </td>

                {/* Ngày */}
                <td className="px-3 py-2 text-center text-muted-foreground whitespace-nowrap text-[11px]">
                  {dateLabel}
                </td>

                {/* NH name */}
                <td className="px-3 py-2 font-medium">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <CatalogHoverCard info={nh ? { kind: "nh", ...nh } : null}>
                      <span className="truncate">{nh?.ten || `NH #${meal.nha_hang_id}`}</span>
                    </CatalogHoverCard>
                    {nh?.ncc_so_tai_khoan && (
                      <span className="text-[10px] text-muted-foreground font-normal shrink-0">
                        STK: {nh.ncc_so_tai_khoan}
                      </span>
                    )}
                  </div>
                  {row?.id != null && (
                    <NHFocEditor
                      doanId={doanId}
                      rowId={row.id}
                      focKhach={focResolvedRow.foc_khach}
                      focMien={focResolvedRow.foc_mien}
                    />
                  )}
                </td>

                {/* Bữa */}
                <td className="px-3 py-2 text-center text-muted-foreground whitespace-nowrap">
                  {buaIcon} {buaLabel}
                </td>

                {/* Số khách — HYBRID: editable + lock khi paid, indicator khi override */}
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    {row ? (() => {
                      const isPaid = row.trang_thai_thanh_toan === "paid" || row.trang_thai_thanh_toan === "partial_paid";
                      if (isPaid) {
                        return (
                          <>
                            <span className="text-sm tabular-nums cursor-help w-[56px] text-center" title="Đã có thanh toán — dùng nút Điều chỉnh để track công nợ">
                              {row.so_khach}
                            </span>
                            <span className="w-[20px] text-green-600 text-[10px]">
                              {focMienSo > 0 ? `-${focMienSo}` : ""}
                            </span>
                          </>
                        );
                      }
                      return (
                        <>
                          <NHInput
                            value={row.so_khach}
                            onChange={(v) => handleChange(key, "so_khach", v)}
                            onBlur={() => handleSave(key)}
                            width="w-[56px]"
                          />
                          {row.is_overridden && (
                            <span title="Đã override — không sync với Điều tour" className="text-amber-500 text-[10px]">🔒</span>
                          )}
                          <span className="w-[20px] text-green-600 text-[10px]">
                            {focMienSo > 0 ? `-${focMienSo}` : ""}
                          </span>
                        </>
                      );
                    })() : <span className="text-muted-foreground">—</span>}
                  </div>
                </td>

                {/* Đơn giá — HYBRID: editable + lock + ↺ reset khi override */}
                <td className="px-3 py-2">
                  <div className="flex items-center justify-center gap-1">
                    {row ? (() => {
                      const isPaid = row.trang_thai_thanh_toan === "paid" || row.trang_thai_thanh_toan === "partial_paid";
                      if (isPaid) {
                        return (
                          <span className="text-sm tabular-nums cursor-help w-[84px] text-center" title="Đã có thanh toán — dùng nút Điều chỉnh để track công nợ">
                            {fmt(row.don_gia)}
                          </span>
                        );
                      }
                      return (
                        <>
                          <NHInput
                            value={row.don_gia}
                            onChange={(v) => handleChange(key, "don_gia", v)}
                            onBlur={() => handleSave(key)}
                            width="w-[112px]"
                            money
                            decimal
                          />
                          {row.is_overridden && row.id != null && (
                            <button
                              type="button"
                              onClick={async () => {
                                // Reset cascade NGAY: so_khach từ prop (computed như load),
                                // don_gia từ set menu hiện tại của Điều tour
                                const sk = coTinhSuatTLNhaHang
                                  ? soKhachDefault
                                  : (nh?.tinh_suat_tl !== true
                                      ? (soKhachKhongTL ?? soKhachDefault)
                                      : soKhachDefault);
                                const newSoKhach = sk || row.so_khach;
                                const newDonGia  = meal.gia_set_menu ?? row.don_gia;
                                const isHdv = (nh?.nguoi_thanh_toan === "hdv");
                                const newTotal = newSoKhach * newDonGia;
                                await externalSupabase.from("doan_chi_phi").update({
                                  so_luong: newSoKhach,
                                  don_gia:  newDonGia,
                                  tien_cong_ty: isHdv ? 0 : newTotal,
                                  tien_hdv:     isHdv ? newTotal : 0,
                                  is_overridden: false,
                                  thanh_tien_thuc_te: null,
                                }).eq("id", row.id!);
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
                              }}
                              title="Reset override → sync lại từ Điều tour ngay"
                              className="text-muted-foreground hover:text-primary text-[10px]"
                            >↺</button>
                          )}
                        </>
                      );
                    })() : <span className="text-muted-foreground">—</span>}
                  </div>
                </td>

                {/* CK% editable */}
                <td className="px-2 py-2">
                  <div className="flex justify-center">
                    {row ? (
                      <NHInput
                        value={row.chiet_khau_phan_tram}
                        onChange={(v) => handleChange(key, "chiet_khau_phan_tram", v)}
                        onBlur={() => handleSave(key)}
                        width="w-[48px]"
                      />
                    ) : <span className="text-muted-foreground">—</span>}
                  </div>
                </td>

                {/* Thành tiền chính (đã trừ FOC + CK, không gồm phát sinh) */}
                <td className="px-3 py-2 text-right font-semibold text-primary whitespace-nowrap">
                  {row ? fmt(mainThanhTien) : "—"}
                </td>

                {/* Ai trả — badge */}
                <td className="px-2 py-2 text-center">
                  {row && (
                    <button
                      onClick={() => handleToggleNguoiTtNH(key)}
                      disabled={upsertMut.isPending}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
                        nguoiTtMain === "cong_ty"
                          ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                          : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
                      )}
                    >
                      {nguoiTtMain === "cong_ty" ? "Công ty" : "HDV"}
                    </button>
                  )}
                </td>

                {/* Trạng thái ĐNTT */}
                <td className="px-2 py-1 align-top text-center">
                  {nguoiTtMain === "hdv" ? (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  ) : activeDntts.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5 items-center">
                      {activeDntts.map(d => {
                        const statusInfo = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                        return (
                          <div key={d.id} className="flex items-center gap-0.5">
                            {editingDnttId === d.id ? (
                              <>
                                <Input
                                  autoFocus
                                  type="number"
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const v = parseInt(editAmount.replace(/\D/g, ""), 10);
                                      if (!isNaN(v) && v > 0) {
                                        updateDNTT.mutate({ id: d.id, soTien: v });
                                        setEditingDnttId(null);
                                      }
                                    }
                                    if (e.key === "Escape") setEditingDnttId(null);
                                  }}
                                  className="h-5 w-20 text-[10px] px-1.5 py-0"
                                />
                                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-emerald-600 hover:text-emerald-700"
                                  disabled={updateDNTT.isPending}
                                  onClick={() => {
                                    const v = parseInt(editAmount.replace(/\D/g, ""), 10);
                                    if (!isNaN(v) && v > 0) {
                                      updateDNTT.mutate({ id: d.id, soTien: v });
                                      setEditingDnttId(null);
                                    }
                                  }}>
                                  <Check className="h-2.5 w-2.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-muted-foreground"
                                  onClick={() => setEditingDnttId(null)}>
                                  <X className="h-2.5 w-2.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                {(() => {
                                  const ct = canTruByDnttId[d.id] || 0;
                                  const thucTT = Math.max(0, d.so_tien - ct);
                                  return (
                                    <div className="inline-flex flex-col items-start gap-0.5">
                                      <span className={`px-1 py-px rounded text-[10px] leading-tight font-medium ${statusInfo.cls} whitespace-nowrap`}>
                                        {statusInfo.text} · {fmt(d.so_tien)}
                                        {d.la_coc && <span className="ml-1 opacity-70">·Cọc</span>}
                                      </span>
                                      {ct > 0 && (
                                        <span className="text-[9px] text-amber-700 leading-tight whitespace-nowrap">
                                          CT {fmt(ct)} → TT {fmt(thucTT)}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                                {d.trang_thai_duyet === "cho_duyet" && (
                                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-blue-500 hover:text-blue-600"
                                    title="Sửa số tiền"
                                    onClick={() => { setEditingDnttId(d.id); setEditAmount(String(d.so_tien)); }}>
                                    <Pencil className="h-2.5 w-2.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                      {dnttMismatch !== 0 && (
                        <span
                          className="inline-flex items-center px-1 py-px rounded text-[10px] leading-tight font-medium bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap"
                          title={`Số tiền DNTT đã commit (${fmt(sumCommitted)} ₫) khác chi phí thực tế (${fmt(sumActual)} ₫). Sửa DNTT.so_tien (Pencil) hoặc hủy & tạo lại.`}
                        >
                          ⚠ DNTT lệch {dnttMismatch > 0 ? "+" : "−"}{fmt(Math.abs(dnttMismatch))}
                        </span>
                      )}
                    </div>
                  )}
                </td>

                {/* Trạng thái Thanh toán */}
                <td className="px-2 py-1 align-top text-center">
                  {nguoiTtMain === "hdv" ? (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  ) : (
                  <div className="flex flex-col gap-0.5 items-center">
                    {activeDntts.map(d => (
                      <div key={d.id}>
                        {d.payment_status === "paid" ? (
                          <span className="px-1 py-px rounded text-[10px] leading-none font-medium bg-emerald-100 text-emerald-700">
                            Đã TT{d.thanh_toan_luc ? ` ${format(new Date(d.thanh_toan_luc), "dd/MM")}` : ""}
                          </span>
                        ) : (
                          <span className="px-1 py-px rounded text-[10px] leading-none font-medium bg-yellow-100 text-yellow-800">
                            Chờ UNC · {fmt(d.so_tien - (d.paid_amount || 0))}
                          </span>
                        )}
                      </div>
                    ))}
                    {hoanTienAmount > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                        HT: {fmt(hoanTienAmount)}
                      </span>
                    )}
                    {activeDntts.length === 0 && hoanTienAmount === 0 && (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                  )}
                </td>

                {/* Actions */}
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1 justify-end">
                    {nguoiTtMain === "cong_ty" && paidDntts.length > 0 && mainChiPhiRow && row && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-500 hover:text-blue-600"
                        title="Điều chỉnh số khách / đơn giá thực tế"
                        onClick={() => {
                          setAdjustTarget({
                            chiPhi: mainChiPhiRow,
                            mainMoTa: nhMainMoTa,
                            nhName: nh?.ten || "Nhà hàng",
                            focKhach: focResolvedRow.foc_khach,
                            focMien:  focResolvedRow.foc_mien,
                            ckPct: ckPhanTram,
                          });
                          setAdjustSoKhach(String(row.so_khach));
                          setAdjustDonGia(row.don_gia ? String(row.don_gia) : "");
                          setAdjustReason("");
                        }}>
                        <SlidersHorizontal className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      title="Thêm dịch vụ phát sinh"
                      onClick={() => addExtra(key)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    {nguoiTtMain === "cong_ty" && canCancel && activeDntt && (activeDntt.payment_status !== "paid" || groupCongNoTotal < sumPaid) && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        title="Hủy"
                        onClick={() => {
                          setCancelMode("hoan_tien");
                          setCancelTarget({
                            dnttId: activeDntt.id,
                            isPaid: activeDntt.payment_status === "paid",
                            nhName: nh?.ten || "Nhà hàng",
                          });
                        }}>
                        <Ban className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm"
                      className={cn("h-7 text-xs px-2 gap-1", isMealDinhKy ? "text-indigo-700 hover:text-indigo-800" : "text-muted-foreground hover:text-foreground")}
                      onClick={() => handleToggleDinhKyNH(key)}
                      title={isMealDinhKy ? "Đang định kỳ — bấm để bỏ" : "Đặt thanh toán định kỳ"}>
                      <CalendarClock className="h-3.5 w-3.5" />
                      {isMealDinhKy && "Định kỳ"}
                    </Button>
                    {nguoiTtMain === "cong_ty" && !isMealDinhKy && activeDntts.length === 0 && !!row && (
                      <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                        onClick={() => {
                          setDnttAlreadyPaid(0);
                          setDnttModalMode("full");
                          setDnttDepositAmount(0);
                          setDnttNgayCan(meal.ngay_date ? (() => { try { return format(subDays(parseISO(meal.ngay_date), 1), "yyyy-MM-dd"); } catch { return ""; } })() : "");
                          setDnttModalKey(key);
                        }}>
                        ĐNTT
                      </Button>
                    )}
                    {/* "ĐNTT bổ sung" cũ — REMOVED, replaced by aggregate footer button (showAggBtn) */}
                  </div>
                </td>
              </tr>

              {/* Extras sub-rows */}
              {extras.map((extra, idx) => (
                <tr
                  key={idx}
                  className="border-b border-border/50 last:border-b-0 bg-muted/20"
                >
                  {/* Col 1: empty */}
                  <td />
                  {/* Col 2: empty */}
                  <td />
                  {/* Col 3: description */}
                  <td className="px-3 py-1">
                    <div className="flex items-center gap-1.5 pl-4">
                      <span className="text-muted-foreground text-[10px] shrink-0">↳</span>
                      <Input
                        placeholder="Dịch vụ phát sinh"
                        value={extra.mo_ta}
                        onChange={(e) => handleExtraChange(key, idx, "mo_ta", e.target.value)}
                        onBlur={() => handleExtraSave(key, idx)}
                        className="h-6 text-xs flex-1"
                      />
                    </div>
                  </td>
                  {/* Col 4: empty */}
                  <td />
                  {/* Col 5: số lượng */}
                  <td className="px-2 py-1">
                    <div className="flex justify-center">
                      <NHInput
                        value={extra.so_luong}
                        onChange={(v) => handleExtraChange(key, idx, "so_luong", v)}
                        onBlur={() => handleExtraSave(key, idx)}
                        width="w-[44px]"
                      />
                    </div>
                  </td>
                  {/* Col 6: đơn giá */}
                  <td className="px-2 py-1">
                    <div className="flex justify-center">
                      <NHInput
                        value={extra.don_gia}
                        onChange={(v) => handleExtraChange(key, idx, "don_gia", v)}
                        onBlur={() => handleExtraSave(key, idx)}
                        width="w-[112px]"
                        money
                        decimal
                      />
                    </div>
                  </td>
                  {/* Col 7: CK% — empty */}
                  <td />
                  {/* Col 8: thành tiền */}
                  <td className="px-3 py-1 text-right whitespace-nowrap">
                    {extra.so_luong > 0 && extra.don_gia > 0 ? (
                      <span className={cn("text-[11px] font-semibold", extra.nguoi_tt === "hdv" ? "text-amber-600" : "text-primary")}>
                        {fmt(extra.so_luong * extra.don_gia)}
                      </span>
                    ) : ""}
                  </td>
                  {/* Col 9: Ai trả — toggle giống main row */}
                  <td className="px-2 py-1 text-center">
                    <button
                      onClick={() => {
                        const next = extra.nguoi_tt === "hdv" ? "cong_ty" : "hdv";
                        handleExtraChange(key, idx, "nguoi_tt", next);
                        handleExtraSave(key, idx, next);
                      }}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
                        extra.nguoi_tt === "cong_ty"
                          ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                          : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
                      )}
                    >
                      {extra.nguoi_tt === "cong_ty" ? "Công ty" : "HDV"}
                    </button>
                  </td>
                  {/* Col 10: empty */}
                  <td />
                  {/* Col 11: delete */}
                  <td className="px-2 py-1">
                    <div className="flex justify-end">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleExtraDelete(key, idx)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Aggregate commit footer row — chỉ hiện khi còn chênh lệch SAU TRỪ cong_no đã ghi nhận */}
              {showAggBtn && mainChiPhiRow && (
                <tr key={`agg-${key}`} className={cn(
                  "border-b border-border/50",
                  effectiveDelta > 0 ? "bg-orange-50/50" : "bg-purple-50/50",
                )}>
                  <td colSpan={12} className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-3 text-[11px]">
                      <span className="text-muted-foreground">
                        Sau điều chỉnh:
                        <span className="ml-1">Thực tế <span className="font-medium text-foreground tabular-nums">{fmt(sumActual)}</span> ₫</span>
                        <span className="mx-1">·</span>
                        <span>Đã TT <span className="font-medium text-foreground tabular-nums">{fmt(sumPaid)}</span> ₫</span>
                        {groupCongNoTotal > 0 && (
                          <>
                            <span className="mx-1">·</span>
                            <span>Đã CN/HT <span className="font-medium text-foreground tabular-nums">{fmt(groupCongNoTotal)}</span> ₫</span>
                          </>
                        )}
                        <span className="mx-1">·</span>
                        <span>Còn lệch <span className={cn(
                          "font-semibold tabular-nums",
                          effectiveDelta > 0 ? "text-orange-700" : "text-purple-700",
                        )}>
                          {effectiveDelta > 0 ? "+" : "−"}{fmt(Math.abs(effectiveDelta))} ₫
                        </span> ({effectiveDelta > 0 ? "thiếu" : "thừa"})</span>
                      </span>
                      <Button
                        size="sm"
                        className={cn(
                          "h-7 text-[11px] px-2.5 text-white",
                          effectiveDelta > 0
                            ? "bg-orange-600 hover:bg-orange-700"
                            : "bg-purple-600 hover:bg-purple-700",
                        )}
                        onClick={() => {
                          setAggCommit({
                            mainRow: mainChiPhiRow,
                            nhName: nh?.ten || "Nhà hàng",
                            nccId: nh?.nha_cung_cap_id ?? null,
                            nccName: nh?.ten_ncc ?? null,
                            delta: effectiveDelta,
                            sumActual,
                            sumPaid,
                            groupCongNoCN,
                            groupCongNoHT,
                            paidDntt: aggPaidDntt,
                            ngayDate: meal.ngay_date ?? null,
                          });
                          setAggReason("");
                          setAggSurplusMode("con_du");
                          setAggCanTru(null);
                          if (effectiveDelta > 0 && meal.ngay_date) {
                            try {
                              setAggNgayCan(format(subDays(parseISO(meal.ngay_date), 1), "yyyy-MM-dd"));
                            } catch { setAggNgayCan(""); }
                          } else {
                            setAggNgayCan("");
                          }
                        }}
                      >
                        {effectiveDelta > 0
                          ? `Thanh toán bổ sung ${fmt(effectiveDelta)} ₫`
                          : `Xử lý chênh lệch thừa ${fmt(Math.abs(effectiveDelta))} ₫`}
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
          {/* Orphaned NH rows — removed from điều tour but still have chi phí / DNTT */}
          {(() => {
            const currentNgayIds = new Set(meals.map((m) => m.doan_ngay_id));
            const orphanedCps = chiPhiRows.filter((cp) => {
              if (cp.danh_muc !== "nha_hang") return false;
              if (cp.ref_doan_ngay_id == null) return false;
              if (currentNgayIds.has(cp.ref_doan_ngay_id)) return false;
              if (cp.mo_ta?.startsWith("[trua] ") || cp.mo_ta?.startsWith("[toi] ")) return false;
              const cpDntts = dnttList.filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === cp.id);
              if (cpDntts.length === 0) return false;
              // Ẩn nếu tất cả DNTT đã bị hủy sau khi paid (đang auto-xóa)
              return !cpDntts.every(
                (d) => d.trang_thai_duyet === "da_huy" && (d.paid_amount || 0) > 0,
              );
            });
            if (orphanedCps.length === 0) return null;
            return (
              <>
                <tr>
                  <td colSpan={11} className="px-3 py-1 text-[11px] text-muted-foreground bg-muted/40 border-t border-border">
                    Không còn trong lịch trình điều tour
                  </td>
                </tr>
                {orphanedCps.map((cp) => {
                  const { name: cpNhName, bua: cpBua, buaIcon: cpBuaIcon } = parseNHMoTa(cp.mo_ta);
                  const cpTotal = cp.so_luong * cp.don_gia;
                  const cpDntts = dnttList.filter(
                    (d) => d.ref_loai === "doan_chi_phi" && d.ref_id === cp.id,
                  );
                  const cpActiveDntts = cpDntts.filter(
                    (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
                  );
                  const cpDnttIds = cpDntts.map((d) => d.id);
                  const cpCongNo = congNoList
                    .filter((c) => c.dntt_goc_id != null && cpDnttIds.includes(c.dntt_goc_id) && c.trang_thai === "con_du")
                    .reduce((s, c) => s + c.so_tien_con_lai, 0);
                  const cpHoanTien = congNoList
                    .filter((c) => c.dntt_goc_id != null && cpDnttIds.includes(c.dntt_goc_id) && c.trang_thai === "da_hoan_tien")
                    .reduce((s, c) => s + c.so_tien_goc, 0);
                  const cpPending = cpActiveDntts.find((d) => d.payment_status !== "paid");
                  const cpPendingInfo = cpPending ? STATUS_LABEL[cpPending.trang_thai_duyet] : null;
                  const cpDaTT = cpActiveDntts.reduce((s, d) => s + (d.paid_amount || 0), 0);
                  const cpIsDaTT = cpTotal > 0 && cpDaTT >= cpTotal;
                  return (
                    <tr key={`orphan-${cp.id}`} className="border-t border-border bg-muted/10 opacity-80">
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5 text-center text-muted-foreground text-[11px]">
                        N{cp.ngay_so}
                      </td>
                      <td className="px-2 py-1.5 font-medium text-muted-foreground max-w-0">
                        <div className="truncate">{cpNhName}</div>
                      </td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">
                        {cpBuaIcon} {cpBua}
                      </td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{cp.so_luong}</td>
                      <td className="px-2 py-1.5 text-center text-muted-foreground">{fmt(cp.don_gia)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold text-muted-foreground">
                        {fmt(cpTotal)}
                      </td>
                      {/* Trạng thái ĐNTT - orphaned */}
                      <td className="px-2 py-1.5 align-top">
                        {cpActiveDntts.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : (
                          <div className="space-y-1">
                            {cpActiveDntts.map(d => {
                              const si = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                              return (
                                <span key={d.id} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${si.cls}`}>
                                  {si.text} · {fmt(d.so_tien)}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      {/* Trạng thái TT - orphaned */}
                      <td className="px-2 py-1.5 align-top">
                        <div className="space-y-1">
                          {cpActiveDntts.map(d => (
                            <div key={d.id}>
                              {d.payment_status === "paid" ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">Đã TT</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">Chờ UNC</span>
                              )}
                            </div>
                          ))}
                          {cpCongNo > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">CN: {fmt(cpCongNo)}</span>
                          )}
                          {cpHoanTien > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">HT: {fmt(cpHoanTien)}</span>
                          )}
                          {cpActiveDntts.length === 0 && cpCongNo === 0 && cpHoanTien === 0 && (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td />
                    </tr>
                  );
                })}
              </>
            );
          })()}
          </tbody>
        </table>
      </div>

      {/* DNTT Modal */}
      {dnttModalKey != null && (() => {
        const row = localRows[dnttModalKey];
        if (!row) return null;
        const extras = extrasMap[dnttModalKey] || [];
        const nh = nhaHangMap[row.nha_hang_id];
        const focResolvedModal = resolveNHFoc(row, nh);
        const soKhachThucTe = calcSoKhachThucTe(row.so_khach, focResolvedModal.foc_khach, focResolvedModal.foc_mien);
        const mainTotalModal = soKhachThucTe * row.don_gia;
        const allExtrasTotalModal = extras.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
        const hdvExtrasTotalModal = extras.filter(e => e.nguoi_tt === "hdv").reduce((s, e) => s + e.so_luong * e.don_gia, 0);
        const extrasTotal = allExtrasTotalModal - hdvExtrasTotalModal;
        const ckPctModal = nh?.chiet_khau_phan_tram ?? null;
        const chietKhauModal = ckPctModal && ckPctModal > 0 ? Math.round(mainTotalModal * ckPctModal / 100) : 0;
        const totalBua = mainTotalModal - chietKhauModal + extrasTotal;
        const effectiveTotalBua = Math.max(0, totalBua - dnttAlreadyPaid);
        const isBSMode = effectiveTotalBua <= 0;
        const soTien = isBSMode ? dnttBsAmount : (dnttModalMode === "full" ? effectiveTotalBua : dnttDepositAmount);
        const soTienConLai = isBSMode ? 0 : (dnttModalMode === "full" ? 0 : effectiveTotalBua - dnttDepositAmount);
        return (
          <Dialog open onOpenChange={(v) => { if (!v) setDnttModalKey(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-sm">
                  {isBSMode ? "ĐNTT bổ sung" : dnttAlreadyPaid > 0 ? "ĐNTT còn lại" : "Tạo đề nghị TT"} — {nh?.ten}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 text-xs">
                {chietKhauModal > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">Tổng bữa ăn (sau FOC): <span className="font-semibold text-foreground">{fmt(mainTotalModal + extrasTotal)} VND</span></p>
                    <p className="text-green-600">Chiết khấu {ckPctModal}%: <span className="font-semibold">−{fmt(chietKhauModal)} VND</span></p>
                    <p>Thực thanh toán: <span className="font-semibold">{fmt(totalBua)} VND</span></p>
                  </div>
                ) : (
                  <p>Tổng bữa ăn: <span className="font-semibold">{fmt(totalBua)} VND</span></p>
                )}
                {dnttAlreadyPaid > 0 && (
                  <>
                    <p>Đã thanh toán: <span className="font-semibold text-amber-600">- {fmt(dnttAlreadyPaid)} VND</span></p>
                    {!isBSMode && <p>Còn lại: <span className="font-semibold text-primary">{fmt(effectiveTotalBua)} VND</span></p>}
                  </>
                )}
                {extras.length > 0 && dnttAlreadyPaid === 0 && (
                  <div className="space-y-0.5 text-muted-foreground">
                    <p>Gồm: {fmt(mainTotalModal)} VND (chính){allExtrasTotalModal > 0 ? ` + ${fmt(allExtrasTotalModal)} VND (phát sinh)` : ""}</p>
                    {hdvExtrasTotalModal > 0 && (
                      <p className="text-amber-600">HDV thanh toán: <span className="font-semibold">−{fmt(hdvExtrasTotalModal)} VND</span></p>
                    )}
                  </div>
                )}
                {isBSMode ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-amber-600">Đã thanh toán đủ — nhập số tiền bổ sung cần thanh toán thêm.</p>
                    <Label className="text-xs">Số tiền bổ sung</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={dnttBsAmount || ""}
                      onChange={(e) => setDnttBsAmount(Number(e.target.value) || 0)}
                      min={0}
                      placeholder="Nhập số tiền..."
                    />
                  </div>
                ) : (
                  <>
                    <RadioGroup
                      value={dnttModalMode}
                      onValueChange={(v) => setDnttModalMode(v as "full" | "deposit")}
                      className="space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="full" id="nh-full" />
                        <Label htmlFor="nh-full" className="text-xs cursor-pointer">
                          Toàn bộ — {fmt(effectiveTotalBua)} VND
                        </Label>
                      </div>
                      {dnttAlreadyPaid === 0 && (
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="deposit" id="nh-dep" />
                          <Label htmlFor="nh-dep" className="text-xs cursor-pointer">1 phần (cọc)</Label>
                        </div>
                      )}
                    </RadioGroup>
                    {dnttModalMode === "deposit" && dnttAlreadyPaid === 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">Số tiền cọc</Label>
                        <Input
                          type="number"
                          className="h-8 text-xs"
                          value={dnttDepositAmount || ""}
                          onChange={(e) => setDnttDepositAmount(Number(e.target.value) || 0)}
                          max={effectiveTotalBua}
                        />
                        {dnttDepositAmount > 0 && (
                          <p className="text-[11px] text-muted-foreground">Còn lại: {fmt(soTienConLai)} VND</p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {/* Ngày cần thanh toán */}
                <div className="space-y-1">
                  <Label className="text-xs">Ngày cần thanh toán</Label>
                  <DatePicker className="h-8 text-xs w-full" value={dnttNgayCan} onChange={setDnttNgayCan} />
                </div>
                <KSCongNoPanel
                  nccId={nh?.nha_cung_cap_id}
                  doanId={doanId}
                  maxAmount={
                    isBSMode
                      ? dnttBsAmount || 0
                      : dnttModalMode === "deposit"
                        ? dnttDepositAmount || 0
                        : effectiveTotalBua
                  }
                  value={canTruByMeal[dnttModalKey] ?? null}
                  onChange={(v) => setCanTruByMeal((prev) => ({ ...prev, [dnttModalKey]: v }))}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setDnttModalKey(null)}>
                  Hủy
                </Button>
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={handleDnttSubmit}
                  disabled={dnttSubmitting || soTien <= 0}
                >
                  Tạo đề nghị TT
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Adjustment Dialog — HYBRID: nhập SL + đơn giá thực tế (auto FOC + chiết khấu) */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) setAdjustTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Điều chỉnh bữa ăn thực tế</DialogTitle>
          </DialogHeader>
          {adjustTarget && (() => {
            const newSK  = parseInt(adjustSoKhach.replace(/\D/g, ""), 10) || 0;
            const newGia = parseFloat(adjustDonGia.replace(/\.$/, "")) || 0;
            const skTT = calcSoKhachThucTe(newSK, adjustTarget.focKhach, adjustTarget.focMien);
            const totalTruocCK = skTT * newGia;
            const ckTien = adjustTarget.ckPct > 0 ? Math.round(totalTruocCK * adjustTarget.ckPct / 100) : 0;
            const totalSauCK = totalTruocCK - ckTien;
            const oldSK = adjustTarget.chiPhi.so_luong;
            const oldGia = adjustTarget.chiPhi.don_gia;
            const oldTotal = Number(adjustTarget.chiPhi.thanh_tien_thuc_te ?? adjustTarget.chiPhi.tien_cong_ty ?? 0);
            const changed = newSK !== oldSK || newGia !== oldGia;
            return (
              <div className="space-y-3 py-1 text-sm">
                <p className="text-xs text-muted-foreground">{adjustTarget.mainMoTa}</p>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Hiện tại:</span>
                  <span className="font-medium tabular-nums">
                    {oldSK} × {fmt(oldGia)} = {fmt(oldTotal)} ₫
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Số khách thực tế</Label>
                    <Input
                      className="h-8 text-sm tabular-nums"
                      value={adjustSoKhach}
                      onChange={(e) => setAdjustSoKhach(e.target.value.replace(/\D/g, ""))}
                      placeholder="SK"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Đơn giá thực tế</Label>
                    <Input
                      className="h-8 text-sm tabular-nums"
                      inputMode="decimal"
                      value={adjustDonGia}
                      onChange={(e) => {
                        let s = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
                        const firstDot = s.indexOf(".");
                        if (firstDot >= 0) {
                          s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
                        }
                        setAdjustDonGia(s);
                      }}
                      placeholder="Đơn giá"
                    />
                  </div>
                </div>
                <div className="space-y-0.5 text-[11px] text-muted-foreground border-t pt-1.5">
                  {(adjustTarget.focKhach && adjustTarget.focMien) ? (
                    <div className="flex justify-between">
                      <span>FOC ({adjustTarget.focKhach} miễn {adjustTarget.focMien}):</span>
                      <span className="tabular-nums">{newSK} → tính {skTT} suất</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span>Tổng trước CK:</span>
                    <span className="tabular-nums">{fmt(totalTruocCK)} ₫</span>
                  </div>
                  {adjustTarget.ckPct > 0 && (
                    <div className="flex justify-between">
                      <span>Chiết khấu {adjustTarget.ckPct}%:</span>
                      <span className="tabular-nums">−{fmt(ckTien)} ₫</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-xs border-t pt-2">
                  <span className="text-muted-foreground">Tổng thực tế:</span>
                  <span className="font-semibold tabular-nums text-primary">{fmt(totalSauCK)} ₫</span>
                </div>
                {changed && (
                  <div className="text-[11px] text-muted-foreground">
                    Sau lưu, hệ thống tự tính chênh lệch toàn nhóm (main + extras) và hiện
                    nút "Ghi nhận công nợ" hoặc "Thanh toán bổ sung" ở cuối nhóm nếu cần.
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Lý do (optional)</Label>
                  <Textarea
                    className="text-xs min-h-[56px]"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="VD: 1 khách không đi do mệt..."
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAdjustTarget(null)}>Đóng</Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={
                updateActualMut.isPending ||
                !adjustTarget ||
                !adjustSoKhach || !adjustDonGia ||
                (parseInt(adjustSoKhach.replace(/\D/g, ""), 10) === adjustTarget?.chiPhi.so_luong &&
                 (parseFloat(adjustDonGia.replace(/\.$/, "")) || 0) === adjustTarget?.chiPhi.don_gia)
              }
              onClick={handleAdjustSubmit}
            >
              Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aggregate Commit Dialog — chốt chênh lệch sau adjust + extras */}
      <Dialog open={!!aggCommit} onOpenChange={o => { if (!o) { setAggCommit(null); setAggReason(""); setAggNgayCan(""); setAggSurplusMode("con_du"); setAggCanTru(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {aggCommit && aggCommit.delta > 0
                ? "Tạo ĐNTT bổ sung"
                : aggSurplusMode === "hoan_tien" ? "Ghi nhận hoàn tiền" : "Ghi nhận công nợ"}
            </DialogTitle>
          </DialogHeader>
          {aggCommit && (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-xs text-muted-foreground">{aggCommit.mainRow.mo_ta}</p>
              <div className="space-y-1 text-xs border rounded px-2 py-1.5 bg-muted/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tổng thực tế (nhóm):</span>
                  <span className="font-medium tabular-nums">{fmt(aggCommit.sumActual)} ₫</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Đã thanh toán:</span>
                  <span className="font-medium tabular-nums">{fmt(aggCommit.sumPaid)} ₫</span>
                </div>
                {aggCommit.groupCongNoCN > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">(−) Đã ghi nhận công nợ:</span>
                    <span className="font-medium tabular-nums">{fmt(aggCommit.groupCongNoCN)} ₫</span>
                  </div>
                )}
                {aggCommit.groupCongNoHT > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">(−) Đã hoàn tiền:</span>
                    <span className="font-medium tabular-nums">{fmt(aggCommit.groupCongNoHT)} ₫</span>
                  </div>
                )}
                {(aggCommit.groupCongNoCN > 0 || aggCommit.groupCongNoHT > 0) && (
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-muted-foreground">Còn cần thanh toán:</span>
                    <span className="font-medium tabular-nums">{fmt(aggCommit.sumPaid - aggCommit.groupCongNoCN - aggCommit.groupCongNoHT)} ₫</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">Chênh lệch còn lại:</span>
                  <span className={cn(
                    "font-semibold tabular-nums",
                    aggCommit.delta > 0 ? "text-orange-700" : "text-purple-700",
                  )}>
                    {aggCommit.delta > 0 ? "+" : "−"}{fmt(Math.abs(aggCommit.delta))} ₫
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                      ({aggCommit.delta > 0 ? "thiếu, cần thanh toán thêm" : "thừa"})
                    </span>
                  </span>
                </div>
              </div>
              {aggCommit.nccName && (
                <div className="text-xs text-muted-foreground">
                  NCC: <span className="font-medium text-foreground">{aggCommit.nccName}</span>
                </div>
              )}
              {aggCommit.delta > 0 && aggCommit.nccId != null && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Cấn trừ công nợ NCC (optional)</Label>
                  <KSCongNoPanel
                    nccId={aggCommit.nccId}
                    doanId={doanId}
                    value={aggCanTru}
                    onChange={(v) => {
                      if (v && aggCommit) {
                        const capped = Math.min(v.soTienCanTru, aggCommit.delta);
                        setAggCanTru({ ...v, soTienCanTru: capped });
                      } else {
                        setAggCanTru(v);
                      }
                    }}
                  />
                  {aggCanTru && aggCanTru.soTienCanTru > 0 && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      DNTT sẽ tạo: <span className="font-medium text-foreground">{fmt(aggCommit.delta)} ₫</span>
                      {" · "}Cấn trừ: <span className="font-medium text-amber-700">{fmt(aggCanTru.soTienCanTru)} ₫</span>
                      {" · "}Cash còn TT: <span className="font-medium text-foreground">{fmt(aggCommit.delta - aggCanTru.soTienCanTru)} ₫</span>
                    </p>
                  )}
                </div>
              )}
              {aggCommit.delta < 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Hình thức xử lý</Label>
                  <RadioGroup
                    value={aggSurplusMode}
                    onValueChange={(v) => setAggSurplusMode(v as "con_du" | "hoan_tien")}
                    className="space-y-1.5"
                  >
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="con_du" id="nh-agg-cn" className="mt-0.5" />
                      <Label htmlFor="nh-agg-cn" className="text-xs cursor-pointer leading-tight">
                        <span className="font-medium">Ghi nhận công nợ</span>
                        <p className="text-muted-foreground font-normal">NCC giữ tiền — có thể cấn trừ với DNTT khác cùng NCC</p>
                      </Label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="hoan_tien" id="nh-agg-ht" className="mt-0.5" />
                      <Label htmlFor="nh-agg-ht" className="text-xs cursor-pointer leading-tight">
                        <span className="font-medium">Ghi nhận hoàn tiền</span>
                        <p className="text-muted-foreground font-normal">NCC trả lại tiền cash — không cấn trừ</p>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
              {aggCommit.delta > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Ngày cần thanh toán</Label>
                  <DatePicker className="h-8 text-xs w-full" value={aggNgayCan} onChange={setAggNgayCan} />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Lý do (optional)</Label>
                <Textarea
                  className="text-xs min-h-[56px]"
                  value={aggReason}
                  onChange={e => setAggReason(e.target.value)}
                  placeholder={
                    aggCommit.delta > 0
                      ? "VD: phát sinh thêm 1 món tráng miệng..."
                      : "VD: 1 khách không đi do mệt..."
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs"
              onClick={() => { setAggCommit(null); setAggReason(""); setAggNgayCan(""); setAggSurplusMode("con_du"); setAggCanTru(null); }}>
              Đóng
            </Button>
            <Button
              size="sm"
              className={cn(
                "text-xs text-white",
                aggCommit && aggCommit.delta > 0
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-purple-600 hover:bg-purple-700",
              )}
              disabled={insertDNTT.isPending || !aggCommit}
              onClick={handleAggCommit}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {cancelTarget?.isPaid ? "Hủy khoản thanh toán" : "Hủy đề nghị thanh toán"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">{cancelTarget?.nhName}</p>
            {cancelTarget?.isPaid ? (
              <RadioGroup
                value={cancelMode}
                onValueChange={(v) => setCancelMode(v as "cong_no" | "hoan_tien")}
                className="space-y-2"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="hoan_tien" id="nh-hoan" className="mt-0.5" />
                  <Label htmlFor="nh-hoan" className="text-xs cursor-pointer">
                    <span className="font-medium">Hoàn lại tiền</span>
                    <p className="text-muted-foreground font-normal">Không ghi nhận công nợ</p>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="cong_no" id="nh-cno" className="mt-0.5" />
                  <Label htmlFor="nh-cno" className="text-xs cursor-pointer">
                    <span className="font-medium">Cấn trừ công nợ</span>
                    <p className="text-muted-foreground font-normal">Ghi nhận công nợ cho nhà cung cấp</p>
                  </Label>
                </div>
              </RadioGroup>
            ) : (
              <p className="text-xs">Đề nghị sẽ bị hủy, chi phí trở về trạng thái chưa gửi duyệt.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setCancelTarget(null)}>
              Đóng
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs"
              onClick={handleCancelSubmit}
              disabled={cancelMut.isPending}
            >
              Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DNTTNHPreviewModal
        open={!!previewNHData}
        data={previewNHData}
        onClose={() => setPreviewNHData(null)}
      />
    </div>
  );
});

export default ChiPhiNHSection;

// ─── Sub-components ───────────────────────────────────────────────────────────

function NHInput({
  value, onChange, onBlur, width = "w-[72px]", money = false, decimal = false,
}: {
  value: number;
  onChange: (v: number) => void;
  onBlur: () => void;
  width?: string;
  /** Hiển thị dấu chấm phân cách hàng nghìn cho dễ đọc (vd 850.000). */
  money?: boolean;
  /** Cho phép số thập phân (đơn giá). Focus → raw "1500.5"; blur → "1.500,5". */
  decimal?: boolean;
}) {
  if (decimal) {
    return (
      <DecimalInput
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className={`h-7 text-xs ${width} text-right`}
      />
    );
  }
  const formatVN = (n: number) => (n ? n.toLocaleString("vi-VN") : "");
  const [local, setLocal] = useState(money ? formatVN(value) : String(value));
  useEffect(() => { setLocal(money ? formatVN(value) : String(value)); }, [value, money]);
  return (
    <Input
      type={money ? "text" : "number"}
      inputMode="numeric"
      value={local}
      onChange={(e) => {
        if (money) {
          const digits = e.target.value.replace(/\D/g, "");
          setLocal(digits ? Number(digits).toLocaleString("vi-VN") : "");
        } else {
          setLocal(e.target.value);
        }
      }}
      onBlur={() => {
        const v = money ? Number(local.replace(/\D/g, "")) || 0 : Number(local) || 0;
        onChange(v);
        setTimeout(onBlur, 0);
      }}
      className={`h-7 text-xs ${width} ${money ? "text-right" : "text-center"} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
    />
  );
}

// ── NH FOC editor ────────────────────────────────────────────
// Edit FOC snapshot per-row (mỗi meal). Master không thay đổi.
function NHFocEditor({
  doanId, rowId, focKhach, focMien,
}: {
  doanId: number;
  rowId: number;
  focKhach: number | null;
  focMien: number | null;
}) {
  const qc = useQueryClient();
  // Hiển thị "" cho cả null và 0 → giữ placeholder "—" thống nhất khi không có FOC.
  const display = (n: number | null) => (n != null && n > 0 ? String(n) : "");
  const [k, setK] = useState(display(focKhach));
  const [m, setM] = useState(display(focMien));

  useEffect(() => { setK(display(focKhach)); }, [focKhach]);
  useEffect(() => { setM(display(focMien)); }, [focMien]);

  const save = async () => {
    // User clear ô → lưu 0 (KHÔNG null) để resolveNHFoc trust snapshot, KHÔNG
    // fallback về master (master có thể còn FOC, gây -1 dù user đã clear).
    const parse = (s: string): number => {
      const t = s.trim();
      if (t === "") return 0;
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const nextK = parse(k);
    const nextM = parse(m);
    const curK = focKhach ?? 0;
    const curM = focMien ?? 0;
    if (nextK === curK && nextM === curM) return;
    const { error } = await externalSupabase
      .from("doan_chi_phi")
      .update({ foc_khach_snapshot: nextK, foc_mien_snapshot: nextM })
      .eq("id", rowId);
    if (error) return;
    qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
  };

  return (
    <div className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground" title="FOC: cứ X khách miễn Y suất (per tour)">
      <span>FOC</span>
      <input
        value={k}
        onChange={(e) => setK(e.target.value)}
        onBlur={save}
        type="number"
        min={0}
        placeholder="—"
        className="w-7 h-5 px-0.5 text-[10px] text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background"
      />
      <span>免</span>
      <input
        value={m}
        onChange={(e) => setM(e.target.value)}
        onBlur={save}
        type="number"
        min={0}
        placeholder="—"
        className="w-7 h-5 px-0.5 text-[10px] text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background"
      />
    </div>
  );
}

