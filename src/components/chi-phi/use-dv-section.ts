import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { format, subDays, parseISO, addDays } from "date-fns";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import { externalSupabase } from "@/lib/supabase-external";
import { useChiPhiList, useDNTTList, useInsertDNTT, useUpsertChiPhi, useDeleteChiPhi, useDNTTAllocationsByDoan } from "@/hooks/use-chi-phi";
import { useAuditLogger } from "@/hooks/use-activity-log";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";
import { useCancelDNTT, useUpdateDNTT, recalcChiPhiStatus } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi, createCanTruPayments } from "@/hooks/use-payments";
import { buildCanTruNote } from "@/lib/can-tru-note";
import { calcDnttPriorPaid } from "@/lib/chi-phi-calc";
import { resolveDVFoc, calcSoKhachThucTe } from "@/lib/foc-calc";
import { wouldOverCommit } from "@/lib/dntt-duplicate-guard";
import { lumpCanTruCash, type LumpRow, type DnttLump } from "@/lib/can-tru-lump";
import { useCongNoList, isDnttPaidFromPrepaid } from "@/hooks/use-cong-no";
import { useQueryClient } from "@tanstack/react-query";
import type { NHDocData, NHDocEntry } from "@/lib/export-dntt-nh-word";
import { useCurrentUserName } from "@/hooks/use-doan";
import { useDVCanhDiemMap } from "@/hooks/use-chi-phi-nh";
import { type CanTruSelection } from "./KSCongNoPanel";
import { type DVModalTarget } from "./DVDnttModal";
import { type CancelTarget } from "./DVCancelModal";
import { type AggCommitTarget } from "./DVAggCommitModal";
import { type DVRowData, type DVRowHandlers, type LocalDVExtra } from "./DVRow";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface DVSectionParams {
  doanId: number;
  tenDoan?: string;
  ngayBatDau?: string;
  /** Filter chi phí theo nhóm — Phase 2+ */
  doanNhomId?: number | null;
}

// Toàn bộ state + handler của tab Chi phí Dịch vụ.
// Tách verbatim từ ChiPhiDVSection — component chỉ còn phần render.
export function useDVSection({ doanId, tenDoan, ngayBatDau, doanNhomId }: DVSectionParams) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId, doanNhomId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: paymentsList = [] } = usePaymentsByChiPhi(doanId);
  const { data: congNoList = [] } = useCongNoList({ doanId });
  const { data: allocRows = [] } = useDNTTAllocationsByDoan(doanId);

  // chi_phi_id → (dntt_id → so_tien). Map dòng → các ĐNTT allocate vào nó
  // (gồm ĐNTT gộp ref_id 1 dòng nhưng allocate cho nhiều dòng cùng NCC).
  const allocByChiPhi = useMemo(() => {
    const m = new Map<number, Map<number, number>>();
    for (const a of allocRows) {
      let inner = m.get(a.chi_phi_id);
      if (!inner) { inner = new Map<number, number>(); m.set(a.chi_phi_id, inner); }
      inner.set(a.dntt_id, (inner.get(a.dntt_id) ?? 0) + a.so_tien);
    }
    return m;
  }, [allocRows]);

  const { data: currentUserName = "" } = useCurrentUserName();
  const insertDNTT = useInsertDNTT();
  const updateDNTT = useUpdateDNTT();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const auditLog = useAuditLogger();
  const cancelMut = useCancelDNTT();
  const qc = useQueryClient();
  const dvCdMap = useDVCanhDiemMap(doanId);
  const [canTruByDv, setCanTruByDv] = useState<Record<number, CanTruSelection[]>>({});
  const [previewDVData, setPreviewDVData] = useState<NHDocData | null>(null);

  // Inline edit state for DNTT amount
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // Inline edit for row fields (so_luong, don_gia)
  const [editRow, setEditRow] = useState<Record<number, { so_luong: number; don_gia: number }>>({});
  // Ref mirror cho blur callback: DecimalInput.onBlur gọi onChange rồi setTimeout(onBlur)
  // → handleRowSave chạy ở tick sau, closure editRow bị cũ 1 nhịp. Đọc ref để luôn mới.
  const editRowRef = useRef(editRow);
  useEffect(() => { editRowRef.current = editRow; }, [editRow]);

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

  // Aggregate commit dialog (sửa inline xong → commit chênh lệch ở footer)
  const [aggCommit, setAggCommit] = useState<AggCommitTarget | null>(null);
  const [aggReason, setAggReason] = useState("");
  const [aggNgayCan, setAggNgayCan] = useState("");
  // Surplus mode khi delta < 0 (thừa): NCC giữ tiền (con_du) hoặc NCC trả lại cash (hoan_tien)
  const [aggSurplusMode, setAggSurplusMode] = useState<"con_du" | "hoan_tien">("con_du");
  // Cấn trừ cong_no khi delta > 0 (thiếu): chọn cong_no NCC để giảm DNTT cash phần
  const [aggCanTru, setAggCanTru] = useState<CanTruSelection[]>([]);

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // Split main rows vs extras. Memo theo chiPhiRows — identity ổn định để
  // DVGopDnttModal không reset tick chọn mỗi lần parent re-render (groups
  // useMemo + useEffect [open, groups] phụ thuộc identity của mảng này).
  const allDvRows = useMemo(
    () => chiPhiRows.filter((r) => r.danh_muc === "canh_diem"),
    [chiPhiRows],
  );
  const dvRows = useMemo(
    () => allDvRows.filter((r) => !r.mo_ta?.match(/^\[dvps_\d+\] /)),
    [allDvRows],
  );

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
        trang_thai_hoa_don: row.trang_thai_hoa_don ?? null,
      });
    }
    return map;
  }, [allDvRows]);

  const extrasInitRef = useRef(false);

  // Reset khi doanId THỰC SỰ đổi — KHÔNG chạy lần mount đầu, và phải KHAI BÁO
  // TRƯỚC effect init. DoanDetail đã fetch sẵn ["doan_chi_phi", doanId, null]
  // → section mount với cache ấm → init set extrasMap ngay commit đầu; nếu reset
  // chạy SAU nó ở cùng commit sẽ wipe mất, và dbExtrasMap không đổi identity nữa
  // (structural sharing) nên init không bao giờ chạy lại → extras "biến mất".
  // Đổi đoàn khi data đoàn mới đã có cache cũng cần thứ tự reset-trước-init này.
  const prevDoanIdRef = useRef(doanId);
  useEffect(() => {
    if (prevDoanIdRef.current === doanId) return;
    prevDoanIdRef.current = doanId;
    extrasInitRef.current = false;
    setExtrasMap({});
    setSelectedIds([]);
  }, [doanId]);

  // Init extrasMap from DB (once)
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

  // Nhóm theo ngày
  const byDay = new Map<number, typeof dvRows>();
  for (const row of dvRows) {
    const day = row.ngay_so ?? 0;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(row);
  }
  const sortedDays = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  // Tổng header: tính CẢ extras (allDvRows) — phụ thu là chi phí thật của đoàn,
  // bỏ sót làm Tổng lệch với số ĐNTT gộp (main + phụ thu) → user tưởng dup tiền.
  const total = allDvRows.reduce((s, r) => s + r.tien_cong_ty + r.tien_hdv, 0);

  // ── ĐNTT gộp: map ĐNTT → các dòng + chọn-theo-nhóm ─────────────────────────
  // dntt_id → các chi_phi được allocate (để tích 1 dòng kéo theo cả nhóm cùng ĐNTT).
  const dnttToChiPhis = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const a of allocRows) {
      if (!m.has(a.dntt_id)) m.set(a.dntt_id, new Set());
      m.get(a.dntt_id)!.add(a.chi_phi_id);
    }
    return m;
  }, [allocRows]);

  // ── Lump cấn trừ theo ĐNTT (CHỈ hiển thị) ──────────────────────────────────
  // Dồn cấn trừ của 1 ĐNTT gộp vào DÒNG ĐẦU (theo thứ tự hiển thị) thay vì pro-rata,
  // để OP thấy 1 con số tổng rõ ràng (khớp số khoản công nợ đã cấn). KHÔNG đụng
  // paidForDntt / daDeNghi / agg-delta — đó là logic, lump chỉ là tầng hiển thị.
  const lumpedByDntt = useMemo(() => {
    // 1. Tổng cấn trừ + tiền mặt + payments cấn trừ (cho note nguồn) theo từng ĐNTT.
    const agg = new Map<number, { canTru: number; cash: number; ctPays: { ghi_chu: string | null }[] }>();
    for (const p of paymentsList) {
      let t = agg.get(p.dntt_id);
      if (!t) { t = { canTru: 0, cash: 0, ctPays: [] }; agg.set(p.dntt_id, t); }
      if (p.method === "can_tru") { t.canTru += p.payment_so_tien; t.ctPays.push({ ghi_chu: p.ghi_chu }); }
      else if (p.method === "cash") { t.cash += p.payment_so_tien; }
    }
    // 2. Member rows mỗi ĐNTT theo ĐÚNG thứ tự hiển thị (ngày tăng dần, trong ngày giữ thứ tự dvRows).
    // ⚠ PHẢI khớp thứ tự render (sortedDays bên dưới) để cấn trừ dồn đúng dòng hiển thị ĐẦU.
    // sort theo ngay_so là stable → trong cùng ngày giữ thứ tự dvRows, y hệt byDay/sortedDays.
    const ordered = [...dvRows].sort((a, b) => (a.ngay_so ?? 0) - (b.ngay_so ?? 0));
    const members = new Map<number, { chiPhiId: number; alloc: number }[]>();
    for (const row of ordered) {
      if (row.id == null) continue;
      const inner = allocByChiPhi.get(row.id);
      if (!inner) continue;
      for (const [dnttId, alloc] of inner) {
        if (!members.has(dnttId)) members.set(dnttId, []);
        members.get(dnttId)!.push({ chiPhiId: row.id, alloc });
      }
    }
    // 3. Waterfall — CHỈ build cho ĐNTT có cấn trừ (không cấn trừ → DVRow giữ logic cũ).
    const out = new Map<number, DnttLump>();
    for (const [dnttId, mem] of members) {
      const t = agg.get(dnttId);
      if (!t || t.canTru <= 0) continue;
      const lumps = lumpCanTruCash(mem.map((m) => m.alloc), t.canTru, t.cash);
      const rows = new Map<number, LumpRow>();
      mem.forEach((m, i) => rows.set(m.chiPhiId, lumps[i]));
      out.set(dnttId, { rows, canTruNote: buildCanTruNote(t.ctPays) });
    }
    return out;
  }, [dvRows, allocByChiPhi, paymentsList]);
  const activeDnttIdSet = useMemo(
    () => new Set(
      dnttList
        .filter((d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi")
        .map((d) => d.id),
    ),
    [dnttList],
  );
  const dvRowIdSet = useMemo(() => new Set(dvRows.map((r) => r.id)), [dvRows]);

  // Các dòng "anh em" của 1 dòng = mọi dòng DV cùng nằm trong 1 ĐNTT (còn hiệu lực)
  // với nó (gộp). Trả về gồm chính nó.
  const getSelectionSiblings = useCallback((rowId: number): number[] => {
    const ids = new Set<number>([rowId]);
    const allocs = allocByChiPhi.get(rowId);
    if (allocs) {
      for (const dnttId of allocs.keys()) {
        if (!activeDnttIdSet.has(dnttId)) continue;
        const sibs = dnttToChiPhis.get(dnttId);
        if (sibs) for (const cid of sibs) if (dvRowIdSet.has(cid)) ids.add(cid);
      }
    }
    return [...ids];
  }, [allocByChiPhi, activeDnttIdSet, dnttToChiPhis, dvRowIdSet]);

  // Tích/bỏ tích 1 dòng → kéo theo cả nhóm cùng ĐNTT gộp.
  const toggleSelectRow = useCallback((rowId: number, checked: boolean) => {
    const sibs = getSelectionSiblings(rowId);
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (checked) sibs.forEach((id) => set.add(id));
      else sibs.forEach((id) => set.delete(id));
      return [...set];
    });
  }, [getSelectionSiblings]);

  // ── Row field helpers ─────────────────────────────────────────────────────

  const getRowEdit = (row: typeof dvRows[0]) =>
    editRow[row.id] ?? { so_luong: row.so_luong, don_gia: row.don_gia };

  const handleRowChange = (id: number | undefined, field: "so_luong" | "don_gia", val: number) => {
    if (id == null) return; // row chưa save → bỏ qua (cần id để index editRow map)
    const base = dvRows.find(r => r.id === id);
    const cur = editRowRef.current;
    const existing = cur[id] ?? { so_luong: base?.so_luong ?? 0, don_gia: base?.don_gia ?? 0 };
    const next = { ...cur, [id]: { ...existing, [field]: val } };
    // Cập nhật ref ngay (đồng bộ) → handleRowSave chạy sau setTimeout đọc đúng giá trị mới.
    editRowRef.current = next;
    setEditRow(next);
  };

  const handleRowSave = (row: typeof dvRows[0]) => {
    const local = editRowRef.current[row.id];
    if (!local) return;
    if (local.so_luong === row.so_luong && local.don_gia === row.don_gia) return;
    // FOC dịch vụ: tien tính trên số khách SAU TRỪ FOC (chỉ snapshot trên row).
    const foc = resolveDVFoc(row);
    const billed = calcSoKhachThucTe(local.so_luong, foc.foc_khach, foc.foc_mien);
    const total = billed * local.don_gia;
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
      // Sửa inline = giá trị mới CHÍNH là thực tế → xóa override thực tế cũ
      // (nếu có) để footer aggregate đọc đúng tien_cong_ty mới.
      thanh_tien_thuc_te: null,
    }, {
      onSuccess: () => setEditRow(prev => { const next = { ...prev }; delete next[row.id]; return next; }),
    });
  };

  // Reset override → fetch item từ doan_ngay_item, cascade chi_phi theo source
  // (so_luong, don_gia) + clear flag + clear thuc_te. User expect sync NGAY.
  const handleResetOverride = async (row: typeof dvRows[0]) => {
    if (!row.ref_doan_ngay_item_id) {
      // Extras (no item link) — chỉ clear flag
      upsertMut.mutate({ id: row.id, doan_id: doanId, is_overridden: false });
      return;
    }
    const { data: item } = await externalSupabase
      .from("doan_ngay_item")
      .select("so_luong, don_gia")
      .eq("id", row.ref_doan_ngay_item_id)
      .single();
    if (!item) {
      // Fallback: chỉ clear flag (cascade lần sau sẽ sync)
      upsertMut.mutate({ id: row.id, doan_id: doanId, is_overridden: false });
      return;
    }
    const isHdv = row.tien_hdv > 0;
    const newSoLuong = item.so_luong ?? 0;
    const newDonGia  = item.don_gia ?? 0;
    // Reset giữ nguyên FOC snapshot trên row → tính lại tien theo FOC cho khớp cascade.
    const foc = resolveDVFoc(row);
    const billed = calcSoKhachThucTe(newSoLuong, foc.foc_khach, foc.foc_mien);
    const newTotal = billed * newDonGia;
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      so_luong: newSoLuong,
      don_gia: newDonGia,
      tien_cong_ty: isHdv ? 0 : newTotal,
      tien_hdv:     isHdv ? newTotal : 0,
      is_overridden: false,
      thanh_tien_thuc_te: null,
    });
  };

  // Áp FOC từ master canh_diem vào 1 dòng đoàn cũ (chưa có snapshot): ghi snapshot +
  // tính lại tien_cong_ty/hdv NGAY (1 lần, có chủ đích) → display/ĐNTT/aggregate khớp.
  const handleApplyMasterFoc = (row: typeof dvRows[0], focKhach: number, focMien: number) => {
    const billed = calcSoKhachThucTe(row.so_luong, focKhach, focMien);
    const total = billed * row.don_gia;
    const isHdv = row.tien_hdv > 0;
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      foc_khach_snapshot: focKhach,
      foc_mien_snapshot: focMien,
      tien_cong_ty: isHdv ? 0 : total,
      tien_hdv:     isHdv ? total : 0,
      thanh_tien_thuc_te: null,
    }, {
      onSuccess: () => toast.success(`Đã áp FOC ${focKhach}免${focMien} — đã tính lại tiền`),
    });
  };

  const handleToggleNguoiTt = (row: typeof dvRows[0]) => {
    // Giữ tổng tiền đã tính (đã trừ FOC) — chỉ đổi cột công ty ↔ HDV.
    const total = row.tien_cong_ty + row.tien_hdv;
    const next = row.tien_hdv > 0 ? "cong_ty" : "hdv";
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      tien_cong_ty: next === "cong_ty" ? total : 0,
      tien_hdv: next === "hdv" ? total : 0,
    });
  };

  // ── Extra handlers ────────────────────────────────────────────────────────

  const handleExtraAdd = (mainId: number) => {
    setExtrasMap((prev) => ({
      ...prev,
      [mainId]: [...(prev[mainId] || []), { mo_ta: "", so_luong: 1, don_gia: 0, nguoi_tt: "cong_ty" }],
    }));
  };

  const handleExtraChange = (
    mainId: number,
    idx: number,
    field: keyof LocalDVExtra,
    value: LocalDVExtra[keyof LocalDVExtra],
  ) => {
    setExtrasMap((prev) => {
      const list = [...(prev[mainId] || [])];
      list[idx] = { ...list[idx], [field]: value } as LocalDVExtra;
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
    }, {
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
    upsertMut.mutate({ id: row.id, doan_id: doanId, thanh_toan_dinh_ky: newVal }, {
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

    // Guard chống tạo ĐNTT TRÙNG (vd bấm "Tạo ĐNTT" 2 lần) — xem use-nh-section.
    // Chỉ check ở chế độ full (cọc là chủ ý nên bỏ qua).
    if (dvModalMode === "full") {
      const { data: allocRows } = await externalSupabase
        .from("dntt_allocations")
        .select("dntt_id, so_tien")
        .eq("chi_phi_id", chiPhiId);
      const dnttIds = [...new Set((allocRows ?? []).map((a) => a.dntt_id))];
      let committed = 0;
      if (dnttIds.length > 0) {
        const { data: dnttRows } = await externalSupabase
          .from("de_nghi_thanh_toan")
          .select("id, trang_thai_duyet")
          .in("id", dnttIds);
        const activeIds = new Set(
          (dnttRows ?? [])
            .filter((d) => d.trang_thai_duyet !== "da_huy")
            .map((d) => d.id),
        );
        committed = (allocRows ?? [])
          .filter((a) => activeIds.has(a.dntt_id))
          .reduce((s, a) => s + Number(a.so_tien || 0), 0);
      }
      if (wouldOverCommit(committed, fullAmount, thanhTien)) {
        const ok = window.confirm(
          `Dịch vụ "${moTa || ""}" đã có ĐNTT (chưa hủy) tổng ${committed.toLocaleString("vi-VN")} ₫.\n` +
            `Tạo thêm ${fullAmount.toLocaleString("vi-VN")} ₫ nữa sẽ vượt chi phí ${thanhTien.toLocaleString("vi-VN")} ₫ ` +
            `— có thể bị TRÙNG. Bạn có chắc muốn tiếp tục?`,
        );
        if (!ok) return;
      }
    }

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
      });
      const mainDvId = mainRecord?.id ?? null;

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
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || "Không thể tạo ĐNTT"));
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
        onError: (err: unknown) => toast.error(errMsg(err) || "Lỗi khi hủy"),
      },
    );
  };

  // ── Aggregate commit (chênh lệch sau khi sửa inline) ────────────────────────

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
        auditLog({
          doan_id: doanId,
          action: "tao",
          table_name: "cong_no",
          record_id: mainRow.id,
          mo_ta: `Ghi nhận ${lyDoLabel} ${fmt(absDelta)} ₫ — dịch vụ ${mainRow.mo_ta || ""}${paidDntt?.ten_nha_cung_cap ? " (NCC " + paidDntt.ten_nha_cung_cap + ")" : ""}`,
        });
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
      setAggCanTru([]);
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || ""));
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
        const cd = Array.isArray(item.canh_diem) ? item.canh_diem[0] : item.canh_diem;
        tkttMap[item.id] = (cd as { tai_khoan_thanh_toan?: string | null } | null)?.tai_khoan_thanh_toan ?? null;
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

      // Gom các dòng được chọn theo ĐNTT đang chờ (allocation-based): ĐNTT gộp
      // (nhiều dòng) → 1 entry, 1 "cần thanh toán" = số tiền ĐNTT (không tách per-dòng).
      // Dòng CHƯA có ĐNTT → entry riêng (số tiền = thành tiền dòng).
      type DNTTLite = (typeof dnttList)[number];
      const activeDnttById = new Map<number, DNTTLite>(
        dnttList
          .filter((d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi")
          .map((d) => [d.id, d] as const),
      );
      const pendingDnttOf = (rowId: number): DNTTLite | null => {
        const allocs = allocByChiPhi.get(rowId);
        if (!allocs) return null;
        const cands = [...allocs.keys()]
          .map((id) => activeDnttById.get(id))
          .filter((d): d is DNTTLite => !!d && d.payment_status !== "paid");
        return cands.find((d) => d.la_coc) ?? cands[0] ?? null;
      };

      // key = ĐNTT id (gộp/đơn) | r<rowId> (chưa có ĐNTT). Giữ thứ tự theo ngày.
      type PrintGroup = { dntt: DNTTLite | null; rows: { row: ChiPhiRow; day: number }[] };
      const groups = new Map<string, PrintGroup>();
      for (const [day, rows] of sortedDays) {
        for (const row of rows) {
          if (!row.id || !selectedIds.includes(row.id)) continue;
          const pd = pendingDnttOf(row.id);
          const key = pd ? `d${pd.id}` : `r${row.id}`;
          if (!groups.has(key)) groups.set(key, { dntt: pd, rows: [] });
          groups.get(key)!.rows.push({ row, day });
        }
      }

      for (const { dntt, rows: grows } of groups.values()) {
        const isGop = grows.length > 1;
        const items: { so_luong: number; don_gia: number; ghi_chu: string }[] = [];
        let soKhachSum = 0;
        let thanhTienSum = 0;
        for (const { row } of grows) {
          const rowExtras = (extrasMap[row.id!] ?? []).filter((e) => e.nguoi_tt !== "hdv" && e.don_gia > 0);
          // Gộp → ghi tên dịch vụ vào ghi_chu (vì ten_nh dùng cho tên NCC chung).
          items.push({ so_luong: row.so_luong, don_gia: row.don_gia, ghi_chu: isGop ? (row.mo_ta || "Dịch vụ") : "" });
          items.push(...rowExtras.map((e) => ({ so_luong: e.so_luong, don_gia: e.don_gia, ghi_chu: e.mo_ta || "" })));
          soKhachSum += row.so_luong;
          thanhTienSum += row.tien_cong_ty + rowExtras.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
        }

        const first = grows[0].row;
        const firstDay = grows[0].day;
        const nccId = first.nha_cung_cap_id ?? null;

        // Cấn trừ: hiện 1 lần / NCC.
        let canTruAmount = 0;
        let canTruNote: string | undefined;
        if (nccId && !canTruShownByNcc[nccId]) {
          const canTruPays = dntt
            ? paymentsList.filter((p) => p.dntt_id === dntt.id && p.method === "can_tru")
            : grows.flatMap(({ row }) => paymentsList.filter((p) => p.chi_phi_id === row.id && p.method === "can_tru"));
          canTruAmount = canTruPays.reduce((s, p) => s + p.payment_so_tien, 0);
          if (canTruAmount > 0) {
            canTruShownByNcc[nccId] = true;
            canTruNote = buildCanTruNote(canTruPays); // "Cấn trừ từ đoàn: <nguồn>"
          }
        }

        // "Số tiền cọc" = tiền đã thanh toán TRƯỚC cho nhóm này. Có ĐNTT pending →
        // Σ paid_amount THỰC TẾ của các ĐNTT KHÁC (cọc HOẶC trả 1 phần) liên kết tới
        // các dòng trong nhóm — qua allocation HOẶC ref_id, mỗi ĐNTT đếm 1 lần (Set)
        // để không nhân đôi khi gộp. KHÔNG lọc la_coc (trả 1 phần thường la_coc=false).
        // Trước đây ép 0 khi có pending → cột hiện "—" dù đã thanh toán 1 phần.
        let soCoc: number;
        if (dntt) {
          const priorDnttIds = new Set<number>();
          for (const { row } of grows) {
            const allocs = allocByChiPhi.get(row.id!);
            if (allocs) for (const id of allocs.keys()) priorDnttIds.add(id);
            dnttList
              .filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id)
              .forEach((d) => priorDnttIds.add(d.id));
          }
          const priorDntts = [...priorDnttIds]
            .map((id) => activeDnttById.get(id))
            .filter((d): d is DNTTLite => !!d);
          soCoc = calcDnttPriorPaid(priorDntts, dntt.id);
        } else {
          soCoc = grows.reduce((s, { row }) => s + dnttList
            .filter((d) => d.ref_loai === "doan_chi_phi" && d.ref_id === row.id && d.la_coc && d.trang_thai_duyet !== "da_huy" && d.payment_status === "paid")
            .reduce((a, d) => a + d.so_tien, 0), 0);
        }

        // ĐNTT (gộp/đơn) → in đúng số tiền ĐNTT (trừ cấn trừ), 1 khoản. Chưa có → còn lại.
        const soTienConTT = dntt
          ? Math.max(0, dntt.so_tien - canTruAmount)
          : Math.max(0, thanhTienSum - soCoc - canTruAmount);

        const nccFromDntt = dntt?.ten_nha_cung_cap
          ? { ten: dntt.ten_nha_cung_cap, so_tai_khoan: dntt.so_tai_khoan || undefined, ngan_hang: dntt.ngan_hang || undefined }
          : null;
        const nccFinal = nccFromDntt ?? (nccId ? nccMap[nccId] : undefined) ?? null;

        entries.push({
          ngay_date: getDateLabel(firstDay > 0 ? firstDay : null),
          // Gộp: ten_nh dùng tên NCC (chỉ cho tên file / fallback) — cột TÊN in word
          // sẽ lấy tên dịch vụ per-dòng từ item.ghi_chu (multi_service).
          ten_nh: isGop ? (nccFinal?.ten ?? "Gộp dịch vụ") : (first.mo_ta || "Dịch vụ"),
          so_khach: isGop ? first.so_luong : soKhachSum,
          // FOC dịch vụ của dòng main (chỉ snapshot — khớp tien_cong_ty in bản ĐNTT).
          ...(() => {
            const f = resolveDVFoc(first);
            return { foc_khach: f.foc_khach, foc: f.foc_mien };
          })(),
          items,
          ncc: nccFinal,
          so_tien_coc: soCoc,
          can_tru: canTruAmount,
          can_tru_note: canTruNote,
          so_tien_con_tt: soTienConTT,
          la_coc: !!dntt?.la_coc,
          multi_service: isGop,
          tai_khoan_thanh_toan: first.ref_doan_ngay_item_id ? (tkttMap[first.ref_doan_ngay_item_id] ?? null) : null,
        });
      }

    return entries;
  }, [selectedIds, dvRows, dnttList, paymentsList, extrasMap, sortedDays, allocByChiPhi, dvCdMap]);

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
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || ""));
    }
  };

  // ── Clustered props cho <DVRow> ────────────────────────────────────────────

  const dvData: DVRowData = {
    dnttList, extrasMap, paymentsList, congNoList, allDvRows, dvCdMap, doanId,
    allocByChiPhi, lumpedByDntt, selectedIds, editingId, editAmount, ngayBatDau,
    upsertMut, updateDNTT,
  };
  const dvHandlers: DVRowHandlers = {
    getRowEdit, getDateLabel, setSelectedIds, toggleSelectRow, handleRowChange, handleRowSave,
    handleResetOverride, handleApplyMasterFoc, handleToggleNguoiTt, setEditAmount, setEditingId,
    handleEditSave, handleToggleDinhKy, handleExtraAdd, openDvModal,
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
    // Aggregate commit modal
    aggCommit, setAggCommit, aggReason, setAggReason, aggNgayCan, setAggNgayCan,
    aggSurplusMode, setAggSurplusMode, aggCanTru, setAggCanTru, handleAggCommit,
    // Cancel modal
    cancelTarget, setCancelTarget, cancelMode, setCancelMode, handleCancel,
    // pending flags
    insertPending: insertDNTT.isPending,
    cancelPending: cancelMut.isPending,
  };
}
