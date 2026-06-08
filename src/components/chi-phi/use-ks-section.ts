import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import { errMsg } from "@/lib/error";
import { useCreateAdjustment, useUpdateDNTT } from "@/hooks/use-dntt";
import type { DNTTRow } from "@/hooks/use-dntt";
import {
  useChiPhiKSData,
  useChiPhiList,
  useUpsertChiPhi,
  useDeleteChiPhi,
  useDNTTList,
  useInsertDNTT,
} from "@/hooks/use-chi-phi";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";
import { useCancelDNTT, recalcChiPhiStatus } from "@/hooks/use-dntt";
import { usePaymentsByChiPhi, createCanTruPayments } from "@/hooks/use-payments";
import { useCongNoList, isDnttPaidFromPrepaid } from "@/hooks/use-cong-no";
import { externalSupabase } from "@/lib/supabase-external";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUserName } from "@/hooks/use-doan";
import { toast } from "sonner";
import { type CanTruSelection } from "./KSCongNoPanel";
import { exportDNTTKSExcel } from "@/lib/export-dntt-ks-excel";
import type { EdgeFunctionData } from "@/lib/export-dntt-ks-word";
import {
  isKSRoomRow,
  calcRowFocBreakdown,
  resolveKSFoc,
} from "@/lib/foc-calc";
import { fmt, fmtDateDisplay, buildKSRowFromCp, calcKSPaidTotal, type KSLoaiRow, type LocalKSRow } from "./ks-section-shared";
import { useAuditLogger } from "@/hooks/use-activity-log";
import { mergeConsecutiveKSNights, addDaysIso, type KSRoomNight } from "@/lib/ks-dntt-merge";
import { buildCanTruNote } from "@/lib/can-tru-note";
import { type AggCommitKSTarget } from "./KSAggCommitModal";
import { type KSCancelTarget } from "./KSCancelModal";

interface KSSectionParams {
  doanId: number;
  soKhach?: number;
  tenDoan?: string;
}

// "Điều chỉnh" modal target — mở per-booking khi KS đã có DNTT paid.
export interface KSAdjustTarget {
  ksId: number;
  ksName: string;
  rows: LocalKSRow[];
  focKhach: number | null;
  focMien: number | null;
  sumPaid: number;
}

// Toàn bộ state + effect + handler của tab Chi phí Khách sạn.
// Tách verbatim từ ChiPhiKSSection — component chỉ còn phần render.
export function useKSSection({ doanId, soKhach = 0, tenDoan = "" }: KSSectionParams) {
  const { data: ksData, isLoading: ksLoading } = useChiPhiKSData(doanId);
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const chiPhiRowsRef = useRef(chiPhiRows);
  useEffect(() => { chiPhiRowsRef.current = chiPhiRows; }, [chiPhiRows]);
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
  const auditLog = useAuditLogger();
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
  const [batchPrinting] = useState(false);
  const [selectedKsIds, setSelectedKsIds] = useState<number[]>([]);
  const [previewItems, setPreviewItems] = useState<EdgeFunctionData[] | null>(null);

  const toggleSelectKs = (ksId: number) =>
    setSelectedKsIds((prev) => prev.includes(ksId) ? prev.filter((x) => x !== ksId) : [...prev, ksId]);

  const buildKSData = (ksId: number, dnttId: number) => {
    const dntt = dnttList.find((d) => d.id === dnttId);
    if (!dntt || !ksData) throw new Error("Thiếu dữ liệu ĐNTT hoặc khách sạn");

    const ks = ksData.khachSanMap[ksId];
    if (!ks) throw new Error("Không tìm thấy thông tin khách sạn");

    // Lấy ngày từ ngayRows (nguồn chính xác) theo doan_ngay_id
    const ngayDateMap: Record<number, string> = {};
    ksData.ngayRows.forEach((n) => {
      ngayDateMap[n.id] = n.ngay_date ?? "";
    });

    // Room entries from localRows for this KS — sort theo ngày, sau đó loại phòng
    // để DNTT hiển thị nhất quán giữa các KS (tránh case 1 KS sort theo ngày, KS khác sort theo loại phòng).
    const ksRows = localRowsRef.current
      .filter((r) => r.khach_san_id === ksId)
      .slice()
      .sort((a, b) => {
        const da = ngayDateMap[a.doan_ngay_id] || a.ngay_date || "";
        const db = ngayDateMap[b.doan_ngay_id] || b.ngay_date || "";
        if (da !== db) return da.localeCompare(db);
        return (a.loai_phong || "").localeCompare(b.loai_phong || "");
      });

    // FOC config + pro-rata foc_count per row (theo cùng công thức UI + handleBlurSave)
    const ksFocCfg = resolveKSFoc(ksRows, ks);
    const rowsByDayKey = new Map<string, LocalKSRow[]>();
    ksRows.forEach((r) => {
      const k = r.ngay_date || "";
      if (!rowsByDayKey.has(k)) rowsByDayKey.set(k, []);
      rowsByDayKey.get(k)!.push(r);
    });

    // 1 entry / đêm (ngày ISO để gộp), giữ FOC pro-rata theo từng đêm.
    const nightEntries: KSRoomNight[] = ksRows.map((r) => {
      const ngayDate = ngayDateMap[r.doan_ngay_id] || r.ngay_date || r.ci || "";
      const sameDay = rowsByDayKey.get(r.ngay_date || "") || [];
      // Rooms: FOC pro-rata. Services: foc_count manual của row.
      const focCount = isKSRoomRow(r)
        ? calcRowFocBreakdown(r, sameDay, ksFocCfg.foc_khach, ksFocCfg.foc_mien).rowFocCount
        : Math.max(0, Number(r.foc_count) || 0);
      return {
        name: r.loai_phong || (isKSRoomRow(r) ? "Phòng KS" : "Dịch vụ KS"),
        so_luong: r.so_phong,
        don_gia: r.gia_phong,
        foc_count: focCount,
        so_dem: r.so_dem || 1,
        ngayDate,
      };
    });
    // Gộp đêm liên tiếp cùng cơ cấu phòng → 1 dòng (như bản booking). Tổng tiền không đổi.
    const roomEntries: { name: string; so_luong: number; don_gia: number; so_dem: number; ci: string; co: string; foc_count: number }[] =
      mergeConsecutiveKSNights(nightEntries).map((m) => ({
        name: m.name,
        so_luong: m.so_luong,
        don_gia: m.don_gia,
        so_dem: m.so_dem,
        ci: m.ngayDate ? fmtDateDisplay(m.ngayDate) : "",
        co: m.ngayDate ? fmtDateDisplay(addDaysIso(m.ngayDate, m.so_dem)) : "",
        foc_count: m.foc_count,
      }));
    if (roomEntries.length === 0) roomEntries.push({ name: "—", so_luong: 1, don_gia: 0, so_dem: 1, ci: "", co: "", foc_count: 0 });

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
    const ngayRow = ksData.ngayRows.find((r) => r.khach_san_id === ksId);
    const codeKS = ngayRow?.ks_ma_code || "";

    // cocTotal: tiền KS đã thanh toán qua các ĐNTT KHÁC (cọc HOẶC trả 1 phần).
    // Dùng paid_amount thực tế + KHÔNG lọc la_coc — trả 1 phần thường ghi qua ĐNTT
    // non-cọc (la_coc=false), lọc la_coc sẽ bỏ sót → cột "Đã thanh toán" hiện "—".
    const cocTotal = calcKSPaidTotal(dnttList, dnttId, ksId);

    // canTru: tổng can_tru payments của ĐNTT đang preview
    const canTruTotal = canTruByDnttId[dnttId] || 0;
    const ksChiPhiIds = chiPhiRows
      .filter((cp) => cp.danh_muc === "khach_san" && cp.ref_doan_ngay_id != null)
      .filter((cp) => {
        const ng = ksData?.ngayRows.find((r) => r.id === cp.ref_doan_ngay_id);
        return ng?.khach_san_id === ksId;
      })
      .map((cp) => cp.id!)
      .filter(Boolean);
    void ksChiPhiIds; // legacy — không còn dùng vì canTruTotal lấy theo dntt_id
    // Nguồn cấn trừ "Cấn trừ từ đoàn: <nguồn>" (buildCanTruNote — đồng bộ NH/DV).
    // Fallback "Cấn trừ công nợ" cho payment cũ thiếu ghi_chu.
    const canTruPays = paymentsList.filter((p) => p.dntt_id === dnttId && p.method === "can_tru");
    const canTruNote = canTruTotal > 0
      ? (buildCanTruNote(canTruPays) ?? "Cấn trừ công nợ")
      : "";

    const focDisplay =
      ks.foc_khach && ks.foc_mien ? `${ks.foc_khach}/${ks.foc_mien}` : "—";

    return {
      doan: { ten_doan: tenDoan || String(doanId), so_khach: soKhach },
      ks: { ten: ks.ten, foc_khach: ks.foc_khach ?? null, foc_mien: ks.foc_mien ?? null },
      // Thông tin ngân hàng lấy từ khach_san.tai_khoan_thanh_toan (blob multiline
      // chứa tên NCC + STK + tên NH đã được nhập sẵn). KHÔNG lấy từ NCC.
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
    } catch (err: unknown) {
      toast.error("Lỗi tải dữ liệu: " + (errMsg(err) || ""));
    }
  };

  const handleExportExcel = (activeDnttByKs: Record<number, number>) => {
    const pairs = validateAndBuildPairs(activeDnttByKs);
    if (!pairs) return;
    try {
      const allData = pairs.map(({ ksId, dnttId }) => buildKSData(ksId, dnttId));
      exportDNTTKSExcel(allData, tenDoan || String(doanId));
      toast.success("Đã xuất file Excel");
    } catch (err: unknown) {
      toast.error("Lỗi xuất file: " + (errMsg(err) || ""));
    }
  };

  // Cancel DNTT state
  const [cancelTarget, setCancelTarget] = useState<KSCancelTarget | null>(null);
  const [cancelMode, setCancelMode] = useState<"cong_no" | "hoan_tien">("hoan_tien");

  // Điều chỉnh sau thanh toán (legacy — vẫn giữ cho compat, button đã ẩn)
  const adjustMut = useCreateAdjustment();
  const [adjustTarget, setAdjustTarget] = useState<DNTTRow | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSurplusMode, setAdjustSurplusMode] = useState<"cong_no" | "hoan_tien">("cong_no");

  // Aggregate commit dialog (chốt chênh lệch sau OP edit so_phong/gia_phong/FOC)
  const [aggCommit, setAggCommit] = useState<AggCommitKSTarget | null>(null);
  // "Điều chỉnh" modal — mở per-booking khi KS đã có DNTT paid (mới, khác adjustTarget legacy ở trên).
  const [ksAdjustTarget, setKsAdjustTarget] = useState<KSAdjustTarget | null>(null);
  const [aggReason, setAggReason] = useState("");
  const [aggNgayCan, setAggNgayCan] = useState("");
  const [aggSurplusMode, setAggSurplusMode] = useState<"con_du" | "hoan_tien">("con_du");
  const [aggCanTru, setAggCanTru] = useState<CanTruSelection[]>([]);
  // Cho phép cọc nhiều lần: mode "full" = toàn bộ delta, "deposit" = 1 phần (cọc tiếp).
  // la_coc=true khi mode="deposit".
  const [aggCommitMode, setAggCommitMode] = useState<"full" | "deposit">("full");
  const [aggDepositAmount, setAggDepositAmount] = useState<number>(0);

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
            ? `Điều chỉnh giảm KS (${ksName}) — ${lyDoLabel}. Lý do: ${aggReason}`
            : `Điều chỉnh giảm KS (${ksName}) — ${lyDoLabel}`,
        });
        if (error) throw error;
        if (chiPhiIds.length > 0) await recalcChiPhiStatus(chiPhiIds);
        auditLog({
          doan_id: doanId,
          action: "tao",
          table_name: "cong_no",
          record_id: chiPhiIds[0] ?? null,
          mo_ta: `Ghi nhận ${lyDoLabel} ${fmt(absDelta)} ₫ — KS ${ksName ?? ""}${nccName ? " (NCC " + nccName + ")" : ""}`,
        });
        toast.success(
          aggSurplusMode === "hoan_tien"
            ? `Đã ghi nhận hoàn tiền ${fmt(absDelta)} ₫`
            : `Đã ghi nhận công nợ ${fmt(absDelta)} ₫`,
        );
      } else {
        // Thiếu → tạo DNTT bổ sung. Mode "deposit" → la_coc=true + so_tien=aggDepositAmount
        // (cho phép cọc nhiều lần). Mode "full" → so_tien=absDelta + la_coc=false như cũ.
        const isDepositMode = aggCommitMode === "deposit";
        const dnttAmount = isDepositMode
          ? Math.max(0, Math.min(aggDepositAmount, absDelta))
          : absDelta;
        if (dnttAmount <= 0) {
          toast.error("Số tiền cọc phải lớn hơn 0");
          return;
        }
        // Allocations pro-rata theo chi_phi.tien_cong_ty hiện tại.
        const cps = chiPhiRows.filter((cp) => chiPhiIds.includes(cp.id!));
        const totalCt = cps.reduce((s, c) => s + Number(c.tien_cong_ty ?? 0), 0);
        const allocs: { chi_phi_id: number; so_tien: number }[] = [];
        if (totalCt > 0 && cps.length > 0) {
          let assigned = 0;
          for (let i = 0; i < cps.length; i++) {
            const isLast = i === cps.length - 1;
            const portion = isLast
              ? dnttAmount - assigned
              : Math.round(dnttAmount * (Number(cps[i].tien_cong_ty ?? 0) / totalCt));
            if (portion > 0) {
              allocs.push({ chi_phi_id: cps[i].id!, so_tien: portion });
              assigned += portion;
            }
          }
        }
        const moTaPrefix = isDepositMode ? "[Cọc bổ sung]" : "[Bổ sung]";
        const newDntt = await insertDNTT.mutateAsync({
          doan_id: doanId,
          loai: "khach_san",
          mo_ta: `${moTaPrefix} ${ksName}`.trim(),
          nha_cung_cap_id: nccId,
          ten_nha_cung_cap: nccName ?? null,
          so_tien: dnttAmount,
          la_coc: isDepositMode,
          trang_thai_duyet: "cho_duyet",
          ref_loai: "khach_san",
          ref_id: ksId,
          ngay_can_thanh_toan: aggNgayCan || null,
          ghi_chu: aggReason ? `Lý do: ${aggReason}` : null,
          allocations: allocs.length > 0 ? allocs : undefined,
        });
        const newDnttId = newDntt?.id ?? null;

        // Gộp nhiều cấn trừ cùng NCC — clamp tổng ≤ dnttAmount
        const canTruItems: { congNoId: number; soTien: number; sourceTenDoan: string }[] = [];
        let ctRemain = dnttAmount;
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
            recalcChiPhiIds: chiPhiIds.length > 0 ? chiPhiIds : undefined,
          });
        }

        const successPrefix = isDepositMode ? "Đã tạo ĐNTT cọc bổ sung" : "Đã tạo ĐNTT bổ sung";
        toast.success(
          canTruAmt > 0
            ? `${successPrefix} ${fmt(dnttAmount)} ₫ (cấn trừ ${fmt(canTruAmt)} ₫, cash còn ${fmt(dnttAmount - canTruAmt)} ₫)`
            : `${successPrefix} ${fmt(dnttAmount)} ₫`,
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
      setAggCanTru([]);
      setAggCommitMode("full");
      setAggDepositAmount(0);
    } catch (err: unknown) {
      toast.error("Lỗi: " + (errMsg(err) || ""));
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
    } catch (err: unknown) {
      toast.error("Lỗi khi hủy: " + (errMsg(err) || ""));
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
      ...(ksData.ngayRows || []).map((r) => r.id),
      ...Object.values(ksData.dayUseItemMap || {}).map((info) => info.doan_ngay_id),
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
  const [canTruByKs, setCanTruByKs] = useState<Record<number, CanTruSelection[]>>({});

  // Định kỳ: track per ksId
  const [dinhKyKsIds, setDinhKyKsIds] = useState<Set<number>>(new Set());
  const dinhKyKsIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => { dinhKyKsIdsRef.current = dinhKyKsIds; }, [dinhKyKsIds]);

  // Nguồn thanh toán per DÒNG dịch vụ KS: row.is_hdv (derive từ chi_phi
  // tien_hdv>0, dựng trong buildKSRowFromCp). HDV → tien_hdv, loại khỏi tổng
  // KS + ĐNTT + "Công ty thanh toán". Chỉ dòng dịch vụ (non-room) — phòng FOC
  // luôn Công ty (không đụng FOC math).

  // Dòng đang sửa dở (có id) — reconcile bỏ qua để không đè cái user đang gõ.
  const dirtyRowIdsRef = useRef<Set<number>>(new Set());
  // dinhKyKsIds chỉ init 1 lần từ DB (không clobber toggle của user).
  const dinhKyInitRef = useRef(false);

  // RECONCILE — nguồn sự thật cho dòng ĐÃ LƯU = chiPhiRows (doan_chi_phi =
  // snapshot CỦA TOUR). KHÔNG đọc danh mục. Mỗi lần chiPhiRows/ksData đổi
  // (mount / realtime invalidate) → dựng lại dòng đã lưu từ DB; overlay:
  //   - dòng đang sửa dở (dirty)            → giữ bản local
  //   - dòng chưa lưu (id == null)          → giữ bản local
  //   - dòng vừa lưu mà chiPhiRows lag      → giữ bản local
  // ⇒ bảng số luôn khớp DB như badge (không trễ/không F5), không reset
  //   người đang nhập. localRows chỉ còn buffer dirty + dòng chưa lưu.
  useEffect(() => {
    if (!ksData) return;
    const ksChiPhi = chiPhiRows.filter((c) => c.danh_muc === "khach_san");
    const ngayMap: Record<number, KSNgayRow> = {};
    (ksData.ngayRows || []).forEach((r) => { ngayMap[r.id] = r; });
    const dayUseItemMap = ksData.dayUseItemMap || {};

    // dinhKyKsIds: init 1 lần từ DB
    if (!dinhKyInitRef.current && ksChiPhi.length > 0) {
      dinhKyInitRef.current = true;
      const dkIds = new Set<number>(
        ksChiPhi
          .filter((cp) => cp.thanh_toan_dinh_ky)
          .map((cp) => ngayMap[cp.ref_doan_ngay_id!]?.khach_san_id as number)
          .filter(Boolean),
      );
      if (dkIds.size > 0) setDinhKyKsIds(dkIds);
    }

    setLocalRows((prev) => {
      const dbRows = ksChiPhi
        .map((cp) => buildKSRowFromCp(cp, ngayMap, dayUseItemMap))
        .filter((r): r is LocalKSRow => r !== null);
      const dbById = new Map<number, LocalKSRow>();
      dbRows.forEach((r) => { if (r.id != null) dbById.set(r.id, r); });
      const prevById = new Map<number, LocalKSRow>();
      prev.forEach((r) => { if (r.id != null) prevById.set(r.id, r); });

      const merged: LocalKSRow[] = [];
      // 1. Dòng đã lưu: lấy từ DB; dirty → giữ bản local đang gõ.
      for (const dbRow of dbRows) {
        if (dbRow.id != null && dirtyRowIdsRef.current.has(dbRow.id)) {
          merged.push(prevById.get(dbRow.id) ?? dbRow);
        } else {
          merged.push(dbRow);
        }
      }
      // 2. Dòng local có id nhưng chưa thấy trong DB (vừa lưu, chiPhiRows
      //    chưa refetch kịp) → giữ để không nhấp nháy/mất.
      for (const p of prev) if (p.id != null && !dbById.has(p.id)) merged.push(p);
      // 3. Dòng chưa lưu (id == null) → giữ nguyên.
      for (const p of prev) if (p.id == null) merged.push(p);

      // So sánh nông tránh set thừa (loop với persist effect).
      // PHẢI gồm khach_san_id + ref_doan_ngay_item_id + doan_ngay_id: đây là field
      // STRUCTURAL quyết định row thuộc card nào. Khi DB sửa link day-use (row nhảy
      // KS được chỉnh lại) chỉ 2 field này đổi, các field tiền/SL/ngày giữ nguyên →
      // thiếu chúng trong so sánh → reconcile return prev → giữ row cũ sai từ
      // sessionStorage (F5 không sửa, phải đóng tab mở mới).
      if (merged.length === prev.length) {
        let same = true;
        for (let i = 0; i < merged.length; i++) {
          const a = merged[i], b = prev[i];
          if (
            a.id !== b.id ||
            a.khach_san_id !== b.khach_san_id ||
            (a.ref_doan_ngay_item_id ?? null) !== (b.ref_doan_ngay_item_id ?? null) ||
            a.doan_ngay_id !== b.doan_ngay_id ||
            a.so_phong !== b.so_phong ||
            a.gia_phong !== b.gia_phong ||
            a.loai_phong !== b.loai_phong ||
            (a.foc_khach_snapshot ?? null) !== (b.foc_khach_snapshot ?? null) ||
            (a.foc_mien_snapshot ?? null) !== (b.foc_mien_snapshot ?? null) ||
            Number(a.foc_count ?? 0) !== Number(b.foc_count ?? 0) ||
            (a.loai_row ?? "phong") !== (b.loai_row ?? "phong") ||
            (a.trang_thai_hoa_don ?? null) !== (b.trang_thai_hoa_don ?? null) ||
            a.thanh_tien !== b.thanh_tien ||
            a.ngay_date !== b.ngay_date
          ) { same = false; break; }
        }
        if (same) return prev;
      }
      return merged;
    });
  }, [chiPhiRows, ksData]);

  // Toggle nguồn 1 DÒNG dịch vụ KS (Công ty ↔ HDV): flip tien_cong_ty ↔
  // tien_hdv của đúng dòng đó, giữ nguyên số tiền. Dòng dịch vụ KHÔNG nằm
  // trong pool FOC phòng → không ảnh hưởng dòng khác.
  const handleToggleRowNguoiTt = useCallback((globalIdx: number) => {
    const row = localRowsRef.current[globalIdx];
    if (!row?.id) return;
    const toHdv = !row.is_hdv;
    const cp = chiPhiRowsRef.current.find((c) => c.id === row.id);
    const net = cp ? (cp.tien_cong_ty || 0) + (cp.tien_hdv || 0) : (row.thanh_tien || 0);
    // Optimistic: cập nhật badge ngay, reconcile sẽ xác nhận từ DB
    setLocalRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, is_hdv: toHdv } : r)),
    );
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      tien_cong_ty: toHdv ? 0 : net,
      tien_hdv: toHdv ? net : 0,
    });
  }, [doanId, upsertMut]);

  const handleToggleDinhKy = useCallback((ksId: number) => {
    setDinhKyKsIds((prev) => {
      const next = new Set(prev);
      const newVal = !next.has(ksId);
      if (newVal) next.add(ksId); else next.delete(ksId);
      // Cập nhật tất cả chi phí rows của KS này trong DB
      const rowsForKs = localRowsRef.current.filter((r) => r.khach_san_id === ksId && r.id);
      rowsForKs.forEach((r) => {
        upsertMut.mutate({ id: r.id, doan_id: doanId, thanh_toan_dinh_ky: newVal });
      });
      return next;
    });
  }, [doanId, upsertMut]);

  const handleFieldChange = useCallback((idx: number, field: string, value: string | number) => {
    const editId = localRowsRef.current[idx]?.id;
    if (editId != null) dirtyRowIdsRef.current.add(editId);
    setLocalRows((prev) => {
      const updated = [...prev];
      const row = { ...updated[idx], [field]: value };
      // Option A: dùng foc_count cho cả room + service. so_dem=1 cho service.
      const focCount = Math.max(0, Number(row.foc_count) || 0);
      const billed = Math.max(0, (Number(row.so_phong) || 0) - focCount);
      const soDem = isKSRoomRow(row) ? (Number(row.so_dem) || 1) : 1;
      row.thanh_tien = billed * (Number(row.gia_phong) || 0) * soDem;
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
      const isRoom = isKSRoomRow(row);
      const ksInfo = ksData?.khachSanMap[row.khach_san_id];
      // Snapshot ưu tiên — KHÔNG dùng master trừ khi chưa có snapshot (lần đầu).
      // Vẫn snapshot foc_khach/foc_mien để hiển thị "16免1 suggest" + lưu cấu hình KS lúc book.
      const sameKsRows = localRowsRef.current.filter((r) => r.khach_san_id === row.khach_san_id);
      const { foc_khach: focKhach, foc_mien: focMien } = resolveKSFoc(sameKsRows, ksInfo);

      // Option A: cả room + service đều dùng foc_count manual (OP nhập tay).
      // tien_cong_ty = (so_phong - foc_count) × gia_phong. Mỗi row = 1 đêm cho room.
      const focCountManual = Math.max(0, Number(row.foc_count) || 0);
      const billed = Math.max(0, (row.so_phong || 0) - focCountManual);
      const tienCongTy = billed * (row.gia_phong || 0);

      const payload: Partial<ChiPhiRow> & { doan_id: number } = {
        id: row.id,
        doan_id: doanId,
        ngay_so: null,
        loai: "chi",
        danh_muc: "khach_san",
        ref_doan_ngay_id: row.doan_ngay_id,
        mo_ta:
          row.loai_phong ||
          (row.is_day_use
            ? "Day Use"
            : isRoom
              ? "Phòng KS"
              : "Dịch vụ KS"),
        don_gia: row.gia_phong,
        so_luong: row.so_phong,
        // Chỉ dòng dịch vụ (non-room) mới được HDV trả. Phòng FOC luôn Công ty.
        tien_cong_ty: (!isRoom && row.is_hdv) ? 0 : tienCongTy,
        tien_hdv: (!isRoom && row.is_hdv) ? tienCongTy : 0,
        thanh_toan_dinh_ky: dinhKyKsIdsRef.current.has(row.khach_san_id),
        // Snapshot: lần đầu lấy từ master. Lần sau giữ snapshot hiện có (resolveKSFoc trả snapshot nếu có).
        foc_khach_snapshot: focKhach,
        foc_mien_snapshot:  focMien,
        loai_row: row.loai_row ?? "phong",
        foc_count: focCountManual,
      };
      // ref_doan_ngay_item_id là LINK STRUCTURAL (xác định row thuộc Day-use card
      // nào). CHỈ set khi INSERT. KHÔNG đụng khi UPDATE — nếu reconcile dựng row
      // qua Path 2 (vd dayUseItemMap lag), row.ref_doan_ngay_item_id = undefined;
      // blur-save cũ ghi đè null → reload row nhảy sang KS overnight (Path 2).
      if (!row.id) {
        payload.ref_doan_ngay_item_id = row.ref_doan_ngay_item_id ?? null;
      }

      upsertMut.mutate(
        payload,
        {
          onSuccess: (data) => {
            const savedId = row.id ?? data?.id;
            if (savedId != null) dirtyRowIdsRef.current.delete(savedId);
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
    loaiRow: KSLoaiRow = "phong",
  ) => {
    const coDate = new Date(ngayDate);
    coDate.setDate(coDate.getDate() + 1);
    const co = format(coDate, "yyyy-MM-dd");
    const isDayUse = refItemId != null;
    const isService = loaiRow !== "phong";
    setLocalRows((prev) => [
      ...prev,
      {
        khach_san_id: ksId,
        doan_ngay_id: doanNgayId,
        ngay_date: ngayDate,
        loai_phong: isService ? "" : (isDayUse ? "Day Use" : ""),
        so_phong: 1,
        ci: ngayDate,
        co: isService || isDayUse ? ngayDate : co,
        so_dem: 1,
        gia_phong: 0,
        thanh_tien: 0,
        is_day_use: !isService && isDayUse ? true : undefined,
        // Cần preserve link day-use cho CẢ phong + service rows. Trước đây
        // service rows luôn nullify → reload mất link → row nhảy sang KS overnight
        // qua Path 2 (doan_ngay.khach_san_id). Giờ giữ link cho mọi loại row.
        ref_doan_ngay_item_id: refItemId ?? null,
        loai_row: loaiRow,
      },
    ]);
  }, []);

  // ── Legacy adjust submit (button đã ẩn nhưng giữ logic) ────────────────────
  const handleLegacyAdjustSubmit = () => {
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
        onError: (err: unknown) => toast.error("Lỗi: " + (errMsg(err) || "")),
      },
    );
  };
  const legacyAdjustSubmitDisabled =
    adjustMut.isPending ||
    !adjustAmount ||
    parseInt(adjustAmount.replace(/\D/g, ""), 10) === adjustTarget?.so_tien;
  const closeLegacyAdjust = () => { setAdjustTarget(null); setAdjustSurplusMode("cong_no"); };

  // closeAggCommit — reset toàn bộ state liên quan (verbatim từ inline onOpenChange + footer)
  const closeAggCommit = () => {
    setAggCommit(null); setAggReason(""); setAggNgayCan("");
    setAggSurplusMode("con_du"); setAggCanTru([]);
    setAggCommitMode("full"); setAggDepositAmount(0);
  };

  // ── Derived data (computed each render — verbatim từ component body) ─────────

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
  const dayUseItemMap = ksData?.dayUseItemMap || {};
  chiPhiRows.forEach((cp) => {
    if (cp.danh_muc !== "khach_san" || !cp.id) return;
    // Day-use: tra qua doan_ngay_item → canh_diem.khach_san_id
    if (cp.ref_doan_ngay_item_id && dayUseItemMap[cp.ref_doan_ngay_item_id]) {
      const ksId = dayUseItemMap[cp.ref_doan_ngay_item_id].khach_san_id;
      (chiPhiIdsByKs[ksId] = chiPhiIdsByKs[ksId] || []).push(cp.id);
      return;
    }
    if (!cp.ref_doan_ngay_id) return;
    const ng = ngayRows.find((r) => r.id === cp.ref_doan_ngay_id);
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

  // Map chi_phi.id → thanh_tien_thuc_te (chỉ row đã điều chỉnh sau TT).
  // KS tính thựcTế qua delta trên totalKS (xem per-KS), KHÔNG sum tien_cong_ty
  // (với KS tien_cong_ty là GROSS chưa trừ FOC → sum sai, hiện gạch nhầm).
  const thucTeOverrideById = new Map<number, number>();
  chiPhiRows.forEach((r) => {
    if (r.danh_muc === "khach_san" && r.thanh_tien_thuc_te != null) {
      thucTeOverrideById.set(r.id, Number(r.thanh_tien_thuc_te));
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
  // cong_no từ ĐNTT đã hủy/từ chối (vd "hủy dịch vụ" + hoàn tiền) là LỊCH SỬ
  // đã tất toán → KHÔNG tính vào aggregate của card hiện tại (tránh badge
  // "DNTT lệch" sai + "HT" rớt lại khi user chọn lại KS đó ở Điều tour).
  // cong_no từ điều chỉnh thừa (ĐNTT còn sống) vẫn tính bình thường.
  const cancelledDnttIds = new Set(
    dnttList
      .filter((d) => d.trang_thai_duyet === "da_huy" || d.trang_thai_duyet === "tu_choi")
      .map((d) => d.id),
  );
  congNoList.forEach((c) => {
    if (c.dntt_goc_id == null) return;
    if (cancelledDnttIds.has(c.dntt_goc_id)) return;
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
  const dayUseKsIds = ksData?.dayUseKsIds || [];
  const distinctKsIdsFromNgay = [
    ...new Set([
      ...ngayRows.map((r) => r.khach_san_id).filter(Boolean),
      ...orphanedKsIds,
      ...dayUseKsIds,
    ]),
  ] as number[];

  const activeDnttByKs: Record<number, number> = {};
  // Pass 1: ưu tiên ĐNTT CỌC pending (chưa hủy / chưa từ chối / chưa paid) — in
  // cọc ra trước để OP gửi duyệt cọc tách bạch (form la_coc của export KS).
  dnttList.forEach((d) => {
    if (d.ref_loai === "khach_san" && d.ref_id &&
        d.la_coc &&
        d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
        d.payment_status !== "paid") {
      activeDnttByKs[d.ref_id] = d.id;
    }
  });
  // Pass 2: ĐNTT pending khác (full / bổ sung).
  dnttList.forEach((d) => {
    if (d.ref_loai === "khach_san" && d.ref_id &&
        d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
        d.payment_status !== "paid" &&
        !activeDnttByKs[d.ref_id]) {
      activeDnttByKs[d.ref_id] = d.id;
    }
  });
  // Pass 3: fallback ĐNTT đã paid (chỉ để in lại biên bản gốc).
  dnttList.forEach((d) => {
    if (d.ref_loai === "khach_san" && d.ref_id &&
        d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
        !activeDnttByKs[d.ref_id]) {
      activeDnttByKs[d.ref_id] = d.id;
    }
  });

  const allSelected = selectedKsIds.length === distinctKsIdsFromNgay.length && distinctKsIdsFromNgay.length > 0;
  const ksWithDnttSelected = selectedKsIds.filter((id) => activeDnttByKs[id]).length;

  // Row đã commit vào DNTT (cho_duyet/da_duyet/paid) → khoá inline-edit, bắt user
  // hủy DNTT trước. Row chưa commit (so_tien_da_dntt = 0) → editable, kể cả khi
  // KS có row khác đã thanh toán — cho phép thêm phát sinh trên cùng card.
  const cpCommittedById: Record<number, boolean> = {};
  chiPhiRows.forEach((cp) => {
    if (cp.id != null && (cp.so_tien_da_dntt ?? 0) > 0) cpCommittedById[cp.id] = true;
  });

  // ── Clustered data + handlers cho <KSCard> ─────────────────────────────────

  const cardData: KSCardData = {
    ksData, khachSanMap, ngayRows, dayUseItemMap, dayUseKsIds, orphanedKsIds,
    grouped, localRows, dnttList, congNoList,
    cocByKs, ttByKs, canTruAmtByKsId, chiPhiIdsByKs,
    congNoByKs, hoanTienByKs,
    groupCongNoTotalByKs, groupCongNoCNByKs, groupCongNoHTByKs,
    thucTeOverrideById, canTruByDnttId,
    cpCommittedById,
    toggledKsIds, selectedKsIds, dinhKyKsIds,
    editingDnttId, editAmount,
    doanId,
    updateDNTTPending: updateDNTT.isPending,
  };
  const cardHandlers: KSCardHandlers = {
    getKsChiPhiStatus,
    toggleCollapse, toggleSelectKs, handleToggleDinhKy,
    handleFieldChange, handleBlurSave, handleDelete, handleAddRow,
    handleToggleRowNguoiTt,
    setCancelTarget, setCancelMode,
    setKsAdjustTarget,
    setAggCommit, setAggCanTru, setAggReason, setAggSurplusMode, setAggNgayCan,
    setModalKsId, setModalOpen,
    setEditingDnttId, setEditAmount,
    updateDNTT: (args) => updateDNTT.mutate(args),
  };

  return {
    ksLoading,
    doanId, tenDoan,
    localRows,
    distinctKsIdsFromNgay,
    cardData, cardHandlers,
    // Toolbar
    selectedKsIds, setSelectedKsIds,
    allSelected, ksWithDnttSelected,
    batchPrinting,
    handlePrintSelected, handleExportExcel,
    activeDnttByKs,
    // Preview modal
    previewItems, setPreviewItems,
    // ĐNTT modal
    modalOpen, setModalOpen, modalKsId, setModalKsId,
    khachSanMap, grouped, cocByKs, canTruAmtByKsId,
    canTruByKs, setCanTruByKs,
    // KSAdjustModal
    ksAdjustTarget, setKsAdjustTarget,
    // Aggregate commit modal
    aggCommit, aggCommitMode, setAggCommitMode,
    aggDepositAmount, setAggDepositAmount,
    aggReason, setAggReason, aggNgayCan, setAggNgayCan,
    aggSurplusMode, setAggSurplusMode, aggCanTru, setAggCanTru,
    handleAggCommit, closeAggCommit,
    insertPending: insertDNTT.isPending,
    // Legacy adjust modal
    adjustTarget, setAdjustTarget,
    adjustAmount, setAdjustAmount,
    adjustReason, setAdjustReason,
    adjustSurplusMode, setAdjustSurplusMode,
    handleLegacyAdjustSubmit, legacyAdjustSubmitDisabled, closeLegacyAdjust,
    // Cancel modal
    cancelTarget, setCancelTarget, cancelMode, setCancelMode,
    handleCancelSubmit, cancelPending: cancelMut.isPending,
  };
}

// ── Clustered prop types cho <KSCard> ────────────────────────────────────────

type KSData = ReturnType<typeof useChiPhiKSData>["data"];
// Các field này upstream (useChiPhiKSData) đã typed Record<number, any> / any[] —
// derive lại từ đó để KHÔNG khai báo `any` mới trong file này.
type KSKhachSanMap = NonNullable<KSData>["khachSanMap"];
type KSNgayRows = NonNullable<KSData>["ngayRows"];
type KSNgayRow = KSNgayRows[number];
type KSDayUseItemMap = NonNullable<KSData>["dayUseItemMap"];

export interface KSCardData {
  ksData: KSData;
  khachSanMap: KSKhachSanMap;
  ngayRows: KSNgayRows;
  dayUseItemMap: KSDayUseItemMap;
  dayUseKsIds: number[];
  orphanedKsIds: number[];
  grouped: Record<number, LocalKSRow[]>;
  localRows: LocalKSRow[];
  dnttList: DNTTRow[];
  congNoList: ReturnType<typeof useCongNoList>["data"];
  cocByKs: Record<number, number>;
  ttByKs: Record<number, number>;
  canTruAmtByKsId: Record<number, number>;
  chiPhiIdsByKs: Record<number, number[]>;
  congNoByKs: Record<number, number>;
  hoanTienByKs: Record<number, number>;
  groupCongNoTotalByKs: Record<number, number>;
  groupCongNoCNByKs: Record<number, number>;
  groupCongNoHTByKs: Record<number, number>;
  thucTeOverrideById: Map<number, number>;
  canTruByDnttId: Record<number, number>;
  cpCommittedById: Record<number, boolean>;
  toggledKsIds: Set<number>;
  selectedKsIds: number[];
  dinhKyKsIds: Set<number>;
  editingDnttId: number | null;
  editAmount: string;
  doanId: number;
  updateDNTTPending: boolean;
}

export interface KSCardHandlers {
  getKsChiPhiStatus: (ksId: number) => string;
  toggleCollapse: (ksId: number) => void;
  toggleSelectKs: (ksId: number) => void;
  handleToggleDinhKy: (ksId: number) => void;
  handleFieldChange: (idx: number, field: string, value: string | number) => void;
  handleBlurSave: (idx: number) => void;
  handleDelete: (idx: number) => void;
  handleAddRow: (ksId: number, doanNgayId: number, ngayDate: string, refItemId?: number, loaiRow?: KSLoaiRow) => void;
  handleToggleRowNguoiTt: (globalIdx: number) => void;
  setCancelTarget: (v: KSCancelTarget | null) => void;
  setCancelMode: (v: "cong_no" | "hoan_tien") => void;
  setKsAdjustTarget: (v: KSAdjustTarget | null) => void;
  setAggCommit: (v: AggCommitKSTarget | null) => void;
  setAggCanTru: (v: CanTruSelection[]) => void;
  setAggReason: (v: string) => void;
  setAggSurplusMode: (v: "con_du" | "hoan_tien") => void;
  setAggNgayCan: (v: string) => void;
  setModalKsId: (v: number | null) => void;
  setModalOpen: (v: boolean) => void;
  setEditingDnttId: (v: number | null) => void;
  setEditAmount: (v: string) => void;
  updateDNTT: (args: { id: number; soTien: number }) => void;
}
