import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format, getDay } from "date-fns";
import { Plus, ArrowRight, Ban, Printer, ChevronDown, ChevronRight, SlidersHorizontal, Pencil, Check, X, CalendarClock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useCreateAdjustment, useUpdateDNTT } from "@/hooks/use-dntt";
import type { DNTTRow } from "@/hooks/use-dntt";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useChiPhiKSData,
  useChiPhiList,
  useUpsertChiPhi,
  useDeleteChiPhi,
  useDNTTList,
  useInsertDNTT,
  type ChiPhiRow,
} from "@/hooks/use-chi-phi";
import { useCancelDNTT, recalcChiPhiStatus } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi, useCreatePayment } from "@/hooks/use-payments";
import { useCongNoList, appendCanTruLog } from "@/hooks/use-cong-no";
import { externalSupabase } from "@/lib/supabase-external";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { useCurrentUserName } from "@/hooks/use-doan";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import KSRowInput from "./KSRowInput";
import KSDNTTModal from "./KSDNTTModal";
import KSCongNoPanel, { type CanTruSelection } from "./KSCongNoPanel";
import { exportDNTTKSExcel } from "@/lib/export-dntt-ks-excel";
import DNTTKSPreviewModal from "./DNTTKSPreviewModal";
import type { EdgeFunctionData } from "@/lib/export-dntt-ks-word";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Tính giá trị FOC được miễn cho 1 KS (theo từng ngày)
// focKhach: cứ X phòng thì focMien phòng được miễn
// Tính tổng tiền FOC được miễn cho 1 KS (theo từng đêm riêng biệt)
// Chỉ tính FOC nếu tổng phòng trong 1 đêm đạt đủ ngưỡng focKhach
function calcFocDeduction(rows: LocalKSRow[], focKhach: number | null, focMien: number | null): number {
  if (!focKhach || !focMien || focKhach <= 0 || focMien <= 0) return 0;
  const byDay: Record<string, LocalKSRow[]> = {};
  rows.forEach((r) => { const k = r.ngay_date || ""; (byDay[k] = byDay[k] || []).push(r); });
  let deduction = 0;
  Object.values(byDay).forEach((dayRows) => {
    const dayRooms = dayRows.reduce((s, r) => s + (r.so_phong || 0), 0);
    if (dayRooms < focKhach) return; // chưa đủ ngưỡng đêm này
    const focPhong = Math.floor(dayRooms / focKhach) * focMien;
    const dayGross = dayRows.reduce((s, r) => s + (r.so_phong || 0) * (r.gia_phong || 0), 0);
    const avgPrice = dayRooms > 0 ? dayGross / dayRooms : 0;
    deduction += focPhong * avgPrice;
  });
  return Math.round(deduction);
}

function fmtDateDisplay(d: string) {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  cho_duyet:     { text: "Chờ duyệt ĐNTT",  cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:      { text: "Đã duyệt ĐNTT",   cls: "bg-teal-100 text-teal-700" },
  da_thanh_toan: { text: "Đã thanh toán",   cls: "bg-emerald-100 text-emerald-700" },
  hoan_tien:     { text: "Hoàn tiền",       cls: "bg-blue-100 text-blue-700" },
  cong_no:       { text: "Công nợ",         cls: "bg-purple-100 text-purple-700" },
  tu_choi:       { text: "Từ chối",         cls: "bg-red-100 text-red-700" },
};

const dayLabel = (dateStr: string) => {
  const d = new Date(dateStr);
  const dayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return dayNames[getDay(d)];
};

export interface LocalKSRow {
  id?: number;
  khach_san_id: number;
  doan_ngay_id: number;
  ngay_date: string;
  loai_phong: string;
  so_phong: number;
  ci: string;
  co: string;
  so_dem: number;
  gia_phong: number;
  thanh_tien: number;
  is_day_use?: boolean;
  ref_doan_ngay_item_id?: number | null;
  foc_khach_snapshot?: number | null;
  foc_mien_snapshot?: number | null;
}

// Resolve FOC config: ưu tiên snapshot trên rows, fall back master
function resolveKSFoc(
  rows: LocalKSRow[],
  ksMaster: { foc_khach: number | null; foc_mien: number | null } | undefined | null,
): { foc_khach: number | null; foc_mien: number | null } {
  const withSnap = rows.find((r) => r.foc_khach_snapshot != null || r.foc_mien_snapshot != null);
  if (withSnap) {
    return {
      foc_khach: withSnap.foc_khach_snapshot ?? null,
      foc_mien:  withSnap.foc_mien_snapshot  ?? null,
    };
  }
  return {
    foc_khach: ksMaster?.foc_khach ?? null,
    foc_mien:  ksMaster?.foc_mien  ?? null,
  };
}

interface Props {
  doanId: number;
  soKhach?: number;
  tenDoan?: string;
}

export default function ChiPhiKSSection({ doanId, soKhach = 0, tenDoan = "" }: Props) {
  const { data: ksData, isLoading: ksLoading } = useChiPhiKSData(doanId);
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: paymentsList = [] } = usePaymentsByChiPhi(doanId);
  const canTruByDnttId = useMemo(() => {
    // payment_so_tien đã pro-rate per-allocation trong usePaymentsByChiPhi
    // → sum tất cả rows cùng dntt_id = tổng can_tru của DNTT đó.
    // KHÔNG dedupe theo payment_id (sẽ mất share của các allocs còn lại).
    const m: Record<number, number> = {};
    paymentsList.forEach((p) => {
      if (p.method !== "can_tru") return;
      m[p.dntt_id] = (m[p.dntt_id] || 0) + p.payment_so_tien;
    });
    return m;
  }, [paymentsList]);
  const { data: congNoList = [] } = useCongNoList({ doanId });
  const qc = useQueryClient();
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const cancelMut = useCancelDNTT();
  const insertDNTT = useInsertDNTT();
  const { data: currentUserName = "" } = useCurrentUserName();

  // Tracks which cards have been explicitly toggled by user
  const [toggledKsIds, setToggledKsIds] = useState<Set<number>>(new Set());
  const toggleCollapse = (ksId: number) =>
    setToggledKsIds((prev) => {
      const next = new Set(prev);
      next.has(ksId) ? next.delete(ksId) : next.add(ksId);
      return next;
    });
  const [batchPrinting, setBatchPrinting] = useState(false);
  const [selectedKsIds, setSelectedKsIds] = useState<number[]>([]);
  const [previewItems, setPreviewItems] = useState<EdgeFunctionData[] | null>(null);

  const toggleSelectKs = (ksId: number) =>
    setSelectedKsIds((prev) => prev.includes(ksId) ? prev.filter((x) => x !== ksId) : [...prev, ksId]);

  const buildKSData = (ksId: number, dnttId: number) => {
    const dntt = dnttList.find((d) => d.id === dnttId);
    if (!dntt || !ksData) throw new Error("Thiếu dữ liệu ĐNTT hoặc khách sạn");

    const ks = ksData.khachSanMap[ksId];
    if (!ks) throw new Error("Không tìm thấy thông tin khách sạn");

    // Room entries from localRows for this KS — mỗi đêm 1 dòng
    const ksRows = localRowsRef.current.filter((r) => r.khach_san_id === ksId);

    // Lấy ngày từ ngayRows (nguồn chính xác) theo doan_ngay_id
    const ngayDateMap: Record<number, string> = {};
    (ksData.ngayRows as any[]).forEach((n: any) => {
      ngayDateMap[n.id] = n.ngay_date;
    });

    const roomEntries: { name: string; so_luong: number; don_gia: number; so_dem: number; ci: string; co: string }[] = ksRows.map((r) => {
      const ngayDate = ngayDateMap[r.doan_ngay_id] || r.ngay_date || r.ci || "";
      const coDate = ngayDate ? new Date(ngayDate + "T00:00:00") : null;
      if (coDate) coDate.setDate(coDate.getDate() + 1);
      const coStr = coDate
        ? `${coDate.getDate()}/${coDate.getMonth() + 1}/${coDate.getFullYear()}`
        : "";
      return {
        name: r.loai_phong || "Phòng KS",
        so_luong: r.so_phong,
        don_gia: r.gia_phong,
        so_dem: r.so_dem,
        ci: fmtDateDisplay(ngayDate),
        co: coStr,
      };
    });
    if (roomEntries.length === 0) roomEntries.push({ name: "—", so_luong: 1, don_gia: 0, so_dem: 1, ci: "", co: "" });

    // Dates (overall range)
    const ngayDates = ksRows.map((r) => ngayDateMap[r.doan_ngay_id] || r.ngay_date || r.ci || "").filter(Boolean).sort();
    const checkIn = fmtDateDisplay(ngayDates[0] || "");
    const lastDate = ngayDates[ngayDates.length - 1] || "";
    const lastCoDate = lastDate ? new Date(lastDate + "T00:00:00") : null;
    if (lastCoDate) lastCoDate.setDate(lastCoDate.getDate() + 1);
    const checkOut = lastCoDate
      ? `${lastCoDate.getDate()}/${lastCoDate.getMonth() + 1}/${lastCoDate.getFullYear()}`
      : "";
    const soDem = new Set(ngayDates).size || ksRows[0]?.so_dem || 1;

    // Code KS from ngayRows
    const ngayRow = (ksData.ngayRows as any[]).find((r) => r.khach_san_id === ksId);
    const codeKS = ngayRow?.ks_ma_code || "";

    // cocTotal: cọc đã thanh toán đủ (paid)
    const nccId = ks?.nha_cung_cap_id ?? null;
    const cocTotal = dnttList
      .filter((d) => {
        if (d.id === dnttId) return false;
        if (d.trang_thai_duyet === "da_huy" || d.trang_thai_duyet === "tu_choi") return false;
        return d.la_coc && d.payment_status === "paid" && d.ref_loai === "khach_san" && d.ref_id === ksId;
      })
      .reduce((sum, d) => sum + d.so_tien, 0);

    // canTru: tổng can_tru payments của ĐNTT đang preview
    const canTruTotal = canTruByDnttId[dnttId] || 0;
    const ksChiPhiIds = chiPhiRows
      .filter((cp) => cp.danh_muc === "khach_san" && cp.ref_doan_ngay_id != null)
      .filter((cp) => {
        const ng = ksData?.ngayRows.find((r: any) => r.id === cp.ref_doan_ngay_id);
        return ng?.khach_san_id === ksId;
      })
      .map((cp) => cp.id!)
      .filter(Boolean);
    void ksChiPhiIds; // legacy — không còn dùng vì canTruTotal lấy theo dntt_id
    const canTruNote = canTruTotal > 0 ? "Cấn trừ công nợ" : "";

    const focDisplay =
      ks.foc_khach && ks.foc_mien ? `${ks.foc_khach}/${ks.foc_mien}` : "—";

    return {
      doan: { ten_doan: tenDoan || String(doanId), so_khach: soKhach },
      ks: { ten: ks.ten, foc_khach: ks.foc_khach ?? null, foc_mien: ks.foc_mien ?? null },
      ncc: ks.tai_khoan_thanh_toan
        ? { so_tai_khoan: ks.tai_khoan_thanh_toan }
        : null,
      checkIn,
      checkOut,
      codeKS,
      soDem,
      roomEntries,
      cocTotal,
      canTruTotal: canTruTotal > 0 ? canTruTotal : undefined,
      canTruNote: canTruNote || undefined,
      focDisplay,
      soTien: dntt.so_tien,
      la_coc: dntt.la_coc ?? false,
      nguoiDeNghi: currentUserName,
      ghiChu: dntt.ghi_chu || "",
    };
  };

  const validateAndBuildPairs = (activeDnttByKs: Record<number, number>) => {
    const pairs = selectedKsIds
      .map((ksId) => ({ ksId, dnttId: activeDnttByKs[ksId] }))
      .filter((p) => p.dnttId);
    if (pairs.length === 0) {
      toast.error("Các KS đã chọn chưa có ĐNTT nào");
      return null;
    }
    const missingBank = pairs.filter(({ ksId }) => !ksData?.khachSanMap[ksId]?.tai_khoan_thanh_toan);
    if (missingBank.length > 0) {
      const names = missingBank.map(({ ksId }) => ksData?.khachSanMap[ksId]?.ten || `KS #${ksId}`).join(", ");
      toast.error(`Chưa có số tài khoản ngân hàng: ${names}`);
      return null;
    }
    return pairs;
  };

  const handlePrintSelected = (activeDnttByKs: Record<number, number>) => {
    const pairs = validateAndBuildPairs(activeDnttByKs);
    if (!pairs) return;
    try {
      const allData = pairs.map(({ ksId, dnttId }) => buildKSData(ksId, dnttId));
      setPreviewItems(allData);
    } catch (err: any) {
      toast.error("Lỗi tải dữ liệu: " + (err?.message || ""));
    }
  };

  const handleExportExcel = (activeDnttByKs: Record<number, number>) => {
    const pairs = validateAndBuildPairs(activeDnttByKs);
    if (!pairs) return;
    try {
      const allData = pairs.map(({ ksId, dnttId }) => buildKSData(ksId, dnttId));
      exportDNTTKSExcel(allData, tenDoan || String(doanId));
      toast.success("Đã xuất file Excel");
    } catch (err: any) {
      toast.error("Lỗi xuất file: " + (err?.message || ""));
    }
  };

  // Cancel DNTT state
  const [cancelTarget, setCancelTarget] = useState<{
    type: "dntt" | "dich_vu"; // "dntt" = hủy khoản đề nghị, "dich_vu" = hủy toàn bộ dịch vụ
    ksId: number;
    ksName: string;
    paidDnttIds: number[];
    unpaidDnttIds: number[];
    paidTotal: number;
  } | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // Điều chỉnh sau thanh toán (legacy — vẫn giữ cho compat, button đã ẩn)
  const adjustMut = useCreateAdjustment();
  const [adjustTarget, setAdjustTarget] = useState<DNTTRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSurplusMode, setAdjustSurplusMode] = useState<"cong_no" | "hoan_tien">("cong_no");

  // Aggregate commit dialog (chốt chênh lệch sau OP edit so_phong/gia_phong/FOC)
  interface AggCommitKSTarget {
    ksId: number;
    ksName: string;
    nccId: number | null;
    nccName: string | null;
    chiPhiIds: number[];
    delta: number;       // < 0 = thừa (cong_no), > 0 = thiếu (DNTT bổ sung)
    sumActual: number;
    sumPaid: number;
    groupCongNoCN: number;
    groupCongNoHT: number;
    paidDntt: DNTTRow | null;
    serviceDate: string | null;
  }
  const [aggCommit, setAggCommit] = useState<AggCommitKSTarget | null>(null);
  const [aggReason, setAggReason] = useState("");
  const [aggNgayCan, setAggNgayCan] = useState("");
  const [aggSurplusMode, setAggSurplusMode] = useState<"con_du" | "hoan_tien">("con_du");
  const [aggCanTru, setAggCanTru] = useState<CanTruSelection | null>(null);

  // Sửa ĐNTT chờ duyệt
  const updateDNTT = useUpdateDNTT();
  const [editingDnttId, setEditingDnttId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");

  // ── Aggregate commit (chênh lệch sau OP edit so_phong/gia_phong/FOC) ────────

  const handleAggCommit = async () => {
    if (!aggCommit) return;
    const { ksId, ksName, nccId, nccName, chiPhiIds, delta, paidDntt } = aggCommit;
    const absDelta = Math.abs(delta);
    if (!nccId) {
      toast.error("Khách sạn không có NCC — không thể tạo công nợ/ĐNTT bổ sung");
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
            ? `Điều chỉnh giảm KS (${ksName}) — ${lyDoLabel}. Lý do: ${aggReason}`
            : `Điều chỉnh giảm KS (${ksName}) — ${lyDoLabel}`,
        });
        if (error) throw error;
        if (chiPhiIds.length > 0) await recalcChiPhiStatus(chiPhiIds);
        toast.success(
          aggSurplusMode === "hoan_tien"
            ? `Đã ghi nhận hoàn tiền ${fmt(absDelta)} ₫`
            : `Đã ghi nhận công nợ ${fmt(absDelta)} ₫`,
        );
      } else {
        // Thiếu → tạo DNTT bổ sung. Allocations pro-rata theo chi_phi.tien_cong_ty hiện tại.
        const cps = chiPhiRows.filter((cp) => chiPhiIds.includes(cp.id!));
        const totalCt = cps.reduce((s, c) => s + Number(c.tien_cong_ty ?? 0), 0);
        const allocs: { chi_phi_id: number; so_tien: number }[] = [];
        if (totalCt > 0 && cps.length > 0) {
          let assigned = 0;
          for (let i = 0; i < cps.length; i++) {
            const isLast = i === cps.length - 1;
            const portion = isLast
              ? absDelta - assigned
              : Math.round(absDelta * (Number(cps[i].tien_cong_ty ?? 0) / totalCt));
            if (portion > 0) {
              allocs.push({ chi_phi_id: cps[i].id!, so_tien: portion });
              assigned += portion;
            }
          }
        }
        const newDntt = await insertDNTT.mutateAsync({
          doan_id: doanId,
          loai: "khach_san",
          mo_ta: `[Bổ sung] ${ksName}`.trim(),
          nha_cung_cap_id: nccId,
          ten_nha_cung_cap: nccName ?? null,
          so_tien: absDelta,
          la_coc: false,
          trang_thai_duyet: "cho_duyet",
          ref_loai: "khach_san",
          ref_id: ksId,
          ngay_can_thanh_toan: aggNgayCan || null,
          ghi_chu: aggReason ? `Lý do: ${aggReason}` : null,
          allocations: allocs.length > 0 ? allocs : undefined,
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
          if (chiPhiIds.length > 0) await recalcChiPhiStatus(chiPhiIds);
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
      setAggSurplusMode("con_du");
      setAggCanTru(null);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message || ""));
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelTarget) return;
    try {
      if (cancelTarget.type === "dntt") {
        // Chỉ hủy các khoản chưa thanh toán — để tạo lại đề nghị mới
        for (const id of cancelTarget.unpaidDnttIds) {
          await cancelMut.mutateAsync({ id, mode: undefined });
        }
        toast.success("Đã hủy đề nghị thanh toán");
      } else {
        // Hủy toàn bộ dịch vụ: unpaid trước, paid sau (paid cuối → chi_phi status đúng)
        for (const id of cancelTarget.unpaidDnttIds) {
          await cancelMut.mutateAsync({ id, mode: undefined });
        }
        for (const id of cancelTarget.paidDnttIds) {
          await cancelMut.mutateAsync({ id, mode: cancelMode });
        }
        // Xóa toggle để card tự collapse theo default (cong_no/hoan_tien → collapsed)
        const cancelledKsId = cancelTarget.ksId;
        setToggledKsIds((prev) => {
          const next = new Set(prev);
          next.delete(cancelledKsId);
          return next;
        });
        toast.success("Đã hủy dịch vụ khách sạn");
      }
      setCancelTarget(null);
    } catch (err: any) {
      toast.error("Lỗi khi hủy: " + (err?.message || ""));
    }
  };

  const storageKey = `chi_phi_ks_rows_${doanId}`;

  const [localRows, setLocalRows] = useState<LocalKSRow[]>(() => {
    try {
      const cached = sessionStorage.getItem(storageKey);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // Ref to always have latest localRows for blur save (avoids stale closure)
  const localRowsRef = useRef(localRows);
  useEffect(() => {
    localRowsRef.current = localRows;
  }, [localRows]);

  // Persist localRows to sessionStorage on every change
  useEffect(() => {
    if (localRows.length > 0) {
      sessionStorage.setItem(storageKey, JSON.stringify(localRows));
    }
  }, [localRows, storageKey]);

  // Clear storage when doanId changes
  const prevDoanIdRef = useRef(doanId);
  useEffect(() => {
    if (prevDoanIdRef.current !== doanId) {
      sessionStorage.removeItem(`chi_phi_ks_rows_${prevDoanIdRef.current}`);
      prevDoanIdRef.current = doanId;
    }
  }, [doanId]);

  // ── FIX: Cleanup invalid/stale rows after ksData loads ──
  // Xóa rows có khach_san_id = 0 hoặc ngay_date rỗng khỏi localRows & sessionStorage
  // Đồng thời strip id của rows không còn tồn tại trong DB (bị xóa) để tránh FK violation
  useEffect(() => {
    if (!ksData || chiPhiRows.length === 0 && localRows.every((r) => !r.id)) return;

    const validKsIds = new Set(Object.keys(ksData.khachSanMap).map(Number));
    const validNgayIds = new Set([
      ...(ksData.ngayRows || []).map((r: any) => r.id),
      ...Object.values((ksData as any).dayUseItemMap || {}).map((info: any) => info.doan_ngay_id),
    ]);
    const validChiPhiIds = new Set(chiPhiRows.map((r) => r.id).filter(Boolean));

    setLocalRows((prev) => {
      const cleaned = prev
        .filter(
          (r) =>
            r.khach_san_id > 0 &&
            validKsIds.has(r.khach_san_id) &&
            r.ngay_date !== "" &&
            r.ngay_date !== "unknown" &&
            (r.doan_ngay_id === 0 || validNgayIds.has(r.doan_ngay_id)),
        )
        .map((r) =>
          // Strip stale id nếu không còn trong DB — tránh FK violation khi tạo allocation
          r.id && !validChiPhiIds.has(r.id) ? { ...r, id: undefined } : r,
        );

      if (
        cleaned.length === prev.length &&
        cleaned.every((r, i) => r.id === prev[i]?.id)
      ) return prev; // no change

      // Rows rác đã bị lọc bỏ → cập nhật sessionStorage
      if (cleaned.length === 0) {
        sessionStorage.removeItem(storageKey);
      } else {
        sessionStorage.setItem(storageKey, JSON.stringify(cleaned));
      }
      return cleaned;
    });
  }, [ksData, chiPhiRows, storageKey]);

  // Auto-xóa chi phí KS orphaned khi đã được giải quyết hoàn toàn.
  //   Case 1: User dùng "Hủy dịch vụ" → DNTT da_huy + paid > 0 (cong_no tạo bởi useCancelDNTT)
  //   Case 2: User dùng "Xử lý chênh lệch thừa" agg modal → DNTT giữ nguyên, cong_no cover full paid
  const autoDeletedKsIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!ksData || dnttList.length === 0) return;
    const orphanedIds: number[] = ksData.orphanedKsIds || [];
    for (const ksId of orphanedIds) {
      if (autoDeletedKsIdsRef.current.has(ksId)) continue;

      const ksDntts = dnttList.filter(
        (d) => d.ref_loai === "khach_san" && d.ref_id === ksId,
      );
      // Case 1: hủy dịch vụ
      const hasCancelledPaid = ksDntts.some(
        (d) => d.trang_thai_duyet === "da_huy" && (d.paid_amount || 0) > 0,
      );
      // Case 2: agg-settled — cong_no đã cover full sumPaid
      const sumPaid = ksDntts.reduce((s, d) => s + (d.paid_amount || 0), 0);
      const dnttIdsForKs = new Set(ksDntts.map((d) => d.id));
      const sumCongNo = congNoList
        .filter((c) => c.dntt_goc_id != null && dnttIdsForKs.has(c.dntt_goc_id))
        .reduce((s, c) => s + Number(c.so_tien_goc || 0), 0);
      const isAggSettled = sumPaid > 0 && sumCongNo >= sumPaid;

      if (!hasCancelledPaid && !isAggSettled) continue;
      autoDeletedKsIdsRef.current.add(ksId);
      const rowsToDelete = localRows.filter((r) => r.khach_san_id === ksId && r.id);
      for (const row of rowsToDelete) {
        deleteMut.mutate({ id: row.id!, doanId });
      }
      setLocalRows((prev) => prev.filter((r) => r.khach_san_id !== ksId));
    }
  }, [ksData, localRows, dnttList, congNoList, doanId, deleteMut]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKsId, setModalKsId] = useState<number | null>(null);

  // Cấn trừ selection per ksId (controlled by KSCongNoPanel)
  const [canTruByKs, setCanTruByKs] = useState<Record<number, CanTruSelection | null>>({});

  // Định kỳ: track per ksId
  const [dinhKyKsIds, setDinhKyKsIds] = useState<Set<number>>(new Set());
  const dinhKyKsIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => { dinhKyKsIdsRef.current = dinhKyKsIds; }, [dinhKyKsIds]);

  // Only load from DB if no cached data exists
  useEffect(() => {
    if (!ksData || localRows.length > 0) return;
    const ksChiPhi = chiPhiRows.filter((c) => c.danh_muc === "khach_san");

    if (ksChiPhi.length === 0) return;

    const { ngayRows } = ksData;
    const ngayMap: Record<number, any> = {};
    ngayRows.forEach((r: any) => {
      ngayMap[r.id] = r;
    });
    const dayUseItemMap = (ksData as any).dayUseItemMap || {};

    const rows: LocalKSRow[] = ksChiPhi
      .map((cp) => {
        // Day-use: chi phí link qua doan_ngay_item, KS lấy từ canh_diem wrapper
        if (cp.ref_doan_ngay_item_id && dayUseItemMap[cp.ref_doan_ngay_item_id]) {
          const info = dayUseItemMap[cp.ref_doan_ngay_item_id];
          if (!info.ngay_date) return null;
          return {
            id: cp.id,
            khach_san_id: info.khach_san_id,
            doan_ngay_id: info.doan_ngay_id,
            ngay_date: info.ngay_date,
            loai_phong: cp.mo_ta || "Day Use",
            so_phong: cp.so_luong || 0,
            ci: info.ngay_date,
            co: info.ngay_date,
            so_dem: 1,
            gia_phong: cp.don_gia || 0,
            thanh_tien: (cp.so_luong || 0) * (cp.don_gia || 0),
            is_day_use: true,
            ref_doan_ngay_item_id: cp.ref_doan_ngay_item_id,
            foc_khach_snapshot: cp.foc_khach_snapshot ?? null,
            foc_mien_snapshot:  cp.foc_mien_snapshot  ?? null,
          } as LocalKSRow;
        }

        const ngay = ngayMap[cp.ref_doan_ngay_id!];
        // Bỏ qua rows không có ngay hoặc ngay không có khach_san_id hợp lệ
        if (!ngay || !ngay.khach_san_id) return null;

        const ci = ngay?.ngay_date || "";
        if (!ci) return null; // bỏ qua nếu không có ngày

        const coDate = new Date(ci);
        coDate.setDate(coDate.getDate() + 1);
        const co = format(coDate, "yyyy-MM-dd");

        return {
          id: cp.id,
          khach_san_id: ngay.khach_san_id,
          doan_ngay_id: cp.ref_doan_ngay_id || 0,
          ngay_date: ci,
          loai_phong: cp.mo_ta || "",
          so_phong: cp.so_luong || 1,
          ci,
          co,
          so_dem: 1,
          gia_phong: cp.don_gia || 0,
          thanh_tien: (cp.so_luong || 1) * (cp.don_gia || 0),
          foc_khach_snapshot: cp.foc_khach_snapshot ?? null,
          foc_mien_snapshot:  cp.foc_mien_snapshot  ?? null,
        } as LocalKSRow;
      })
      .filter((r): r is LocalKSRow => r !== null);

    if (rows.length > 0) setLocalRows(rows);

    // Khởi tạo dinhKyKsIds từ DB
    const dkIds = new Set<number>(
      ksChiPhi
        .filter((cp) => cp.thanh_toan_dinh_ky)
        .map((cp) => {
          const ngay = ngayMap[cp.ref_doan_ngay_id!];
          return ngay?.khach_san_id as number;
        })
        .filter(Boolean),
    );
    if (dkIds.size > 0) {
      setDinhKyKsIds(dkIds);
    }
  }, [ksData, chiPhiRows, localRows.length]);

  const handleToggleDinhKy = useCallback((ksId: number) => {
    setDinhKyKsIds((prev) => {
      const next = new Set(prev);
      const newVal = !next.has(ksId);
      if (newVal) next.add(ksId); else next.delete(ksId);
      // Cập nhật tất cả chi phí rows của KS này trong DB
      const rowsForKs = localRowsRef.current.filter((r) => r.khach_san_id === ksId && r.id);
      rowsForKs.forEach((r) => {
        upsertMut.mutate({ id: r.id, doan_id: doanId, thanh_toan_dinh_ky: newVal } as any);
      });
      return next;
    });
  }, [doanId, upsertMut]);

  const handleFieldChange = useCallback((idx: number, field: string, value: any) => {
    setLocalRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value };
      row.thanh_tien = row.so_phong * row.gia_phong * row.so_dem;
      updated[idx] = row;
      return updated;
    });
  }, []);

  const handleBlurSave = useCallback(
    (idx: number) => {
      const row = localRowsRef.current[idx];
      if (!row) return;
      // Skip save if row is still empty (no room type and no price)
      if (!row.loai_phong && !row.gia_phong) return;
      // Tính FOC per ngày để lưu tien_cong_ty = giá sau khi trừ FOC
      const sameKsDayRows = localRowsRef.current.filter(
        (r) => r.khach_san_id === row.khach_san_id && r.ngay_date === row.ngay_date,
      );
      const ksInfo = ksData?.khachSanMap[row.khach_san_id];
      // Snapshot ưu tiên — KHÔNG dùng master trừ khi chưa có snapshot (lần đầu)
      const sameKsRows = localRowsRef.current.filter((r) => r.khach_san_id === row.khach_san_id);
      const { foc_khach: focKhach, foc_mien: focMien } = resolveKSFoc(sameKsRows, ksInfo);
      // Tổng phòng ngày này — chỉ tính FOC nếu đủ ngưỡng trong 1 đêm
      const dayTotalRooms = sameKsDayRows.reduce((s, r2) => s + (r2.so_phong || 0), 0);
      const dayFocPhong = (focKhach && focMien && focKhach > 0 && dayTotalRooms >= focKhach)
        ? Math.floor(dayTotalRooms / focKhach) * focMien
        : 0;
      const rowGross = row.thanh_tien; // = so_phong * gia_phong (mỗi row = 1 đêm)
      // FOC tính theo từng đêm: số phòng miễn × giá bình quân/phòng/đêm.
      // Phân bổ cho row này theo tỉ lệ doanh thu trong đêm đó.
      // KHÔNG nhân so_dem ở đây — phải khớp với calcFocDeduction (display).
      const dayGross = sameKsDayRows.reduce(
        (s, r2) => s + (r2.so_phong || 0) * (r2.gia_phong || 0), 0,
      );
      const avgPrice = dayTotalRooms > 0 ? dayGross / dayTotalRooms : 0;
      const dayFocAmount = dayFocPhong * avgPrice;
      const rowFocDeduction = dayGross > 0 && dayFocAmount > 0
        ? Math.round((rowGross / dayGross) * dayFocAmount)
        : 0;
      const tienCongTy = rowGross - rowFocDeduction;

      upsertMut.mutate(
        {
          id: row.id,
          doan_id: doanId,
          ngay_so: null,
          loai: "chi",
          danh_muc: "khach_san",
          ref_doan_ngay_id: row.doan_ngay_id,
          ref_doan_ngay_item_id: row.ref_doan_ngay_item_id ?? null,
          mo_ta: row.loai_phong || (row.is_day_use ? "Day Use" : "Phòng KS"),
          don_gia: row.gia_phong,
          so_luong: row.so_phong,
          tien_cong_ty: tienCongTy,
          tien_hdv: 0,
          thanh_toan_dinh_ky: dinhKyKsIdsRef.current.has(row.khach_san_id),
          // Snapshot: lần đầu lấy từ master (focKhach/focMien đã resolve ở trên).
          // Lần sau giữ snapshot hiện có (resolveKSFoc trả snapshot nếu có).
          foc_khach_snapshot: focKhach,
          foc_mien_snapshot:  focMien,
        },
        {
          onSuccess: (data) => {
            if (!row.id && data?.id) {
              setLocalRows((prev) => {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], id: data.id };
                return updated;
              });
            }
          },
        },
      );
    },
    [doanId, upsertMut],
  );

  const handleDelete = useCallback(
    (idx: number) => {
      const row = localRows[idx];
      if (row.id) {
        deleteMut.mutate(
          { id: row.id, doanId },
          {
            onSuccess: () => {
              setLocalRows((prev) => prev.filter((_, i) => i !== idx));
            },
          },
        );
      } else {
        setLocalRows((prev) => prev.filter((_, i) => i !== idx));
      }
    },
    [localRows, doanId, deleteMut],
  );

  const handleAddRow = useCallback((
    ksId: number,
    doanNgayId: number,
    ngayDate: string,
    refItemId?: number,
  ) => {
    const coDate = new Date(ngayDate);
    coDate.setDate(coDate.getDate() + 1);
    const co = format(coDate, "yyyy-MM-dd");
    const isDayUse = refItemId != null;
    setLocalRows((prev) => [
      ...prev,
      {
        khach_san_id: ksId,
        doan_ngay_id: doanNgayId,
        ngay_date: ngayDate,
        loai_phong: isDayUse ? "Day Use" : "",
        so_phong: 1,
        ci: ngayDate,
        co: isDayUse ? ngayDate : co,
        so_dem: 1,
        gia_phong: 0,
        thanh_tien: 0,
        is_day_use: isDayUse || undefined,
        ref_doan_ngay_item_id: refItemId ?? null,
      },
    ]);
  }, []);

  if (ksLoading) return <div className="text-sm text-muted-foreground">Đang tải KS...</div>;

  const grouped: Record<number, LocalKSRow[]> = {};
  localRows.forEach((r) => {
    if (!grouped[r.khach_san_id]) grouped[r.khach_san_id] = [];
    grouped[r.khach_san_id].push(r);
  });

  const khachSanMap = ksData?.khachSanMap || {};
  const ngayRows = ksData?.ngayRows || [];
  const allKsEntries = Object.entries(grouped);

  // Compute deposit totals per KS from existing ĐNTT
  const cocByKs: Record<number, number> = {};
  dnttList.forEach((d) => {
    if (
      d.loai === "khach_san" &&
      d.ref_loai === "khach_san" &&
      d.ref_id &&
      d.trang_thai_duyet !== "da_huy" &&
      d.trang_thai_duyet !== "tu_choi"
    ) {
      cocByKs[d.ref_id] = (cocByKs[d.ref_id] || 0) + d.so_tien;
    }
  });

  // Build map ksId → list of chi_phi_id (cho payments lookup)
  const chiPhiIdsByKs: Record<number, number[]> = {};
  const dayUseItemMap = (ksData as any)?.dayUseItemMap || {};
  chiPhiRows.forEach((cp) => {
    if (cp.danh_muc !== "khach_san" || !cp.id) return;
    // Day-use: tra qua doan_ngay_item → canh_diem.khach_san_id
    if (cp.ref_doan_ngay_item_id && dayUseItemMap[cp.ref_doan_ngay_item_id]) {
      const ksId = dayUseItemMap[cp.ref_doan_ngay_item_id].khach_san_id;
      (chiPhiIdsByKs[ksId] = chiPhiIdsByKs[ksId] || []).push(cp.id);
      return;
    }
    if (!cp.ref_doan_ngay_id) return;
    const ng = ngayRows.find((r: any) => r.id === cp.ref_doan_ngay_id);
    if (!ng?.khach_san_id) return;
    (chiPhiIdsByKs[ng.khach_san_id] = chiPhiIdsByKs[ng.khach_san_id] || []).push(cp.id);
  });

  // Can_tru đã áp dụng cho từng KS — qua payments
  const canTruAmtByKsId: Record<number, number> = {};
  allKsEntries.forEach(([ksIdStr]) => {
    const ksId = Number(ksIdStr);
    const cpIds = chiPhiIdsByKs[ksId] || [];
    canTruAmtByKsId[ksId] = paymentsList
      .filter((p) => p.method === "can_tru" && cpIds.includes(p.chi_phi_id))
      .reduce((s, p) => s + p.payment_so_tien, 0);
  });

  // Tổng paid_amount per KS (đã thanh toán đầy đủ qua payments)
  const ttByKs: Record<number, number> = {};
  dnttList.forEach((d) => {
    if (
      d.loai === "khach_san" &&
      d.ref_loai === "khach_san" &&
      d.ref_id &&
      d.trang_thai_duyet !== "da_huy" &&
      d.trang_thai_duyet !== "tu_choi"
    ) {
      ttByKs[d.ref_id] = (ttByKs[d.ref_id] || 0) + (d.paid_amount || 0);
    }
  });

  // Chi phí thực tế per KS (sau điều chỉnh, tính từ doan_chi_phi)
  const thucTeByKs: Record<number, number> = {};
  chiPhiRows.forEach((r) => {
    if (r.danh_muc === "khach_san" && r.thanh_tien_thuc_te != null) {
      // Lấy khach_san_id từ localRows theo ref_doan_ngay_id
      const localRow = localRows.find((lr) => lr.id === r.id);
      if (localRow) {
        thucTeByKs[localRow.khach_san_id] =
          (thucTeByKs[localRow.khach_san_id] || 0) + r.thanh_tien_thuc_te;
      }
    }
  });

  // Tổng công nợ / hoàn tiền per KS — từ bảng cong_no
  const congNoByKs: Record<number, number> = {};
  const hoanTienByKs: Record<number, number> = {};
  // groupCongNoTotalByKs = sum so_tien_goc across ALL cong_no states (con_du + da_can_tru + da_hoan_tien).
  // Dùng để effectiveDelta / effectiveCommitted: trừ phần NCC đã credit/refund khỏi sumPaid/sumCommitted.
  // Split CN (con_du + da_can_tru) vs HT (da_hoan_tien) cho display modal.
  const groupCongNoTotalByKs: Record<number, number> = {};
  const groupCongNoCNByKs: Record<number, number> = {};
  const groupCongNoHTByKs: Record<number, number> = {};
  // Build map dntt_id → ksId
  const dnttKsMap: Record<number, number> = {};
  dnttList.forEach((d) => {
    if (d.ref_loai === "khach_san" && d.ref_id) dnttKsMap[d.id] = d.ref_id;
  });
  congNoList.forEach((c) => {
    if (c.dntt_goc_id == null) return;
    const ksId = dnttKsMap[c.dntt_goc_id];
    if (!ksId) return;
    const goc = Number(c.so_tien_goc ?? 0);
    if (c.trang_thai === "con_du") {
      congNoByKs[ksId] = (congNoByKs[ksId] || 0) + c.so_tien_con_lai;
      groupCongNoCNByKs[ksId] = (groupCongNoCNByKs[ksId] || 0) + goc;
    } else if (c.trang_thai === "da_can_tru") {
      groupCongNoCNByKs[ksId] = (groupCongNoCNByKs[ksId] || 0) + goc;
    } else if (c.trang_thai === "da_hoan_tien") {
      hoanTienByKs[ksId] = (hoanTienByKs[ksId] || 0) + goc;
      groupCongNoHTByKs[ksId] = (groupCongNoHTByKs[ksId] || 0) + goc;
    }
    groupCongNoTotalByKs[ksId] = (groupCongNoTotalByKs[ksId] || 0) + goc;
  });

  const getKsChiPhiStatus = (ksId: number): string => {
    const all = dnttList.filter((d) => d.ref_loai === "khach_san" && d.ref_id === ksId);
    if (all.length === 0) return "chua_de_nghi";

    // Đã hủy dịch vụ → check cong_no records
    const cancelledIds = all.filter((d) => d.trang_thai_duyet === "da_huy").map((d) => d.id);
    const cancelledCongNos = congNoList.filter((c) => c.dntt_goc_id != null && cancelledIds.includes(c.dntt_goc_id));
    if (cancelledCongNos.some((c) => c.trang_thai === "con_du")) return "cong_no";
    if (cancelledCongNos.some((c) => c.trang_thai === "da_hoan_tien")) return "hoan_tien";

    const nonHuy = all.filter((d) => d.trang_thai_duyet !== "da_huy");
    if (nonHuy.length === 0) return "chua_de_nghi";

    if (nonHuy.every((d) => d.payment_status === "paid")) return "da_thanh_toan";

    if (nonHuy.some((d) => d.trang_thai_duyet === "cho_duyet")) return "cho_duyet";
    if (nonHuy.some((d) => d.trang_thai_duyet === "da_duyet")) return "da_duyet";
    if (nonHuy.some((d) => d.trang_thai_duyet === "tu_choi")) return "tu_choi";
    return "chua_de_nghi";
  };

  // Danh sách KS từ doan_ngay + orphaned KS từ DNTT + KS day-use (qua wrapper canh_diem)
  const orphanedKsIds = ksData?.orphanedKsIds || [];
  const dayUseKsIds = (ksData as any)?.dayUseKsIds || [];
  const distinctKsIdsFromNgay = [
    ...new Set([
      ...ngayRows.map((r: any) => r.khach_san_id).filter(Boolean),
      ...orphanedKsIds,
      ...dayUseKsIds,
    ]),
  ];

  const activeDnttByKs: Record<number, number> = {};
  dnttList.forEach((d) => {
    if (d.ref_loai === "khach_san" && d.ref_id &&
        d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
        d.payment_status !== "paid") {
      activeDnttByKs[d.ref_id] = d.id;
    }
  });
  dnttList.forEach((d) => {
    if (d.ref_loai === "khach_san" && d.ref_id &&
        d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
        !activeDnttByKs[d.ref_id]) {
      activeDnttByKs[d.ref_id] = d.id;
    }
  });

  const allSelected = selectedKsIds.length === distinctKsIdsFromNgay.length && distinctKsIdsFromNgay.length > 0;
  const ksWithDnttSelected = selectedKsIds.filter((id) => activeDnttByKs[id]).length;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-900 px-3 py-1.5 rounded-md">
        🏨 Khách sạn
        <Badge variant="secondary" className="text-xs">
          Điều tour
        </Badge>
      </h3>

      {distinctKsIdsFromNgay.length === 0 && localRows.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có chi phí khách sạn.</p>
      )}

      {/* Toolbar select + print */}
      {distinctKsIdsFromNgay.length > 0 && (
        <div className="flex items-center gap-3 py-1">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(v) =>
                v ? setSelectedKsIds([...distinctKsIdsFromNgay]) : setSelectedKsIds([])
              }
              id="select-all-ks"
            />
            <label htmlFor="select-all-ks" className="text-xs text-muted-foreground cursor-pointer select-none">
              {selectedKsIds.length > 0
                ? `Đã chọn ${selectedKsIds.length}/${distinctKsIdsFromNgay.length} KS`
                : "Chọn tất cả"}
            </label>
          </div>
          {selectedKsIds.length > 0 && (
            <>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => handlePrintSelected(activeDnttByKs)}
                disabled={ksWithDnttSelected === 0}
                title={ksWithDnttSelected === 0 ? "Không có KS nào đang có ĐNTT" : undefined}
              >
                <Printer className="h-3.5 w-3.5 mr-1" />
                {`In Word${ksWithDnttSelected > 0 ? ` (${ksWithDnttSelected})` : ""}`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => handleExportExcel(activeDnttByKs)}
                disabled={batchPrinting || ksWithDnttSelected === 0}
                title={ksWithDnttSelected === 0 ? "Không có KS nào đang có ĐNTT" : undefined}
              >
                Xuất Excel{ksWithDnttSelected > 0 ? ` (${ksWithDnttSelected})` : ""}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedKsIds([])}>
                Bỏ chọn
              </Button>
            </>
          )}
        </div>
      )}

      {/* Render từng KS có trong doan_ngay (không phụ thuộc localRows nữa) */}
      {distinctKsIdsFromNgay.map((ksId) => {
        const ks = khachSanMap[ksId];
        const rows = grouped[ksId] || [];
        const totalKSGross = rows.reduce((sum, r) => {
          return sum + (Number(r.so_phong) || 0) * (Number(r.gia_phong) || 0) * (Number(r.so_dem) || 1);
        }, 0);
        // Resolve FOC từ snapshot (per-tour) thay vì master — tránh master changes
        // ảnh hưởng đoàn cũ.
        const ksFoc = resolveKSFoc(rows, ks);
        const focDeduction = calcFocDeduction(rows, ksFoc.foc_khach, ksFoc.foc_mien);
        const totalKS = totalKSGross - focDeduction;

        const daCoc = cocByKs[ksId] || 0;
        const daTT = ttByKs[ksId] || 0;
        // Dùng thucTeByKs nếu có điều chỉnh, ngược lại dùng totalKS từ room pricing
        const thucTeKS = thucTeByKs[ksId] ?? totalKS;
        const daDieuChinh = thucTeByKs[ksId] != null && thucTeByKs[ksId] !== totalKS;
        const canTruAmtForKs = canTruAmtByKsId[ksId] || 0;
        const conLai = thucTeKS - daTT;
        const isDaTT = thucTeKS > 0 && daTT >= thucTeKS;
        const congNoAmount = congNoByKs[ksId] || 0;
        const hoanTienAmount = hoanTienByKs[ksId] || 0;
        const ksStatus = getKsChiPhiStatus(ksId);
        const ksStatusInfo = STATUS_LABEL[ksStatus] ?? STATUS_LABEL.chua_de_nghi;

        const activeDntt =
          dnttList.find((d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
            d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
            d.payment_status !== "paid") ??
          dnttList.find((d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
            d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi");

        const cancellableDntts = dnttList.filter(
          (d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
                 d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
        );
        const paidDnttsForKs = cancellableDntts.filter((d) => d.payment_status === "paid");
        const unpaidDnttsForKs = cancellableDntts.filter((d) => d.payment_status !== "paid");
        const canCancelKs = cancellableDntts.length > 0;

        // Aggregate-after-edits values cho KS card.
        // Identical pattern với DV/NH: sumActual (chi phí thực tế), sumPaid (đã TT),
        // groupCongNoTotal (cong_no đã ghi nhận, mọi state) → effectiveDelta + effectiveCommitted.
        const sumActual = thucTeKS;
        const sumPaid = daTT;
        const sumCommitted = cancellableDntts.reduce((s, d) => s + Number(d.so_tien), 0);
        const groupCongNoTotal = groupCongNoTotalByKs[ksId] || 0;
        const aggDelta = sumActual - sumPaid;
        const effectiveDelta = aggDelta + groupCongNoTotal;
        const effectiveCommitted = sumCommitted - groupCongNoTotal;
        const daDeNghi = unpaidDnttsForKs.reduce((s, d) => s + Math.max(0, d.so_tien - (d.paid_amount || 0)), 0);
        const showAggBtn = daDeNghi === 0 && sumPaid > 0 && effectiveDelta !== 0;
        const aggPaidDntt = paidDnttsForKs[0] ?? null;

        // Mismatch warning: chi_phi total ≠ DNTT committed (cho_duyet/da_duyet),
        // sau khi trừ cong_no đã ghi nhận. Trigger khi OP edit room (so_phong/gia_phong/FOC)
        // sau khi DNTT đã commit nhưng DNTT.so_tien chưa sửa.
        const hasCommittedDntt = cancellableDntts.some(
          (d) => d.trang_thai_duyet === "cho_duyet" || d.trang_thai_duyet === "da_duyet",
        );
        // Hide badge when footer button shows (redundant — same info conveyed)
        const dnttMismatch = hasCommittedDntt && sumActual !== effectiveCommitted && !showAggBtn
          ? sumActual - effectiveCommitted : 0;

        const byDay: Record<string, LocalKSRow[]> = {};
        rows.forEach((r) => {
          const key = r.ngay_date || "unknown";
          if (!byDay[key]) byDay[key] = [];
          byDay[key].push(r);
        });
        const dayEntries = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));

        const ngayDateToNgaySo: Record<string, number> = {};
        const ngayDateToDoanNgayId: Record<string, number> = {};
        ngayRows.forEach((r: any) => {
          if (r.khach_san_id === ksId) {
            ngayDateToNgaySo[r.ngay_date] = r.ngay_so;
            ngayDateToDoanNgayId[r.ngay_date] = r.id;
          }
        });
        // Bổ sung mapping từ day-use items (ngày day-use có thể không có khach_san_id qua đêm)
        Object.values(dayUseItemMap).forEach((info: any) => {
          if (info.khach_san_id === ksId && info.ngay_date) {
            ngayDateToNgaySo[info.ngay_date] = info.ngay_so;
            ngayDateToDoanNgayId[info.ngay_date] = info.doan_ngay_id;
          }
        });
        const isKsDayUse = dayUseKsIds.includes(ksId) && !ngayRows.some((r: any) => r.khach_san_id === ksId);

        const isOrphaned = orphanedKsIds.includes(ksId); // không còn trong điều tour
        const isKsDinhKy = dinhKyKsIds.has(ksId);

        // Orphaned + công nợ → auto-xóa, ẩn luôn khỏi UI
        if (isOrphaned && ksStatus === "cong_no") return null;

        // Hoàn tiền → ẩn khỏi tab chi phí, chỉ lưu trong công nợ
        if (ksStatus === "hoan_tien") return null;

        // KS còn trong điều tour dù đã có cong_no → coi như chi phí mới, không show annotation
        const effectiveKsStatus = (!isOrphaned && ksStatus === "cong_no") ? "chua_de_nghi" : ksStatus;

        // cong_no/hoan_tien: collapsed by default; others: expanded by default
        const defaultCollapsed = effectiveKsStatus === "cong_no" || effectiveKsStatus === "hoan_tien";
        const isCollapsed = toggledKsIds.has(ksId) ? !defaultCollapsed : defaultCollapsed;
        const showContent = !isCollapsed;

        return (
          <Card key={ksId} className={`border-border transition-colors ${selectedKsIds.includes(ksId) ? "border-primary/50 bg-primary/5" : ""}`}>
            <CardHeader className="py-1 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                  <Checkbox
                    checked={selectedKsIds.includes(ksId)}
                    onCheckedChange={() => toggleSelectKs(ksId)}
                    className="shrink-0"
                  />
                  <button
                    className="flex items-center gap-2 flex-wrap text-left"
                    onClick={() => toggleCollapse(ksId)}
                  >
                    {ks?.ten || `KS #${ksId}`}
                    {isKsDayUse && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                        Day Use
                      </span>
                    )}
                    {ks?.dia_diem && <span className="text-muted-foreground font-normal text-xs">({ks.dia_diem})</span>}
                    {effectiveKsStatus === "cong_no" && congNoAmount > 0 && (
                      <span className="text-purple-600 font-semibold text-xs">
                        — Công nợ: {fmt(congNoAmount)} VND
                      </span>
                    )}
                    {effectiveKsStatus === "hoan_tien" && hoanTienAmount > 0 && (
                      <span className="text-blue-600 font-semibold text-xs">
                        — Hoàn tiền: {fmt(hoanTienAmount)} VND
                      </span>
                    )}
                  </button>
                </CardTitle>
                <div className="flex items-center gap-2 shrink-0">
                  {isKsDinhKy && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">Định kỳ</span>
                  )}
                  {totalKS > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {daDieuChinh
                        ? <><span className="line-through">{fmt(totalKS)}</span> <span className="text-blue-600 font-medium">{fmt(thucTeKS)} ₫</span></>
                        : <span className="font-medium text-foreground">{fmt(totalKS)} ₫</span>
                      }
                    </span>
                  )}
                  {dnttMismatch !== 0 && (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap"
                      title={`Số tiền DNTT đã commit (${fmt(sumCommitted)} ₫) khác chi phí thực tế (${fmt(sumActual)} ₫). Sửa DNTT.so_tien (Pencil) hoặc hủy & tạo lại.`}
                    >
                      ⚠ DNTT lệch {dnttMismatch > 0 ? "+" : "−"}{fmt(Math.abs(dnttMismatch))}
                    </span>
                  )}
                  <KSFocEditor
                    doanId={doanId}
                    ksId={ksId}
                    rowIds={rows.map((r) => r.id).filter((id): id is number => id != null)}
                    focKhach={ksFoc.foc_khach}
                    focMien={ksFoc.foc_mien}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 text-xs px-2 gap-1", isKsDinhKy ? "text-indigo-700 hover:text-indigo-800" : "text-muted-foreground hover:text-foreground")}
                    onClick={() => handleToggleDinhKy(ksId)}
                    title={isKsDinhKy ? "Đang thanh toán định kỳ — bấm để bỏ" : "Đặt thanh toán định kỳ"}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {isKsDinhKy && "Định kỳ"}
                  </Button>
                  <button onClick={() => toggleCollapse(ksId)} className="text-muted-foreground hover:text-foreground">
                    {showContent
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {ks?.ncc_so_tai_khoan && (
                <p className="text-xs text-muted-foreground mt-1">
                  STK: {ks.ncc_so_tai_khoan} · {ks.ncc_ngan_hang || "—"}
                  {ks.ten_ncc && <span> ({ks.ten_ncc})</span>}
                </p>
              )}
            </CardHeader>
            {showContent && <CardContent className="px-4 pb-1.5 pt-0">
              {isOrphaned && (
                <p className="text-xs text-muted-foreground italic mb-2">
                  Khách sạn đã được xóa khỏi lịch trình điều tour.
                </p>
              )}
              {!isOrphaned && <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-xs">
                      <TableHead className="w-[120px] h-auto py-1 px-2">Loại phòng</TableHead>
                      <TableHead className="w-[60px] h-auto py-1 px-2">Số phòng</TableHead>
                      <TableHead className="w-[90px] h-auto py-1 px-2">C/I</TableHead>
                      <TableHead className="w-[90px] h-auto py-1 px-2">C/O</TableHead>
                      <TableHead className="w-[50px] h-auto py-1 px-2">Đêm</TableHead>
                      <TableHead className="w-[100px] h-auto py-1 px-2">Giá/phòng</TableHead>
                      <TableHead className="w-[110px] h-auto py-1 px-2">Thành tiền</TableHead>
                      <TableHead className="w-[32px] h-auto py-1 px-2" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dayEntries.map(([dateStr, dayRows]) => {
                      const ngaySo = ngayDateToNgaySo[dateStr];
                      const doanNgayId = ngayDateToDoanNgayId[dateStr] || dayRows[0]?.doan_ngay_id;
                      return (
                        <DayGroup
                          key={dateStr}
                          dateStr={dateStr}
                          ngaySo={ngaySo}
                          dayRows={dayRows}
                          localRows={localRows}
                          onFieldChange={handleFieldChange}
                          onBlurSave={handleBlurSave}
                          onDelete={handleDelete}
                          onAddRow={() => handleAddRow(ksId, doanNgayId, dateStr)}
                        />
                      );
                    })}
                    {ngayRows
                      .filter((r: any) => r.khach_san_id === ksId && !byDay[r.ngay_date])
                      .map((r: any) => (
                        <EmptyDayHeader
                          key={r.ngay_date}
                          dateStr={r.ngay_date}
                          ngaySo={r.ngay_so}
                          onAddRow={() => handleAddRow(ksId, r.id, r.ngay_date)}
                        />
                      ))}
                    {Object.entries(dayUseItemMap)
                      .filter(([, info]: any) => info.khach_san_id === ksId && !byDay[info.ngay_date])
                      .map(([itemIdStr, info]: any) => (
                        <EmptyDayHeader
                          key={`day-use-${itemIdStr}`}
                          dateStr={info.ngay_date}
                          ngaySo={info.ngay_so}
                          isDayUse
                          onAddRow={() => handleAddRow(ksId, info.doan_ngay_id, info.ngay_date, Number(itemIdStr))}
                        />
                      ))}
                  </TableBody>
                </Table>
              </div>}

              {/* ── Thanh toán section ── */}
              <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                {/* ĐNTT history list */}
                {(() => {
                  const allKsDntts = dnttList.filter(
                    (d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
                           d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
                  );
                  if (allKsDntts.length === 0) return null;
                  return (
                    <div className="rounded-md border border-border overflow-hidden">
                      {allKsDntts.map((dntt, i) => {
                        const isPaid = dntt.payment_status === "paid";
                        const isWaiting = dntt.trang_thai_duyet === "cho_duyet";
                        const isApproved = dntt.trang_thai_duyet === "da_duyet";
                        return (
                          <div
                            key={dntt.id}
                            className={cn(
                              "flex items-center justify-between px-3 py-1 text-xs",
                              i > 0 && "border-t border-border",
                              isPaid ? "bg-emerald-50/50" : "bg-muted/20",
                            )}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-muted-foreground font-mono">#{dntt.id}</span>
                              {isWaiting && editingDnttId === dntt.id ? (
                                <Input
                                  autoFocus
                                  type="number"
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const v = parseInt(editAmount.replace(/\D/g, ""), 10);
                                      if (!isNaN(v) && v > 0) {
                                        updateDNTT.mutate({ id: dntt.id, soTien: v });
                                        setEditingDnttId(null);
                                      }
                                    }
                                    if (e.key === "Escape") setEditingDnttId(null);
                                  }}
                                  className="h-6 w-28 text-xs px-2 py-0"
                                />
                              ) : (
                                <span className={cn(
                                  "font-semibold",
                                  isPaid ? "text-emerald-700" : "text-foreground",
                                )}>
                                  {fmt(dntt.so_tien)} ₫
                                </span>
                              )}
                              {dntt.la_coc && (
                                <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">Cọc</span>
                              )}
                              {(() => {
                                const ct = canTruByDnttId[dntt.id] || 0;
                                if (ct <= 0) return null;
                                const thucTT = Math.max(0, dntt.so_tien - ct);
                                return (
                                  <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px]"
                                    title={`Tổng ${fmt(dntt.so_tien)} − Cấn trừ ${fmt(ct)} = Thực TT ${fmt(thucTT)}`}>
                                    CT {fmt(ct)}
                                  </span>
                                );
                              })()}
                              <span className={cn(
                                "px-1.5 py-0.5 rounded text-[10px] font-medium",
                                isPaid ? "bg-emerald-100 text-emerald-700"
                                  : isWaiting ? "bg-yellow-100 text-yellow-700"
                                  : isApproved ? "bg-teal-100 text-teal-700"
                                  : "bg-muted text-muted-foreground",
                              )}>
                                {isPaid
                                  ? `Đã TT${dntt.thanh_toan_luc ? ` ${format(new Date(dntt.thanh_toan_luc), "dd/MM")}` : ""}`
                                  : isWaiting ? "Chờ duyệt"
                                  : isApproved ? "Đã duyệt"
                                  : "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {/* Sửa số tiền khi chờ duyệt */}
                              {isWaiting && editingDnttId === dntt.id ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700"
                                    disabled={updateDNTT.isPending}
                                    onClick={() => {
                                      const v = parseInt(editAmount.replace(/\D/g, ""), 10);
                                      if (!isNaN(v) && v > 0) {
                                        updateDNTT.mutate({ id: dntt.id, soTien: v });
                                        setEditingDnttId(null);
                                      }
                                    }}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => setEditingDnttId(null)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {isWaiting && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-blue-500 hover:text-blue-600"
                                      title="Sửa số tiền"
                                      onClick={() => {
                                        setEditingDnttId(dntt.id);
                                        setEditAmount(String(dntt.so_tien));
                                      }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {/* Per-DNTT "Điều chỉnh" cũ — REMOVED, replaced by aggregate footer button. */}
                                  {!isPaid && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        setCancelTarget({
                                          type: "dntt",
                                          ksId,
                                          ksName: ks?.ten || `KS #${ksId}`,
                                          paidDnttIds: [],
                                          unpaidDnttIds: [dntt.id],
                                          paidTotal: 0,
                                        });
                                      }}
                                    >
                                      <Ban className="h-3 w-3 mr-1" />
                                      Hủy
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {/* CN / HT badges — hiển thị tổng công nợ + hoàn tiền của KS này */}
                      {(congNoAmount > 0 || hoanTienAmount > 0) && (
                        <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/10 border-t border-border">
                          {congNoAmount > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 whitespace-nowrap">
                              CN: {fmt(congNoAmount)}
                            </span>
                          )}
                          {hoanTienAmount > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 whitespace-nowrap">
                              HT: {fmt(hoanTienAmount)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Aggregate breakdown row — chỉ hiện khi còn chênh lệch sau trừ cong_no */}
                {showAggBtn && (
                  <div className={cn(
                    "rounded px-3 py-1.5 text-[11px] flex items-center justify-between gap-3 flex-wrap",
                    effectiveDelta > 0 ? "bg-orange-50/70" : "bg-purple-50/70",
                  )}>
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
                    {/* Cả delta > 0 (thiếu) và delta < 0 (thừa) đều mở aggregate commit modal.
                        Modal có KSCongNoPanel cho cấn trừ + RadioGroup cho hoàn tiền/công nợ. */}
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
                          ksId,
                          ksName: ks?.ten || `KS #${ksId}`,
                          nccId: ks?.nha_cung_cap_id ?? null,
                          nccName: ks?.ten_ncc ?? null,
                          chiPhiIds: chiPhiIdsByKs[ksId] || [],
                          delta: effectiveDelta,
                          sumActual,
                          sumPaid,
                          groupCongNoCN: groupCongNoCNByKs[ksId] || 0,
                          groupCongNoHT: groupCongNoHTByKs[ksId] || 0,
                          paidDntt: aggPaidDntt,
                          serviceDate: rows[0]?.ngay_date ?? null,
                        });
                        setAggCanTru(null);
                        setAggReason("");
                        setAggSurplusMode("con_du");
                        // Default ngày cần TT cho delta > 0
                        if (effectiveDelta > 0 && rows[0]?.ngay_date) {
                          try {
                            const d = new Date(rows[0].ngay_date + "T00:00:00");
                            d.setDate(d.getDate() - 1);
                            setAggNgayCan(d.toISOString().slice(0, 10));
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
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 ml-auto">
                    {/* Ẩn nếu cong_no đã cover full sumPaid → đã settle qua agg modal.
                        Click "Hủy dịch vụ" sẽ tạo cong_no thứ 2 trên cùng cash payment → nhân đôi. */}
                    {paidDnttsForKs.length > 0 && groupCongNoTotal < sumPaid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          setCancelMode("hoan_tien");
                          setCancelTarget({
                            type: "dich_vu",
                            ksId,
                            ksName: ks?.ten || `KS #${ksId}`,
                            paidDnttIds: paidDnttsForKs.map((d) => d.id),
                            unpaidDnttIds: unpaidDnttsForKs.map((d) => d.id),
                            paidTotal: paidDnttsForKs.reduce((sum, d) => sum + d.so_tien, 0),
                          });
                        }}
                      >
                        <Ban className="h-3 w-3 mr-1" />
                        Hủy dịch vụ
                      </Button>
                    )}
                    {/* Thanh toán định kỳ: ẩn nút ĐNTT, kế toán xử lý qua trang định kỳ */}
                    {isKsDinhKy && effectiveKsStatus === "chua_de_nghi" && (
                      <span className="text-[11px] text-indigo-500 italic">Thanh toán định kỳ</span>
                    )}
                    {/* Chưa có DNTT nào → nút tạo lần đầu (giữ nguyên) */}
                    {!isKsDinhKy && effectiveKsStatus === "chua_de_nghi" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => { setModalKsId(ksId); setModalOpen(true); }}
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        Đề nghị TT
                      </Button>
                    )}
                    {/* "Đề nghị TT bổ sung / còn lại" cũ — REMOVED, replaced by aggregate breakdown button. */}
                  </div>
                </div>
              </div>
            </CardContent>}
          </Card>
        );
      })}

      {/* ĐNTT Modal */}
      {modalOpen && modalKsId != null && (
        <KSDNTTModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setModalKsId(null);
          }}
          doanId={doanId}
          ksId={modalKsId}
          ksName={khachSanMap[modalKsId]?.ten || `KS #${modalKsId}`}
          nccId={khachSanMap[modalKsId]?.nha_cung_cap_id || null}
          nccTen={khachSanMap[modalKsId]?.ten_ncc || null}
          nccStk={khachSanMap[modalKsId]?.ncc_so_tai_khoan || null}
          nccNganHang={khachSanMap[modalKsId]?.ncc_ngan_hang || null}
          totalKS={(() => {
            const modalRows = grouped[modalKsId] || [];
            const modalKs = khachSanMap[modalKsId];
            const gross = modalRows.reduce(
              (s, r) => s + (Number(r.so_phong) || 0) * (Number(r.gia_phong) || 0) * (Number(r.so_dem) || 1), 0,
            );
            return gross - calcFocDeduction(modalRows, modalKs?.foc_khach ?? null, modalKs?.foc_mien ?? null);
          })()}
          daCoc={(cocByKs[modalKsId] || 0) + (canTruAmtByKsId[modalKsId] || 0)}
          localRows={grouped[modalKsId] || []}
          chiPhiRowIds={(grouped[modalKsId] || []).filter((r) => r.id).map((r) => r.id!)}
          canTru={canTruByKs[modalKsId] ?? null}
          onCanTruChange={(v) => setCanTruByKs((prev) => ({ ...prev, [modalKsId]: v }))}
          tenDoanMoi={tenDoan}
          serviceDate={(() => {
            const rows = grouped[modalKsId] || [];
            const dates = rows.map((r) => r.ngay_date).filter(Boolean).sort();
            return dates[0] || undefined;
          })()}
        />
      )}

      {/* Aggregate Commit Dialog — chốt chênh lệch sau OP edit so_phong/gia_phong/FOC */}
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
              <p className="text-xs text-muted-foreground">{aggCommit.ksName}</p>
              <div className="space-y-1 text-xs border rounded px-2 py-1.5 bg-muted/30">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tổng thực tế (KS):</span>
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
                      <RadioGroupItem value="con_du" id="ks-agg-cn" className="mt-0.5" />
                      <Label htmlFor="ks-agg-cn" className="text-xs cursor-pointer leading-tight">
                        <span className="font-medium">Ghi nhận công nợ</span>
                        <p className="text-muted-foreground font-normal">NCC giữ tiền — có thể cấn trừ với DNTT khác cùng NCC</p>
                      </Label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="hoan_tien" id="ks-agg-ht" className="mt-0.5" />
                      <Label htmlFor="ks-agg-ht" className="text-xs cursor-pointer leading-tight">
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
                  <Input
                    type="date"
                    className="h-8 text-xs"
                    value={aggNgayCan}
                    onChange={e => setAggNgayCan(e.target.value)}
                  />
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
                      ? "VD: phụ thu giường phụ..."
                      : "VD: 1 phòng không sử dụng..."
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

      {/* Adjustment dialog (legacy — vẫn giữ code nhưng button đã ẩn) */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) { setAdjustTarget(null); setAdjustSurplusMode("cong_no"); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Điều chỉnh sau thanh toán</DialogTitle>
          </DialogHeader>
          {adjustTarget && (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-xs text-muted-foreground">{adjustTarget.mo_ta}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Đã thanh toán:</span>
                <span className="font-semibold">{fmt(adjustTarget.so_tien)} ₫</span>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Số tiền thực tế</label>
                <input
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập số tiền..."
                />
              </div>
              {(() => {
                const actual = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(actual) || actual === adjustTarget.so_tien) return null;
                const delta = actual - adjustTarget.so_tien;
                if (delta > 0) return (
                  <div className="rounded px-3 py-2 text-xs font-medium bg-yellow-50 text-yellow-700">
                    Thiếu {fmt(delta)} ₫ → tạo ĐNTT bổ sung (chờ duyệt)
                  </div>
                );
                return (
                  <div className="space-y-1.5">
                    <p className="text-xs text-purple-700 font-medium">Thừa {fmt(Math.abs(delta))} ₫ — chọn hình thức xử lý:</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAdjustSurplusMode("cong_no")}
                        className={cn("flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors",
                          adjustSurplusMode === "cong_no" ? "border-purple-400 bg-purple-50 text-purple-700" : "border-border text-muted-foreground hover:border-muted-foreground"
                        )}>Ghi công nợ NCC</button>
                      <button type="button" onClick={() => setAdjustSurplusMode("hoan_tien")}
                        className={cn("flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors",
                          adjustSurplusMode === "hoan_tien" ? "border-green-400 bg-green-50 text-green-700" : "border-border text-muted-foreground hover:border-muted-foreground"
                        )}>Hoàn tiền</button>
                    </div>
                  </div>
                );
              })()}
              <div className="space-y-1">
                <label className="text-xs font-medium">Lý do</label>
                <Textarea
                  className="text-xs min-h-[56px]"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="VD: Đổi loại phòng, giảm số đêm..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => { setAdjustTarget(null); setAdjustSurplusMode("cong_no"); }}>Đóng</Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={
                adjustMut.isPending ||
                !adjustAmount ||
                parseInt(adjustAmount.replace(/\D/g, ""), 10) === adjustTarget?.so_tien
              }
              onClick={() => {
                if (!adjustTarget) return;
                const soTienThucTe = parseInt(adjustAmount.replace(/\D/g, ""), 10);
                if (isNaN(soTienThucTe)) return;
                adjustMut.mutate(
                  { dnttGoc: adjustTarget, soTienThucTe, lyDo: adjustReason || "Điều chỉnh số lượng", surplusMode: adjustSurplusMode },
                  {
                    onSuccess: (result) => {
                      if (!result) return;
                      if (result.delta > 0) toast.success(`Đã tạo ĐNTT bổ sung ${fmt(result.delta)} ₫`);
                      else if (adjustSurplusMode === "hoan_tien") toast.success(`Đã ghi hoàn tiền ${fmt(Math.abs(result.delta))} ₫`);
                      else toast.success(`Đã ghi công nợ ${fmt(Math.abs(result.delta))} ₫`);
                      setAdjustTarget(null);
                      setAdjustSurplusMode("cong_no");
                    },
                    onError: (err: any) => toast.error("Lỗi: " + (err?.message || "")),
                  },
                );
              }}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {cancelTarget?.type === "dntt" ? "Hủy đề nghị thanh toán" : "Hủy sử dụng dịch vụ"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm font-medium">{cancelTarget?.ksName}</p>

            {cancelTarget?.type === "dntt" ? (
              /* Hủy ĐNTT: chỉ cancel khoản chưa TT để tạo lại */
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Hủy {cancelTarget.unpaidDnttIds.length} đề nghị thanh toán đang chờ xử lý.
                  Sau khi hủy, bạn có thể tạo đề nghị mới với số tiền chính xác hơn.
                </p>
                <p className="text-xs text-muted-foreground">
                  Các khoản đã thanh toán trước đó không bị ảnh hưởng.
                </p>
              </div>
            ) : (
              /* Hủy dịch vụ: cancel tất cả, hỏi xử lý tiền đã TT */
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1 text-xs">
                  {cancelTarget && cancelTarget.paidTotal > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đã thanh toán ({cancelTarget.paidDnttIds.length} khoản)</span>
                      <span className="font-semibold text-destructive">{fmt(cancelTarget.paidTotal)} VND</span>
                    </div>
                  )}
                  {cancelTarget && cancelTarget.unpaidDnttIds.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Đề nghị chưa TT ({cancelTarget.unpaidDnttIds.length} khoản)</span>
                      <span className="text-muted-foreground">→ hủy đề nghị</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium">Xử lý {fmt(cancelTarget?.paidTotal ?? 0)} VND đã thanh toán:</p>
                  <RadioGroup value={cancelMode} onValueChange={(v) => setCancelMode(v as "cong_no" | "hoan_tien")} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="hoan_tien" id="ks-hoan" className="mt-0.5" />
                      <Label htmlFor="ks-hoan" className="text-xs cursor-pointer">
                        <span className="font-medium">Hoàn lại tiền</span>
                        <p className="text-muted-foreground font-normal">Nhà cung cấp trả lại tiền cho công ty</p>
                      </Label>
                    </div>
                    <div className="flex items-start gap-2">
                      <RadioGroupItem value="cong_no" id="ks-cno" className="mt-0.5" />
                      <Label htmlFor="ks-cno" className="text-xs cursor-pointer">
                        <span className="font-medium">Cấn trừ công nợ</span>
                        <p className="text-muted-foreground font-normal">Giữ lại làm công nợ, cấn trừ vào booking sau</p>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setCancelTarget(null)}>Đóng</Button>
            <Button variant="destructive" size="sm" className="text-xs" onClick={handleCancelSubmit} disabled={cancelMut.isPending}>
              {cancelMut.isPending ? "Đang xử lý..." : "Xác nhận hủy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ĐNTT preview modal */}
      <DNTTKSPreviewModal
        open={!!previewItems}
        items={previewItems ?? []}
        onClose={() => setPreviewItems(null)}
      />
    </div>
  );
}

/* ── Day group header + rows ── */
function DayGroup({
  dateStr,
  ngaySo,
  dayRows,
  localRows,
  onFieldChange,
  onBlurSave,
  onDelete,
  onAddRow,
}: {
  dateStr: string;
  ngaySo?: number;
  dayRows: LocalKSRow[];
  localRows: LocalKSRow[];
  onFieldChange: (idx: number, field: string, value: any) => void;
  onBlurSave: (idx: number) => void;
  onDelete: (idx: number) => void;
  onAddRow: () => void;
}) {
  const label =
    dateStr !== "unknown"
      ? `Ngày ${ngaySo ?? "?"} · ${format(new Date(dateStr), "dd/MM")} (${dayLabel(dateStr)})`
      : "Không xác định";

  return (
    <>
      <TableRow className="bg-[#E6F1FB] hover:bg-[#E6F1FB]">
        <TableCell colSpan={7} className="py-1 px-2 text-xs font-medium">
          {label}
        </TableCell>
        <TableCell className="py-1 px-2 text-right">
          <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5" onClick={onAddRow}>
            <Plus className="h-3 w-3 mr-0.5" />
            Thêm
          </Button>
        </TableCell>
      </TableRow>
      {dayRows.map((row) => {
        const globalIdx = localRows.indexOf(row);
        return (
          <KSRowInput
            key={`${row.doan_ngay_id}-${globalIdx}`}
            row={row}
            globalIdx={globalIdx}
            onFieldChange={onFieldChange}
            onBlurSave={onBlurSave}
            onDelete={onDelete}
          />
        );
      })}
    </>
  );
}

/* ── Empty day header ── */
function EmptyDayHeader({ dateStr, ngaySo, isDayUse, onAddRow }: { dateStr: string; ngaySo?: number; isDayUse?: boolean; onAddRow: () => void }) {
  const label = `Ngày ${ngaySo ?? "?"} · ${format(new Date(dateStr), "dd/MM")} (${dayLabel(dateStr)})`;
  return (
    <TableRow className="bg-[#E6F1FB] hover:bg-[#E6F1FB]">
      <TableCell colSpan={7} className="py-1 px-2 text-xs font-medium">
        {label}
        {isDayUse && (
          <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
            Day Use
          </span>
        )}
      </TableCell>
      <TableCell className="py-1 px-2 text-right">
        <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5" onClick={onAddRow}>
          <Plus className="h-3 w-3 mr-0.5" />
          Thêm
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ── KS FOC editor ────────────────────────────────────────────
// Edit FOC snapshot per-tour. Blur-save → update tất cả chi_phi rows của KS này
// trong đoàn hiện tại. Master không thay đổi.
function KSFocEditor({
  doanId, ksId, rowIds, focKhach, focMien,
}: {
  doanId: number;
  ksId: number;
  rowIds: number[];
  focKhach: number | null;
  focMien: number | null;
}) {
  const qc = useQueryClient();
  const [k, setK] = useState(focKhach != null ? String(focKhach) : "");
  const [m, setM] = useState(focMien != null ? String(focMien) : "");

  // Sync khi prop đổi (load lần đầu)
  useEffect(() => { setK(focKhach != null ? String(focKhach) : ""); }, [focKhach]);
  useEffect(() => { setM(focMien != null ? String(focMien) : ""); }, [focMien]);

  const save = async () => {
    const nextK = k.trim() === "" ? null : Number(k) || null;
    const nextM = m.trim() === "" ? null : Number(m) || null;
    if (nextK === focKhach && nextM === focMien) return;
    if (rowIds.length === 0) return; // không có row nào saved → snapshot sẽ ghi khi save lần đầu

    const { error } = await externalSupabase
      .from("doan_chi_phi")
      .update({ foc_khach_snapshot: nextK, foc_mien_snapshot: nextM })
      .in("id", rowIds);
    if (error) return;
    qc.invalidateQueries({ queryKey: ["doan_chi_phi", doanId] });
  };
  void ksId; // ksId reserved cho future filter (multi-KS update qua join)

  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title="FOC: cứ X phòng/đêm miễn Y phòng (per tour)">
      FOC
      <input
        value={k}
        onChange={(e) => setK(e.target.value)}
        onBlur={save}
        type="number"
        min={0}
        placeholder="—"
        className="w-9 h-6 px-1 text-xs text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background"
      />
      <span>免</span>
      <input
        value={m}
        onChange={(e) => setM(e.target.value)}
        onBlur={save}
        type="number"
        min={0}
        placeholder="—"
        className="w-9 h-6 px-1 text-xs text-center border rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none bg-background"
      />
    </span>
  );
}
