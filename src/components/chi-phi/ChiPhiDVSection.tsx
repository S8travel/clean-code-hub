import { useState, useEffect, useRef, useMemo, useCallback, useImperativeHandle, forwardRef } from "react";
import { format, subDays, parseISO, addDays } from "date-fns";
import { Check, Pencil, Printer, X, Ban, SlidersHorizontal, Plus, Trash2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { externalSupabase } from "@/lib/supabase-external";
import { useChiPhiList, useDNTTList, useInsertDNTT, useUpsertChiPhi, useDeleteChiPhi, useUpdateChiPhiActual } from "@/hooks/use-chi-phi";
import type { DNTTRow, ChiPhiRow } from "@/hooks/use-chi-phi";
import { useCancelDNTT, useUpdateDNTT, useCreateAdjustment, recalcChiPhiStatus } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi, createCanTruPayments } from "@/hooks/use-payments";
import { useCongNoList, appendCanTruLog, isDnttPaidFromPrepaid } from "@/hooks/use-cong-no";
import { sumCompanyChiPhi, splitGroupCongNo, calcAggregateDelta, calcDnttMismatch } from "@/lib/aggregate-calc";
import { useQueryClient } from "@tanstack/react-query";
import type { DNTTRow as DNTTRowDntt } from "@/hooks/use-dntt";
import type { NHDocData, NHDocEntry } from "@/lib/export-dntt-nh-word";
import DNTTNHPreviewModal from "./DNTTNHPreviewModal";
import { useCurrentUserName } from "@/hooks/use-doan";
import { useDVCanhDiemMap } from "@/hooks/use-chi-phi-nh";
import CatalogHoverCard from "./CatalogHoverCard";
import { type CanTruSelection } from "./KSCongNoPanel";
import { DVInput } from "./DVInput";
import DVDnttModal, { type DVModalTarget } from "./DVDnttModal";
import DVCancelModal, { type CancelTarget } from "./DVCancelModal";
import DVAdjustModal from "./DVAdjustModal";
import DVAggCommitModal, { type AggCommitTarget } from "./DVAggCommitModal";

const fmt = (n: number) => n.toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet: { text: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { text: "Đã duyệt",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { text: "Từ chối",   cls: "bg-red-100 text-red-700" },
};

interface LocalDVExtra {
  id?: number;
  mo_ta: string;
  so_luong: number;
  don_gia: number;
  nguoi_tt: "cong_ty" | "hdv";
}

interface Props {
  doanId: number;
  tenDoan?: string;
  ngayBatDau?: string;
}

export interface ChiPhiDVSectionHandle {
  buildSelectedEntries: () => Promise<NHDocEntry[] | undefined>;
  clearSelection: () => void;
  getSelectedCount: () => number;
}

const ChiPhiDVSection = forwardRef<ChiPhiDVSectionHandle, Props>(function ChiPhiDVSection({ doanId, tenDoan, ngayBatDau }, ref) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: paymentsList = [] } = usePaymentsByChiPhi(doanId);
  const { data: congNoList = [] } = useCongNoList({ doanId });

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
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const cancelMut = useCancelDNTT();
  const adjustMut = useCreateAdjustment();
  const updateActualMut = useUpdateChiPhiActual();
  const qc = useQueryClient();
  const dvCdMap = useDVCanhDiemMap(doanId);
  const [canTruByDv, setCanTruByDv] = useState<Record<number, CanTruSelection[]>>({});
  const [previewDVData, setPreviewDVData] = useState<NHDocData | null>(null);

  // Inline edit state for DNTT amount
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // Inline edit for row fields (so_luong, don_gia)
  const [editRow, setEditRow] = useState<Record<number, { so_luong: number; don_gia: number }>>({});

  // Extras state
  const [extrasMap, setExtrasMap] = useState<Record<number, LocalDVExtra[]>>({});
  const extrasMapRef = useRef(extrasMap);
  useEffect(() => { extrasMapRef.current = extrasMap; }, [extrasMap]);

  // Checkbox selection for batch print
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // ĐNTT modal
  const [dvModal, setDvModal] = useState<DVModalTarget | null>(null);
  const [dvModalMode, setDvModalMode] = useState<"full" | "deposit">("full");
  const [dvDepositAmount, setDvDepositAmount] = useState(0);
  const [dvNgayCan, setDvNgayCan] = useState("");

  // Adjust dialog (after payment)
  // HYBRID adjust: edit chi_phi state (SL + đơn giá). Aggregate commit ở footer.
  const [adjustChiPhi, setAdjustChiPhi] = useState<ChiPhiRow | null>(null);
  const [adjustSL, setAdjustSL]         = useState("");
  const [adjustDonGia, setAdjustDonGia] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Aggregate commit dialog (sau khi adjust + extras → commit chênh lệch)
  const [aggCommit, setAggCommit] = useState<AggCommitTarget | null>(null);
  const [aggReason, setAggReason] = useState("");
  const [aggNgayCan, setAggNgayCan] = useState("");
  // Surplus mode khi delta < 0 (thừa): NCC giữ tiền (con_du) hoặc NCC trả lại cash (hoan_tien)
  const [aggSurplusMode, setAggSurplusMode] = useState<"con_du" | "hoan_tien">("con_du");
  // Cấn trừ cong_no khi delta > 0 (thiếu): chọn cong_no NCC để giảm DNTT cash phần
  const [aggCanTru, setAggCanTru] = useState<CanTruSelection | null>(null);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // Split main rows vs extras
  const allDvRows = chiPhiRows.filter((r) => r.danh_muc === "canh_diem");
  const dvRows = allDvRows.filter((r) => !r.mo_ta?.match(/^\[dvps_\d+\] /));

  // Build dbExtrasMap from DB
  const dbExtrasMap = useMemo(() => {
    const map: Record<number, LocalDVExtra[]> = {};
    for (const row of allDvRows) {
      const m = row.mo_ta?.match(/^\[dvps_(\d+)\] (.*)/);
      if (!m) continue;
      const mainId = parseInt(m[1]);
      if (!map[mainId]) map[mainId] = [];
      map[mainId].push({
        id: row.id,
        mo_ta: m[2] || "",
        so_luong: row.so_luong,
        don_gia: row.don_gia,
        nguoi_tt: (row.tien_hdv ?? 0) > 0 ? "hdv" : "cong_ty",
      });
    }
    return map;
  }, [allDvRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // Init extrasMap from DB (once)
  const extrasInitRef = useRef(false);
  useEffect(() => {
    if (extrasInitRef.current) return;
    if (Object.keys(dbExtrasMap).length === 0 && allDvRows.some(r => !r.mo_ta?.match(/^\[dvps_\d+\] /))) {
      // Main rows exist but no extras yet — mark as initialized
      extrasInitRef.current = true;
      return;
    }
    if (Object.keys(dbExtrasMap).length === 0) return;
    setExtrasMap(dbExtrasMap);
    extrasInitRef.current = true;
  }, [dbExtrasMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when doanId changes
  useEffect(() => {
    extrasInitRef.current = false;
    setExtrasMap({});
    setSelectedIds([]);
  }, [doanId]);

  // Nhóm theo ngày
  const byDay = new Map<number, typeof dvRows>();
  for (const row of dvRows) {
    const day = row.ngay_so ?? 0;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(row);
  }
  const sortedDays = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  const total = dvRows.reduce((s, r) => s + r.tien_cong_ty + r.tien_hdv, 0);

  // ── Row field helpers ─────────────────────────────────────────────────────

  const getRowEdit = (row: typeof dvRows[0]) =>
    editRow[row.id] ?? { so_luong: row.so_luong, don_gia: row.don_gia };

  const handleRowChange = (id: number, field: "so_luong" | "don_gia", val: number) => {
    setEditRow(prev => {
      const base = dvRows.find(r => r.id === id);
      const existing = prev[id] ?? { so_luong: base?.so_luong ?? 0, don_gia: base?.don_gia ?? 0 };
      return { ...prev, [id]: { ...existing, [field]: val } };
    });
  };

  const handleRowSave = (row: typeof dvRows[0]) => {
    const local = editRow[row.id];
    if (!local) return;
    if (local.so_luong === row.so_luong && local.don_gia === row.don_gia) return;
    const total = local.so_luong * local.don_gia;
    const isHDV = row.tien_hdv > 0;
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      so_luong: local.so_luong,
      don_gia: local.don_gia,
      tien_cong_ty: isHDV ? 0 : total,
      tien_hdv: isHDV ? total : 0,
      // HYBRID: user edit trực tiếp = override → cascade Điều tour bỏ qua row này
      is_overridden: true,
    } as any, {
      onSuccess: () => setEditRow(prev => { const next = { ...prev }; delete next[row.id]; return next; }),
    });
  };

  // Reset override → fetch item từ doan_ngay_item, cascade chi_phi theo source
  // (so_luong, don_gia) + clear flag + clear thuc_te. User expect sync NGAY.
  const handleResetOverride = async (row: typeof dvRows[0]) => {
    if (!row.ref_doan_ngay_item_id) {
      // Extras (no item link) — chỉ clear flag
      upsertMut.mutate({ id: row.id, doan_id: doanId, is_overridden: false } as any);
      return;
    }
    const { data: item } = await externalSupabase
      .from("doan_ngay_item")
      .select("so_luong, don_gia")
      .eq("id", row.ref_doan_ngay_item_id)
      .single();
    if (!item) {
      // Fallback: chỉ clear flag (cascade lần sau sẽ sync)
      upsertMut.mutate({ id: row.id, doan_id: doanId, is_overridden: false } as any);
      return;
    }
    const isHdv = row.tien_hdv > 0;
    const newSoLuong = item.so_luong ?? 0;
    const newDonGia  = item.don_gia ?? 0;
    const newTotal   = newSoLuong * newDonGia;
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      so_luong: newSoLuong,
      don_gia: newDonGia,
      tien_cong_ty: isHdv ? 0 : newTotal,
      tien_hdv:     isHdv ? newTotal : 0,
      is_overridden: false,
      thanh_tien_thuc_te: null,
    } as any);
  };

  const handleToggleNguoiTt = (row: typeof dvRows[0]) => {
    const total = row.so_luong * row.don_gia;
    const next = row.tien_hdv > 0 ? "cong_ty" : "hdv";
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      tien_cong_ty: next === "cong_ty" ? total : 0,
      tien_hdv: next === "hdv" ? total : 0,
    } as any);
  };

  // ── Extra handlers ────────────────────────────────────────────────────────

  const handleExtraAdd = (mainId: number) => {
    setExtrasMap((prev) => ({
      ...prev,
      [mainId]: [...(prev[mainId] || []), { mo_ta: "", so_luong: 1, don_gia: 0, nguoi_tt: "cong_ty" }],
    }));
  };

  const handleExtraChange = (mainId: number, idx: number, field: keyof LocalDVExtra, value: any) => {
    setExtrasMap((prev) => {
      const list = [...(prev[mainId] || [])];
      list[idx] = { ...list[idx], [field]: value };
      return { ...prev, [mainId]: list };
    });
  };

  const handleExtraSave = (mainId: number, idx: number, nguoiTtOverride?: "cong_ty" | "hdv") => {
    const extra = extrasMapRef.current[mainId]?.[idx];
    const mainRow = dvRows.find((r) => r.id === mainId);
    if (!extra || !mainRow || (!extra.mo_ta && !extra.don_gia)) return;

    const thanhTien = extra.so_luong * extra.don_gia;
    const nguoiTt = nguoiTtOverride ?? extra.nguoi_tt;

    upsertMut.mutate({
      id: extra.id,
      doan_id: doanId,
      ngay_so: mainRow.ngay_so,
      loai: "chi",
      danh_muc: "canh_diem",
      ref_doan_ngay_id: mainRow.ref_doan_ngay_id,
      mo_ta: `[dvps_${mainId}] ${extra.mo_ta}`,
      don_gia: extra.don_gia,
      so_luong: extra.so_luong,
      tien_cong_ty: nguoiTt !== "hdv" ? thanhTien : 0,
      tien_hdv: nguoiTt === "hdv" ? thanhTien : 0,
    } as any, {
      onSuccess: (data) => {
        if (!extra.id && data?.id) {
          setExtrasMap((prev) => {
            const list = [...(prev[mainId] || [])];
            list[idx] = { ...list[idx], id: data.id };
            return { ...prev, [mainId]: list };
          });
        }
      },
    });
  };

  const handleExtraDelete = (mainId: number, idx: number) => {
    const extra = extrasMap[mainId]?.[idx];
    const remove = () =>
      setExtrasMap((prev) => {
        const list = [...(prev[mainId] || [])];
        list.splice(idx, 1);
        return { ...prev, [mainId]: list };
      });
    if (extra?.id) {
      deleteMut.mutate({ id: extra.id, doanId }, { onSuccess: remove });
    } else {
      remove();
    }
  };

  // ── Date label ────────────────────────────────────────────────────────────

  const getDateLabel = (ngaySo: number | null): string => {
    if (!ngaySo || ngaySo <= 0) return "—";
    if (!ngayBatDau) return `Ngày ${ngaySo}`;
    try {
      const d = addDays(parseISO(ngayBatDau), ngaySo - 1);
      return format(d, "d/M");
    } catch {
      return `Ngày ${ngaySo}`;
    }
  };

  // ── Định kỳ toggle ────────────────────────────────────────────────────────

  const handleToggleDinhKy = (row: typeof dvRows[0]) => {
    const newVal = !row.thanh_toan_dinh_ky;
    upsertMut.mutate({ id: row.id, doan_id: doanId, thanh_toan_dinh_ky: newVal } as any, {
      onSuccess: () => toast.success(newVal ? "Đã bật thanh toán định kỳ" : "Đã tắt thanh toán định kỳ"),
    });
  };

  // ── ĐNTT handlers ─────────────────────────────────────────────────────────

  const openDvModal = (chiPhiId: number, thanhTien: number, moTa: string, nccId: number | null, ngaySo: number | null) => {
    let ngayCan = "";
    if (ngayBatDau && ngaySo != null && ngaySo > 0) {
      try {
        const serviceDate = new Date(parseISO(ngayBatDau));
        serviceDate.setDate(serviceDate.getDate() + ngaySo - 1);
        ngayCan = format(subDays(serviceDate, 1), "yyyy-MM-dd");
      } catch { /* ignore */ }
    }
    setDvModal({ chiPhiId, thanhTien, moTa, nccId, nhaySo: ngaySo });
    setDvModalMode("full");
    setDvDepositAmount(0);
    setDvNgayCan(ngayCan);
  };

  const handleDvModalSubmit = async () => {
    if (!dvModal) return;
    const { chiPhiId, thanhTien, moTa, nccId } = dvModal;
    const sels = canTruByDv[chiPhiId] ?? [];
    const baseAmount = dvModalMode === "full" ? thanhTien : dvDepositAmount;
    // Gộp nhiều cấn trừ cùng NCC — clamp tổng ≤ baseAmount
    const canTruItems: { congNoId: number; soTien: number; sourceTenDoan: string }[] = [];
    let ctRemain = baseAmount;
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
    const fullAmount = baseAmount;
    if (fullAmount <= 0) { toast.error("Số tiền phải lớn hơn 0"); return; }
    if (dvModalMode === "deposit" && dvDepositAmount >= thanhTien) { toast.error("Số tiền cọc phải nhỏ hơn tổng tiền"); return; }
    try {
      const mainRecord = await insertDNTT.mutateAsync({
        doan_id: doanId,
        loai: "dich_vu",
        mo_ta: moTa || tenDoan || "Dịch vụ",
        nha_cung_cap_id: nccId,
        so_tien: fullAmount,
        la_coc: dvModalMode === "deposit",
        trang_thai_duyet: "cho_duyet",
        ref_loai: "doan_chi_phi",
        ref_id: chiPhiId,
        ngay_can_thanh_toan: dvNgayCan || null,
        allocations: [{ chi_phi_id: chiPhiId, so_tien: fullAmount }],
      } as any);
      const mainDvId = (mainRecord as any)?.id ?? null;

      if (canTruAmount > 0 && nccId && mainDvId) {
        await createCanTruPayments({
          dnttId: mainDvId,
          consumingDoanLog: tenDoan || `#${doanId}`,
          items: canTruItems,
          recalcChiPhiIds: [chiPhiId],
        });
        setCanTruByDv((prev) => ({ ...prev, [chiPhiId]: [] }));
        qc.invalidateQueries({ queryKey: ["cong-no"] });
        qc.invalidateQueries({ queryKey: ["cong-no-by-ncc"] });
        qc.invalidateQueries({ queryKey: ["payments-by-chi-phi", doanId] });
      }
      qc.invalidateQueries({ queryKey: ["de_nghi_thanh_toan", doanId] });
      qc.invalidateQueries({ queryKey: ["dntt-list"] });

      toast.success("Đã gửi ĐNTT");
      setDvModal(null);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || "Không thể tạo ĐNTT"));
    }
  };

  const handleEditSave = (id: number) => {
    const v = parseInt(editAmount.replace(/\D/g, ""), 10);
    if (!v || v <= 0) { toast.error("Số tiền không hợp lệ"); return; }
    updateDNTT.mutate({ id, soTien: v }, {
      onSuccess: () => { toast.success("Đã cập nhật"); setEditingId(null); },
    });
  };

  const handleCancel = () => {
    if (!cancelTarget) return;
    cancelMut.mutate(
      { id: cancelTarget.dnttId, mode: cancelTarget.isPaid ? cancelMode : undefined },
      {
        onSuccess: () => { toast.success("Đã hủy"); setCancelTarget(null); },
        onError: (err: any) => toast.error(err?.message || "Lỗi khi hủy"),
      },
    );
  };

  // ── Aggregate commit (chênh lệch sau adjust + extras) ───────────────────────

  const handleAdjustSubmit = () => {
    if (!adjustChiPhi) return;
    const newSL  = parseInt(adjustSL.replace(/\D/g, ""), 10);
    const newGia = parseFloat(adjustDonGia.replace(/\.$/, "")) || 0;
    if (isNaN(newSL) || !newGia) return;
    updateActualMut.mutate(
      { id: adjustChiPhi.id, doan_id: doanId, so_luong: newSL, don_gia: newGia, ly_do: adjustReason },
      {
        onSuccess: () => {
          toast.success("Đã cập nhật chi phí thực tế");
          setAdjustChiPhi(null);
        },
        onError: (err: any) => toast.error(err?.message || "Lỗi cập nhật"),
      },
    );
  };

  const handleAggCommit = async () => {
    if (!aggCommit) return;
    const { mainRow, delta, paidDntt } = aggCommit;
    const absDelta = Math.abs(delta);
    if (!mainRow.nha_cung_cap_id) {
      toast.error("Chi phí không có NCC — không thể tạo công nợ/ĐNTT bổ sung");
      return;
    }
    try {
      if (delta < 0) {
        // Thừa → tạo cong_no (con_du = NCC giữ credit, hoan_tien = NCC trả cash)
        const trang_thai = aggSurplusMode === "hoan_tien" ? "da_hoan_tien" : "con_du";
        const lyDoLabel = aggSurplusMode === "hoan_tien" ? "hoàn tiền" : "công nợ";
        // Thừa của ĐNTT đã trả bằng cấn trừ quỹ trả trước → quay lại pool trả trước
        const fromPrepaid =
          trang_thai === "con_du" && (await isDnttPaidFromPrepaid(paidDntt?.id));
        const { error } = await externalSupabase.from("cong_no").insert({
          doan_id: doanId,
          dntt_goc_id: paidDntt?.id ?? null,
          nha_cung_cap_id: mainRow.nha_cung_cap_id,
          ten_nha_cung_cap: paidDntt?.ten_nha_cung_cap ?? null,
          so_tien_goc: absDelta,
          trang_thai,
          loai: fromPrepaid ? "tra_truoc" : "phat_sinh",
          ly_do: aggReason
            ? `Điều chỉnh giảm chi phí (${mainRow.mo_ta || ""}) — ${lyDoLabel}. Lý do: ${aggReason}`
            : `Điều chỉnh giảm chi phí (${mainRow.mo_ta || ""}) — ${lyDoLabel}`,
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
          loai: "dich_vu",
          mo_ta: `[Bổ sung] ${mainRow.mo_ta || "Dịch vụ"}`.trim(),
          nha_cung_cap_id: mainRow.nha_cung_cap_id,
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

        // Insert can_tru payment nếu user select cong_no
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

  // ── Print handler ─────────────────────────────────────────────────────────

  const buildSelectedEntries = useCallback(async (): Promise<NHDocEntry[] | undefined> => {
    if (selectedIds.length === 0) return undefined;
    const entries: NHDocEntry[] = [];
    const canTruShownByNcc: Record<number, boolean> = {};

    // Fetch tai_khoan_thanh_toan from canh_diem via doan_ngay_item
    const refItemIds = dvRows
      .filter((r) => r.id && selectedIds.includes(r.id) && r.ref_doan_ngay_item_id)
      .map((r) => r.ref_doan_ngay_item_id as number);
    const tkttMap: Record<number, string | null> = {};
    if (refItemIds.length > 0) {
      const { data: ngayItems } = await externalSupabase
        .from("doan_ngay_item")
        .select("id, canh_diem:canh_diem_id(tai_khoan_thanh_toan)")
        .in("id", refItemIds);
      for (const item of ngayItems ?? []) {
        tkttMap[item.id] = (item.canh_diem as any)?.tai_khoan_thanh_toan ?? null;
      }
    }

    // Fetch NCC info (ten, so_tai_khoan, ngan_hang) cho rows chưa có DNTT
    // — DNTT có sẵn các field này, dùng làm fallback khi row không có DNTT.
    const nccIds = Array.from(
      new Set(
        dvRows
          .filter((r) => r.id && selectedIds.includes(r.id) && r.nha_cung_cap_id)
          .map((r) => r.nha_cung_cap_id as number),
      ),
    );
    const nccMap: Record<number, { ten: string; so_tai_khoan?: string; ngan_hang?: string }> = {};
    if (nccIds.length > 0) {
      const { data: nccs } = await externalSupabase
        .from("nha_cung_cap")
        .select("id, ten, so_tai_khoan, ngan_hang")
        .in("id", nccIds);
      for (const ncc of nccs ?? []) {
        nccMap[ncc.id] = {
          ten: ncc.ten,
          so_tai_khoan: ncc.so_tai_khoan ?? undefined,
          ngan_hang: ncc.ngan_hang ?? undefined,
        };
      }
    }

      for (const [day, rows] of sortedDays) {
        for (const row of rows) {
          if (!row.id || !selectedIds.includes(row.id)) continue;

          const chiPhiId = row.id;
          const allDntts = dnttList.filter(
            (d) => d.ref_loai === "doan_chi_phi" && d.ref_id === chiPhiId,
          );
          const activeDntts = allDntts.filter(
            (d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
          );
          // Cho phép in cả khi chưa có DNTT — dùng NCC info từ nha_cung_cap fallback.
          const activeDntt = activeDntts[0] ?? null;

          const rowExtras = (extrasMap[row.id!] ?? []).filter((e) => e.nguoi_tt !== "hdv" && e.don_gia > 0);
          const extrasTotal = rowExtras.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
          const thanhTien = row.tien_cong_ty + extrasTotal;

          // ĐNTT đang chờ in: chưa hủy/từ chối/paid. Ưu tiên cọc.
          const liveDntts = activeDntts.filter((d) => d.payment_status !== "paid");
          const pendingDntt = liveDntts.find((d) => d.la_coc) ?? liveDntts[0] ?? null;

          // Có pending → in chính ĐNTT đó, không trừ cọc paid khác.
          const soCoc = pendingDntt
            ? 0
            : allDntts
                .filter((d) => d.la_coc && d.trang_thai_duyet !== "da_huy" && d.payment_status === "paid")
                .reduce((s, d) => s + d.so_tien, 0);

          const nccId = row.nha_cung_cap_id ?? null;
          let canTruAmount = 0;
          if (nccId && !canTruShownByNcc[nccId]) {
            canTruAmount = pendingDntt
              ? paymentsList
                  .filter((p) => p.dntt_id === pendingDntt.id && p.method === "can_tru")
                  .reduce((s, p) => s + p.payment_so_tien, 0)
              : paymentsList
                  .filter((p) => p.chi_phi_id === chiPhiId && p.method === "can_tru")
                  .reduce((s, p) => s + p.payment_so_tien, 0);
            if (canTruAmount > 0) canTruShownByNcc[nccId] = true;
          }

          // Pending → in đúng so_tien ĐNTT đó (trừ cấn trừ); không có → còn lại.
          const soTienConTT = pendingDntt
            ? Math.max(0, pendingDntt.so_tien - canTruAmount)
            : Math.max(0, thanhTien - soCoc - canTruAmount);
          const ngayDisplay = getDateLabel(day > 0 ? day : null);

          // Resolve NCC: ưu tiên DNTT snapshot, fallback nha_cung_cap master
          const nccFromDntt = activeDntt?.ten_nha_cung_cap
            ? {
                ten: activeDntt.ten_nha_cung_cap,
                so_tai_khoan: activeDntt.so_tai_khoan || undefined,
                ngan_hang: activeDntt.ngan_hang || undefined,
              }
            : null;
          const nccFromMaster = nccId ? nccMap[nccId] : undefined;
          const nccFinal = nccFromDntt ?? nccFromMaster ?? null;

          entries.push({
            ngay_date: ngayDisplay,
            ten_nh: row.mo_ta || "Dịch vụ",
            so_khach: row.so_luong,
            foc_khach: null,
            foc: null,
            items: [
              { so_luong: row.so_luong, don_gia: row.don_gia, ghi_chu: "" },
              ...rowExtras.map((e) => ({ so_luong: e.so_luong, don_gia: e.don_gia, ghi_chu: e.mo_ta || "" })),
            ],
            ncc: nccFinal,
            so_tien_coc: soCoc,
            can_tru: canTruAmount,
            so_tien_con_tt: soTienConTT,
            la_coc: !!pendingDntt?.la_coc,
            tai_khoan_thanh_toan: row.ref_doan_ngay_item_id
              ? (tkttMap[row.ref_doan_ngay_item_id] ?? null)
              : null,
          });
        }
      }

    return entries;
  }, [selectedIds, dvRows, dnttList, paymentsList, extrasMap, sortedDays]);

  const handlePrintSelected = async () => {
    try {
      const entries = await buildSelectedEntries();
      if (!entries || entries.length === 0) {
        toast.error("Không có dịch vụ nào được chọn để xuất");
        return;
      }
      setPreviewDVData({
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
    clearSelection: () => setSelectedIds([]),
    getSelectedCount: () => selectedIds.length,
  }), [buildSelectedEntries, selectedIds.length]);

  // ── Render ────────────────────────────────────────────────────────────────

  // Empty state — return SAU mọi hook (Rules of Hooks).
  if (dvRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        🎫 Chưa có dịch vụ nào trong chương trình.
        <br />
        <span className="text-xs">Vào mục Điều Tour → thêm dịch vụ có phí vào chương trình ngày.</span>
      </div>
    );
  }

  const allSelected = selectedIds.length === dvRows.length && dvRows.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-purple-900">🎫 Dịch vụ</p>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <Button size="sm" className="h-7 text-xs" onClick={handlePrintSelected}>
                <Printer className="h-3.5 w-3.5 mr-1" />
                In ĐNTT ({selectedIds.length})
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds([])}>
                Bỏ chọn
              </Button>
            </>
          )}
          <span className="text-xs text-muted-foreground">Tổng: {fmt(total)} ₫</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <colgroup>
            <col style={{ width: "32px" }} />
            <col style={{ width: "60px" }} />
            <col />
            <col style={{ width: "60px" }} />
            <col style={{ width: "136px" }} />
            <col style={{ width: "120px" }} />
            <col style={{ width: "76px" }} />
            <col style={{ width: "180px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "130px" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/20 text-[11px] font-medium text-muted-foreground">
              <th className="px-2 py-2.5 text-center">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => v ? setSelectedIds(dvRows.map(r => r.id!)) : setSelectedIds([])}
                  className="h-3.5 w-3.5"
                />
              </th>
              <th className="text-left px-3 py-2.5">Ngày</th>
              <th className="text-left px-3 py-2.5">Dịch vụ</th>
              <th className="text-center px-2 py-2.5">SL</th>
              <th className="text-center px-3 py-2.5">Đơn giá</th>
              <th className="text-right px-3 py-2.5">Thành tiền</th>
              <th className="text-center px-2 py-2.5">Nguồn</th>
              <th className="text-center px-3 py-2.5">TT ĐNTT</th>
              <th className="text-center px-3 py-2.5">TT Thanh toán</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedDays.map(([day, rows]) =>
              rows.map((row, i) => {
                const local = getRowEdit(row);
                const thanhTienLocal = local.so_luong * local.don_gia;
                const nguoiTt = row.tien_hdv > 0 ? "hdv" : "cong_ty";

                const allDntts = dnttList.filter(
                  d => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id,
                );
                const activeDntts = allDntts.filter(
                  d => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
                );
                const rejectedDntts = allDntts.filter(d => d.trang_thai_duyet === "tu_choi");
                const paidDntts = activeDntts.filter(d => d.payment_status === "paid");
                const pendingDntts = activeDntts.filter(d => d.payment_status !== "paid");
                const daTT = activeDntts.reduce((s, d) => s + (d.paid_amount || 0), 0);
                const daDeNghi = pendingDntts.reduce((s, d) => s + (d.so_tien - (d.paid_amount || 0)), 0);
                const thanhTien = row.tien_cong_ty;
                const rowExtras = extrasMap[row.id!] || [];
                const extrasCtTotal = rowExtras
                  .filter(e => e.nguoi_tt !== "hdv")
                  .reduce((s, e) => s + e.so_luong * e.don_gia, 0);
                const totalTienCt = thanhTien + extrasCtTotal;
                const canTruAmtForDv = row.id
                  ? paymentsList.filter((p) => p.chi_phi_id === row.id && p.method === "can_tru")
                      .reduce((s, p) => s + p.payment_so_tien, 0)
                  : 0;
                const isDaTT = totalTienCt > 0 && daTT >= totalTienCt;
                const conLai = Math.max(0, totalTienCt - daTT);
                const dnttIds = allDntts.map((d) => d.id);
                const congNoAmount = congNoList
                  .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "con_du")
                  .reduce((s, c) => s + c.so_tien_con_lai, 0);
                const hoanTienAmount = congNoList
                  .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "da_hoan_tien")
                  .reduce((s, c) => s + c.so_tien_goc, 0);
                // Hoàn tiền chỉ ẩn row khi DNTT đã bị cancel hết (legacy cancelDNTT flow).
                // Hoàn tiền partial từ aggregate commit (DNTTs vẫn active) → giữ row hiển thị.
                if (hoanTienAmount > 0 && activeDntts.length === 0) return [] as any;
                // Tổng cong_no đã ghi nhận cho group này (con_du + da_can_tru + da_hoan_tien).
                // Dùng để effectiveDelta + effectiveCommitted: trừ phần NCC đã credit/refund khỏi
                // sumPaid/sumCommitted → biết phần thực sự còn lệch chưa xử lý.
                // Split CN (con_du + da_can_tru) vs HT (da_hoan_tien) cho display modal.
                const groupCongNoForGroup = congNoList.filter(
                  (c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id),
                );
                const { groupCongNoCN, groupCongNoHT, groupCongNoTotal } =
                  splitGroupCongNo(groupCongNoForGroup);
                const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
                const canCancel = activeDntt && (
                  activeDntt.trang_thai_duyet === "cho_duyet" ||
                  activeDntt.trang_thai_duyet === "da_duyet" ||
                  activeDntt.payment_status === "paid"
                );
                const shownDntts = [...activeDntts, ...rejectedDntts];
                const isSelected = row.id != null && selectedIds.includes(row.id);

                // Aggregate-after-edits delta (CHỈ phần công ty thanh toán).
                // Bao gồm main row + extras chi_phi rows từ DB (filter prefix [dvps_<id>]).
                const extraChiPhiRows = allDvRows.filter(r =>
                  r.mo_ta?.startsWith(`[dvps_${row.id}] `),
                );
                const groupChiPhi = [row, ...extraChiPhiRows];
                const { sumActual, sumPaid } = sumCompanyChiPhi(groupChiPhi);
                const sumCommitted = activeDntts.reduce((s, d) => s + Number(d.so_tien), 0);
                const { effectiveDelta, effectiveCommitted } = calcAggregateDelta({
                  sumActual, sumPaid, sumCommitted, groupCongNoTotal,
                });
                const showAggBtn =
                  nguoiTt === "cong_ty" &&
                  daDeNghi === 0 &&
                  sumPaid > 0 &&
                  effectiveDelta !== 0;
                const aggPaidDntt = paidDntts[0] ?? null;
                const hasCommittedDntt = activeDntts.some(d =>
                  d.trang_thai_duyet === "cho_duyet" || d.trang_thai_duyet === "da_duyet",
                );
                // Ẩn badge khi nút footer hiện (trùng thông tin).
                const dnttMismatch = calcDnttMismatch({
                  sumActual, effectiveCommitted, hasCommittedDntt, showAggBtn,
                });

                return [
                  <tr key={row.id} className={cn("hover:bg-muted/20", isSelected && "bg-primary/5")}>
                    {/* Checkbox — per main row (không gộp theo ngày) */}
                    <td className="px-2 py-2.5 text-center align-top">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(v) => {
                          if (!row.id) return;
                          setSelectedIds(prev => v ? [...prev, row.id!] : prev.filter(id => id !== row.id));
                        }}
                        className="h-3.5 w-3.5"
                      />
                    </td>

                    {/* Ngày — per main row */}
                    <td className="px-3 py-2.5 text-muted-foreground align-top whitespace-nowrap text-[11px]">
                      {getDateLabel(day > 0 ? day : null)}
                    </td>

                    {/* Dịch vụ */}
                    <td className="px-3 py-2.5 font-medium">
                      <CatalogHoverCard info={
                        row.ref_doan_ngay_item_id && dvCdMap[row.ref_doan_ngay_item_id]
                          ? { kind: "dv", ten: row.mo_ta || "Dịch vụ", ...dvCdMap[row.ref_doan_ngay_item_id] }
                          : null
                      }>
                        <span>{row.mo_ta || "—"}</span>
                      </CatalogHoverCard>
                    </td>

                    {/* SL — editable. HYBRID: lock khi đã thanh toán; show 🔒 + ↺ khi override. */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        {(() => {
                          const isPaid = row.trang_thai_thanh_toan === "paid" || row.trang_thai_thanh_toan === "partial_paid";
                          if (isPaid) {
                            return (
                              <span className="text-sm tabular-nums cursor-help" title="Đã có thanh toán — dùng nút Điều chỉnh để track công nợ">
                                {row.so_luong}
                              </span>
                            );
                          }
                          return (
                            <>
                              <DVInput
                                value={local.so_luong}
                                onChange={v => handleRowChange(row.id, "so_luong", v)}
                                onBlur={() => handleRowSave(row)}
                                width="w-[44px]"
                              />
                              {row.is_overridden && (
                                <span title="Đã override — không sync với Điều tour" className="text-amber-500 text-[10px]">🔒</span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </td>

                    {/* Đơn giá — editable + lock khi đã thanh toán */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        {(() => {
                          const isPaid = row.trang_thai_thanh_toan === "paid" || row.trang_thai_thanh_toan === "partial_paid";
                          if (isPaid) {
                            return (
                              <span className="text-sm tabular-nums cursor-help" title="Đã có thanh toán — dùng nút Điều chỉnh để track công nợ">
                                {fmt(row.don_gia)}
                              </span>
                            );
                          }
                          return (
                            <DVInput
                              value={local.don_gia}
                              onChange={v => handleRowChange(row.id, "don_gia", v)}
                              onBlur={() => handleRowSave(row)}
                              width="w-[112px]"
                              money
                              decimal
                            />
                          );
                        })()}
                        {row.is_overridden && row.trang_thai_thanh_toan !== "paid" && row.trang_thai_thanh_toan !== "partial_paid" && (
                          <button
                            type="button"
                            onClick={() => handleResetOverride(row)}
                            title="Reset override → sync lại từ Điều tour lần save tới"
                            className="text-muted-foreground hover:text-primary text-[10px]"
                          >↺</button>
                        )}
                      </div>
                    </td>

                    {/* Thành tiền */}
                    <td className="px-3 py-2.5 text-right font-semibold text-primary whitespace-nowrap">
                      {fmt(thanhTienLocal)} ₫
                    </td>

                    {/* Ai trả — badge */}
                    <td className="px-2 py-2.5 text-center">
                      <button
                        onClick={() => handleToggleNguoiTt(row)}
                        disabled={upsertMut.isPending}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
                          nguoiTt === "cong_ty"
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                            : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
                        )}
                      >
                        {nguoiTt === "cong_ty" ? "Công ty" : "HDV"}
                      </button>
                    </td>

                    {/* TT ĐNTT */}
                    <td className="px-3 py-2.5 align-top text-center">
                      {nguoiTt === "hdv" ? (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      ) : shownDntts.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5 items-center">
                          {shownDntts.map(d => {
                            const isRejected = d.trang_thai_duyet === "tu_choi";
                            const statusInfo = STATUS_LABEL[d.trang_thai_duyet] ?? STATUS_LABEL.cho_duyet;
                            return (
                              <div key={d.id} className="flex items-center gap-0.5">
                                {isRejected ? (
                                  <span className={`px-1 py-px rounded text-[10px] leading-tight font-medium whitespace-nowrap ${statusInfo.cls}`}>
                                    {statusInfo.text} · {fmt(d.so_tien)}
                                  </span>
                                ) : editingId === d.id ? (
                                  <>
                                    <Input autoFocus type="number" value={editAmount}
                                      onChange={e => setEditAmount(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") handleEditSave(d.id);
                                        if (e.key === "Escape") setEditingId(null);
                                      }}
                                      className="h-5 w-20 text-[10px] px-1.5 py-0" />
                                    <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-emerald-600"
                                      disabled={updateDNTT.isPending}
                                      onClick={() => handleEditSave(d.id)}>
                                      <Check className="h-2.5 w-2.5" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-muted-foreground"
                                      onClick={() => setEditingId(null)}>
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
                                          <span className={`px-1 py-px rounded text-[10px] leading-tight font-medium whitespace-nowrap ${statusInfo.cls}`}>
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
                                      <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-blue-500"
                                        title="Sửa số tiền"
                                        onClick={() => { setEditingId(d.id); setEditAmount(String(d.so_tien)); }}>
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

                    {/* TT Thanh toán */}
                    <td className="px-3 py-2.5 align-top">
                      {nguoiTt === "hdv" ? (
                        <span className="text-[10px] text-muted-foreground flex justify-center">—</span>
                      ) : (
                      <div className="flex flex-col gap-0.5 items-center">
                        {activeDntts.map(d => (
                          <div key={d.id}>
                            {d.payment_status === "paid" ? (
                              <span className="px-1 py-px rounded text-[10px] leading-tight font-medium bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                Đã TT{d.thanh_toan_luc ? ` ${format(new Date(d.thanh_toan_luc), "dd/MM")}` : ""}
                              </span>
                            ) : (
                              <span className="px-1 py-px rounded text-[10px] leading-tight font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">
                                Chờ UNC · {fmt(d.so_tien - (d.paid_amount || 0))}
                              </span>
                            )}
                          </div>
                        ))}
                        {congNoAmount > 0 && (
                          <span className="px-1 py-px rounded text-[10px] leading-tight font-medium bg-purple-100 text-purple-700 whitespace-nowrap">
                            CN: {fmt(congNoAmount)}
                          </span>
                        )}
                        {hoanTienAmount > 0 && (
                          <span className="px-1 py-px rounded text-[10px] leading-tight font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
                            HT: {fmt(hoanTienAmount)}
                          </span>
                        )}
                        {activeDntts.length === 0 && congNoAmount === 0 && hoanTienAmount === 0 && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {nguoiTt === "cong_ty" && paidDntts.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-500 hover:text-blue-600"
                            title="Điều chỉnh số lượng / đơn giá thực tế"
                            onClick={() => {
                              setAdjustChiPhi(row);
                              setAdjustSL(String(row.so_luong));
                              setAdjustDonGia(row.don_gia ? String(row.don_gia) : "");
                              setAdjustReason("");
                            }}>
                            <SlidersHorizontal className="h-3 w-3" />
                          </Button>
                        )}
                        {nguoiTt === "cong_ty" && canCancel && activeDntt && (activeDntt.payment_status !== "paid" || groupCongNoTotal < sumPaid) && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            title="Hủy ĐNTT"
                            onClick={() => {
                              setCancelMode("hoan_tien");
                              setCancelTarget({ dnttId: activeDntt.id, isPaid: activeDntt.payment_status === "paid" });
                            }}>
                            <Ban className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm"
                          className={cn("h-7 text-xs px-2 gap-1", row.thanh_toan_dinh_ky ? "text-indigo-700 hover:text-indigo-800" : "text-muted-foreground hover:text-foreground")}
                          title={row.thanh_toan_dinh_ky ? "Đang định kỳ — bấm để tắt" : "Đặt thanh toán định kỳ"}
                          disabled={upsertMut.isPending}
                          onClick={() => handleToggleDinhKy(row)}>
                          <CalendarClock className="h-3.5 w-3.5" />
                          {row.thanh_toan_dinh_ky && "Định kỳ"}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          title="Thêm dịch vụ phát sinh"
                          onClick={() => handleExtraAdd(row.id!)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        {nguoiTt === "cong_ty" && !row.thanh_toan_dinh_ky && activeDntts.length === 0 && totalTienCt > 0 && (
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                            onClick={() => openDvModal(row.id!, totalTienCt, row.mo_ta || "", row.nha_cung_cap_id, row.ngay_so)}>
                            ĐNTT
                          </Button>
                        )}
                        {/* "ĐNTT bổ sung" cũ — REMOVED, replaced by aggregate footer button (showAggBtn) */}
                      </div>
                    </td>
                  </tr>,
                  /* Extra rows for this main row */
                  ...rowExtras.map((extra, idx) => (
                    <tr key={`extra-${row.id}-${idx}`} className="bg-muted/10 hover:bg-muted/20">
                      <td /> {/* skip checkbox */}
                      <td /> {/* skip ngày */}
                      {/* Tên dịch vụ phát sinh */}
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground shrink-0">↳</span>
                          <Input
                            className="h-6 text-xs px-1.5 py-0 flex-1"
                            placeholder="Tên dịch vụ phát sinh..."
                            value={extra.mo_ta}
                            onChange={(e) => handleExtraChange(row.id!, idx, "mo_ta", e.target.value)}
                            onBlur={() => handleExtraSave(row.id!, idx)}
                          />
                        </div>
                      </td>
                      {/* SL */}
                      <td className="px-2 py-1.5">
                        <div className="flex justify-center">
                          <DVInput
                            value={extra.so_luong}
                            onChange={v => handleExtraChange(row.id!, idx, "so_luong", v)}
                            onBlur={() => handleExtraSave(row.id!, idx)}
                            width="w-[44px]"
                          />
                        </div>
                      </td>
                      {/* Đơn giá */}
                      <td className="px-3 py-1.5">
                        <div className="flex justify-center">
                          <DVInput
                            value={extra.don_gia}
                            onChange={v => handleExtraChange(row.id!, idx, "don_gia", v)}
                            onBlur={() => handleExtraSave(row.id!, idx)}
                            width="w-[112px]"
                            money
                            decimal
                          />
                        </div>
                      </td>
                      {/* Thành tiền */}
                      <td className="px-3 py-1.5 text-right text-muted-foreground whitespace-nowrap">
                        {fmt(extra.so_luong * extra.don_gia)} ₫
                      </td>
                      {/* Ai trả */}
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => {
                            const next = extra.nguoi_tt === "hdv" ? "cong_ty" : "hdv";
                            handleExtraChange(row.id!, idx, "nguoi_tt", next);
                            handleExtraSave(row.id!, idx, next);
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
                      <td colSpan={2} /> {/* TT ĐNTT + TT Thanh toán */}
                      {/* Delete */}
                      <td className="px-2 py-1.5 text-right">
                        <button
                          onClick={() => handleExtraDelete(row.id!, idx)}
                          className="text-destructive hover:text-destructive/80 p-0.5"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  )),
                  /* Aggregate commit footer row — chỉ hiện khi còn chênh lệch SAU TRỪ cong_no đã ghi nhận */
                  showAggBtn && (
                    <tr key={`agg-${row.id}`} className={cn(
                      effectiveDelta > 0 ? "bg-orange-50/50" : "bg-purple-50/50"
                    )}>
                      <td colSpan={10} className="px-3 py-1.5">
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
                                mainRow: row,
                                delta: effectiveDelta,
                                sumActual,
                                sumPaid,
                                groupCongNoCN,
                                groupCongNoHT,
                                paidDntt: aggPaidDntt,
                              });
                              setAggReason("");
                              setAggSurplusMode("con_du");
                              setAggCanTru(null);
                              if (effectiveDelta > 0 && ngayBatDau && row.ngay_so != null && row.ngay_so > 0) {
                                try {
                                  const serviceDate = new Date(parseISO(ngayBatDau));
                                  serviceDate.setDate(serviceDate.getDate() + row.ngay_so - 1);
                                  setAggNgayCan(format(subDays(serviceDate, 1), "yyyy-MM-dd"));
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
                  ),
                ];
              }),
            )}
          </tbody>
        </table>
      </div>

      <DVDnttModal
        target={dvModal}
        mode={dvModalMode}
        onModeChange={setDvModalMode}
        depositAmount={dvDepositAmount}
        onDepositAmountChange={setDvDepositAmount}
        ngayCan={dvNgayCan}
        onNgayCanChange={setDvNgayCan}
        canTru={dvModal ? (canTruByDv[dvModal.chiPhiId] ?? []) : []}
        onCanTruChange={(v) => dvModal && setCanTruByDv((prev) => ({ ...prev, [dvModal.chiPhiId]: v }))}
        onClose={() => setDvModal(null)}
        onSubmit={handleDvModalSubmit}
        submitting={insertDNTT.isPending}
      />

      <DVAdjustModal
        target={adjustChiPhi}
        sl={adjustSL}
        onSlChange={setAdjustSL}
        donGia={adjustDonGia}
        onDonGiaChange={setAdjustDonGia}
        reason={adjustReason}
        onReasonChange={setAdjustReason}
        onClose={() => setAdjustChiPhi(null)}
        onSubmit={handleAdjustSubmit}
        submitting={updateActualMut.isPending}
      />

      <DVAggCommitModal
        target={aggCommit}
        doanId={doanId}
        reason={aggReason}
        onReasonChange={setAggReason}
        ngayCan={aggNgayCan}
        onNgayCanChange={setAggNgayCan}
        surplusMode={aggSurplusMode}
        onSurplusModeChange={setAggSurplusMode}
        canTru={aggCanTru}
        onCanTruChange={setAggCanTru}
        onClose={() => { setAggCommit(null); setAggReason(""); setAggNgayCan(""); setAggSurplusMode("con_du"); setAggCanTru(null); }}
        onSubmit={handleAggCommit}
        submitting={insertDNTT.isPending}
      />

      <DVCancelModal
        target={cancelTarget}
        mode={cancelMode}
        onModeChange={setCancelMode}
        onClose={() => setCancelTarget(null)}
        onSubmit={handleCancel}
        submitting={cancelMut.isPending}
      />

      <DNTTNHPreviewModal
        open={!!previewDVData}
        data={previewDVData}
        onClose={() => setPreviewDVData(null)}
      />
    </div>
  );
});

export default ChiPhiDVSection;
