import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { format, subDays, parseISO, addDays } from "date-fns";
import { toast } from "sonner";
import { externalSupabase } from "@/lib/supabase-external";
import { useChiPhiList, useDNTTList, useInsertDNTT, useUpsertChiPhi, useDeleteChiPhi, useUpdateChiPhiActual } from "@/hooks/use-chi-phi";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";
import { useCancelDNTT, useUpdateDNTT, recalcChiPhiStatus } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi, createCanTruPayments } from "@/hooks/use-payments";
import { useCongNoList, appendCanTruLog, isDnttPaidFromPrepaid } from "@/hooks/use-cong-no";
import { useQueryClient } from "@tanstack/react-query";
import type { NHDocData, NHDocEntry } from "@/lib/export-dntt-nh-word";
import { useCurrentUserName } from "@/hooks/use-doan";
import { useDVCanhDiemMap } from "@/hooks/use-chi-phi-nh";
import { type CanTruSelection } from "./KSCongNoPanel";
import { type DVModalTarget } from "./DVDnttModal";
import { type CancelTarget } from "./DVCancelModal";
import { type AggCommitTarget } from "./DVAggCommitModal";
import { type DVRowData, type DVRowHandlers, type LocalDVExtra } from "./DVRow";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface DVSectionParams {
  doanId: number;
  tenDoan?: string;
  ngayBatDau?: string;
}

// Toàn bộ state + handler của tab Chi phí Dịch vụ.
// Tách verbatim từ ChiPhiDVSection — component chỉ còn phần render.
export function useDVSection({ doanId, tenDoan, ngayBatDau }: DVSectionParams) {
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
  }, [allDvRows]);

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

  // ── Clustered props cho <DVRow> ────────────────────────────────────────────

  const dvData: DVRowData = {
    dnttList, extrasMap, paymentsList, congNoList, allDvRows, dvCdMap,
    canTruByDnttId, selectedIds, editingId, editAmount, ngayBatDau,
    upsertMut, updateDNTT,
  };
  const dvHandlers: DVRowHandlers = {
    getRowEdit, getDateLabel, setSelectedIds, handleRowChange, handleRowSave,
    handleResetOverride, handleToggleNguoiTt, setEditAmount, setEditingId,
    handleEditSave, handleToggleDinhKy, handleExtraAdd, openDvModal,
    setAdjustChiPhi, setAdjustSL, setAdjustDonGia, setAdjustReason,
    setCancelMode, setCancelTarget, setAggCommit, setAggReason,
    setAggSurplusMode, setAggCanTru, setAggNgayCan,
    handleExtraChange, handleExtraSave, handleExtraDelete,
  };

  return {
    dvRows, total, sortedDays, dvData, dvHandlers,
    selectedIds, setSelectedIds, buildSelectedEntries, handlePrintSelected,
    previewDVData, setPreviewDVData,
    // ĐNTT modal
    dvModal, setDvModal, dvModalMode, setDvModalMode,
    dvDepositAmount, setDvDepositAmount, dvNgayCan, setDvNgayCan,
    canTruByDv, setCanTruByDv, handleDvModalSubmit,
    // Adjust modal
    adjustChiPhi, setAdjustChiPhi, adjustSL, setAdjustSL,
    adjustDonGia, setAdjustDonGia, adjustReason, setAdjustReason, handleAdjustSubmit,
    // Aggregate commit modal
    aggCommit, setAggCommit, aggReason, setAggReason, aggNgayCan, setAggNgayCan,
    aggSurplusMode, setAggSurplusMode, aggCanTru, setAggCanTru, handleAggCommit,
    // Cancel modal
    cancelTarget, setCancelTarget, cancelMode, setCancelMode, handleCancel,
    // pending flags
    insertPending: insertDNTT.isPending,
    updateActualPending: updateActualMut.isPending,
    cancelPending: cancelMut.isPending,
  };
}
