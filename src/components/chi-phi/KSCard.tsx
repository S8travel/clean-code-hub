import { format } from "date-fns";
import { Ban, ArrowRight, ChevronDown, ChevronRight, SlidersHorizontal, Check, X, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  isKSRoomRow,
  calcRowFocBreakdown,
  calcTotalKS,
  resolveKSFoc,
} from "@/lib/foc-calc";
import { calcAggregateDelta, calcDnttMismatch } from "@/lib/aggregate-calc";
import { DayGroup, EmptyDayHeader } from "./DayGroup";
import KSServicesSection from "./KSServicesSection";
import KSFocEditor from "./KSFocEditor";
import KSCodeEditor from "./KSCodeEditor";
import { fmt, STATUS_LABEL, type LocalKSRow } from "./ks-section-shared";
import { HoaDonBadge } from "./HoaDonBadge";
import type { TrangThaiDoc } from "@/hooks/use-hoa-don-unc";
import type { KSCardData, KSCardHandlers } from "./use-ks-section";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  ksId: number;
  data: KSCardData;
  handlers: KSCardHandlers;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}

// 1 card khách sạn: phòng + dịch vụ + thanh toán section.
// Tách verbatim từ ChiPhiKSSection — giữ nguyên 100% logic/hành vi.
export default function KSCard({ ksId, data, handlers, locked = false }: Props) {
  useTranslate();
  const {
    ksData, khachSanMap, ngayRows, dayUseItemMap, dayUseKsIds, orphanedKsIds,
    grouped, localRows, dnttList, congNoList,
    cocByKs, ttByKs, canTruAmtByKsId, chiPhiIdsByKs,
    congNoByKs, hoanTienByKs,
    groupCongNoTotalByKs, groupCongNoCNByKs, groupCongNoHTByKs,
    thucTeOverrideById, canTruByDnttId,
    cpCommittedById,
    toggledKsIds, selectedKsIds, dinhKyKsIds,
    editingDnttId, editAmount,
    doanId, updateDNTTPending,
  } = data;
  const {
    getKsChiPhiStatus,
    toggleCollapse, toggleSelectKs, handleToggleDinhKy,
    handleFieldChange, handleBlurSave, handleDelete, handleAddRow,
    handleToggleRowNguoiTt,
    setCancelTarget, setCancelMode,
    setKsAdjustTarget,
    setAggCommit, setAggCanTru, setAggReason, setAggSurplusMode, setAggNgayCan,
    setModalKsId, setModalOpen,
    setEditingDnttId, setEditAmount,
    updateDNTT,
  } = handlers;

  const ks = khachSanMap[ksId];
  const rows = grouped[ksId] || [];
  // Resolve FOC từ snapshot (per-tour) thay vì master — tránh master changes
  // ảnh hưởng đoàn cũ.
  const ksFoc = resolveKSFoc(rows, ks);
  // Dòng dịch vụ HDV trả → ngoài chi phí công ty: loại khỏi tổng KS +
  // thực tế + ĐNTT. Hiển thị bảng vẫn render đủ rows (badge per dòng).
  const congTyRows = rows.filter((r) => !r.is_hdv);
  // totalKS = rooms NET (pro-rata FOC) + services NET (manual foc_count).
  const totalKS = calcTotalKS(congTyRows, ksFoc.foc_khach, ksFoc.foc_mien);

  const daCoc = cocByKs[ksId] || 0;
  void daCoc;
  const daTT = ttByKs[ksId] || 0;
  // Thực tế KS = totalKS (đã NET trừ FOC) + Σ delta của row ĐÃ điều chỉnh.
  // Row chưa điều chỉnh giữ nguyên net trong totalKS → KHÔNG gạch nhầm
  // (tránh bug: KS không adjust vẫn hiện gạch vì tien_cong_ty là gross).
  const adjustDelta = congTyRows.reduce((sum, r) => {
    if (r.id == null || !thucTeOverrideById.has(r.id)) return sum;
    const override = thucTeOverrideById.get(r.id)!;
    let rowNet: number;
    if (isKSRoomRow(r)) {
      const sameDay = rows.filter((x) => x.ngay_date === r.ngay_date);
      const { rowFocDeduction } = calcRowFocBreakdown(r, sameDay, ksFoc.foc_khach, ksFoc.foc_mien);
      const rowGross = (Number(r.so_phong) || 0) * (Number(r.gia_phong) || 0) * (Number(r.so_dem) || 1);
      rowNet = rowGross - rowFocDeduction;
    } else {
      const focCount = Math.max(0, Number(r.foc_count) || 0);
      const billed = Math.max(0, (Number(r.so_phong) || 0) - focCount);
      rowNet = billed * (Number(r.gia_phong) || 0);
    }
    return sum + (override - rowNet);
  }, 0);
  const thucTeKS = totalKS + adjustDelta;
  const daDieuChinh = adjustDelta !== 0;
  const canTruAmtForKs = canTruAmtByKsId[ksId] || 0;
  void canTruAmtForKs;
  const conLai = thucTeKS - daTT;
  void conLai;
  const isDaTT = thucTeKS > 0 && daTT >= thucTeKS;
  void isDaTT;
  const congNoAmount = congNoByKs[ksId] || 0;
  const hoanTienAmount = hoanTienByKs[ksId] || 0;
  const ksStatus = getKsChiPhiStatus(ksId);
  const ksStatusInfo = STATUS_LABEL[ksStatus] ?? STATUS_LABEL.chua_de_nghi;
  void ksStatusInfo;

  const activeDntt =
    dnttList.find((d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
      d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi" &&
      d.payment_status !== "paid") ??
    dnttList.find((d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
      d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi");
  void activeDntt;

  const cancellableDntts = dnttList.filter(
    (d) => d.ref_loai === "khach_san" && d.ref_id === ksId &&
           d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
  );
  const paidDnttsForKs = cancellableDntts.filter((d) => d.payment_status === "paid");
  const unpaidDnttsForKs = cancellableDntts.filter((d) => d.payment_status !== "paid");
  const canCancelKs = cancellableDntts.length > 0;
  void canCancelKs;
  // KS có DNTT đã paid (KHÔNG phải cọc) → lock input. User sửa qua "Điều chỉnh" modal.
  // Cọc-only thì vẫn cho edit bình thường vì chưa quyết toán chính thức.
  const isKsLocked = paidDnttsForKs.some((d) => !d.la_coc);

  // Aggregate-after-edits values cho KS card.
  // Identical pattern với DV/NH: sumActual (chi phí thực tế), sumPaid (đã TT),
  // groupCongNoTotal (cong_no đã ghi nhận, mọi state) → effectiveDelta + effectiveCommitted.
  const sumActual = thucTeKS;
  const sumPaid = daTT;
  const sumCommitted = cancellableDntts.reduce((s, d) => s + Number(d.so_tien), 0);
  const groupCongNoTotal = groupCongNoTotalByKs[ksId] || 0;
  const { effectiveDelta, effectiveCommitted } = calcAggregateDelta({
    sumActual, sumPaid, sumCommitted, groupCongNoTotal,
  });
  const daDeNghi = unpaidDnttsForKs.reduce((s, d) => s + Math.max(0, d.so_tien - (d.paid_amount || 0)), 0);
  const showAggBtn = daDeNghi === 0 && sumPaid > 0 && effectiveDelta !== 0;
  const aggPaidDntt = paidDnttsForKs[0] ?? null;
  const hasCommittedDntt = cancellableDntts.some(
    (d) => d.trang_thai_duyet === "cho_duyet" || d.trang_thai_duyet === "da_duyet",
  );
  // Ẩn badge khi nút footer hiện (trùng thông tin).
  const dnttMismatch = calcDnttMismatch({
    sumActual, effectiveCommitted, hasCommittedDntt, showAggBtn,
  });

  const roomsByDay: Record<string, LocalKSRow[]> = {};
  const servicesByDay: Record<string, LocalKSRow[]> = {};
  rows.forEach((r) => {
    const key = r.ngay_date || "unknown";
    const bucket = isKSRoomRow(r) ? roomsByDay : servicesByDay;
    if (!bucket[key]) bucket[key] = [];
    bucket[key].push(r);
  });
  const roomDayEntries = Object.entries(roomsByDay).sort(([a], [b]) => a.localeCompare(b));
  void roomDayEntries;
  const serviceDayEntries = Object.entries(servicesByDay).sort(([a], [b]) => a.localeCompare(b));
  const hasAnyServices = serviceDayEntries.length > 0;

  const ngayDateToNgaySo: Record<string, number> = {};
  const ngayDateToDoanNgayId: Record<string, number> = {};
  ngayRows.forEach((r) => {
    if (r.khach_san_id === ksId && r.ngay_date) {
      ngayDateToNgaySo[r.ngay_date] = r.ngay_so;
      ngayDateToDoanNgayId[r.ngay_date] = r.id;
    }
  });
  // Bổ sung mapping từ day-use items (ngày day-use có thể không có khach_san_id qua đêm)
  Object.values(dayUseItemMap).forEach((info) => {
    if (info.khach_san_id === ksId && info.ngay_date) {
      ngayDateToNgaySo[info.ngay_date] = info.ngay_so;
      ngayDateToDoanNgayId[info.ngay_date] = info.doan_ngay_id;
    }
  });
  const isKsDayUse = dayUseKsIds.includes(ksId) && !ngayRows.some((r) => r.khach_san_id === ksId);

  const isOrphaned = orphanedKsIds.includes(ksId); // không còn trong điều tour
  const isKsDinhKy = dinhKyKsIds.has(ksId);

  // Orphaned + công nợ → auto-xóa, ẩn luôn khỏi UI
  if (isOrphaned && ksStatus === "cong_no") return null;

  // Orphaned + hoàn tiền → đã rời điều tour, ẩn (chỉ còn trong công nợ).
  // Còn trong điều tour (user chọn lại KS đúng ô đó) → KHÔNG ẩn, coi như chi phí mới.
  if (isOrphaned && ksStatus === "hoan_tien") return null;

  // KS còn trong điều tour dù đã có cong_no / hoàn tiền (lịch sử) → coi như chi phí mới.
  const effectiveKsStatus =
    (!isOrphaned && (ksStatus === "cong_no" || ksStatus === "hoan_tien"))
      ? "chua_de_nghi"
      : ksStatus;

  // cong_no/hoan_tien: collapsed by default; others: expanded by default
  const defaultCollapsed = effectiveKsStatus === "cong_no" || effectiveKsStatus === "hoan_tien";
  const isCollapsed = toggledKsIds.has(ksId) ? !defaultCollapsed : defaultCollapsed;
  const showContent = !isCollapsed;

  return (
    <Card key={ksId} className={`border-border transition-colors ${selectedKsIds.includes(ksId) ? "border-primary/50 bg-primary/5" : ""}`}>
      <CardHeader className="py-1 px-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap min-w-0">
            <Checkbox
              checked={selectedKsIds.includes(ksId)}
              onCheckedChange={() => toggleSelectKs(ksId)}
              className="shrink-0"
            />
            <button
              className="flex items-center gap-2 flex-wrap text-left"
              onClick={() => toggleCollapse(ksId)}
            >
              <span className="whitespace-nowrap">{ks?.ten || `KS #${ksId}`}</span>
              {isKsDayUse && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                  Day Use
                </span>
              )}
              {effectiveKsStatus === "cong_no" && congNoAmount > 0 && (
                <span className="text-purple-600 font-semibold text-xs">
                  — {t("Công nợ")}: {fmt(congNoAmount)} VND
                </span>
              )}
              {effectiveKsStatus === "hoan_tien" && hoanTienAmount > 0 && (
                <span className="text-blue-600 font-semibold text-xs">
                  — {t("Hoàn tiền")}: {fmt(hoanTienAmount)} VND
                </span>
              )}
            </button>
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
            {isKsDinhKy && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700">{t("Định kỳ")}</span>
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
                title={`${t("Số tiền DNTT đã commit")} (${fmt(sumCommitted)} ₫) ${t("khác chi phí thực tế")} (${fmt(sumActual)} ₫). ${t("Sửa giá/số phòng cho khớp, hoặc trả nốt phần đã đề nghị rồi bổ sung phần lệch. Đừng hủy nếu ĐNTT có cấn trừ.")}`}
              >
                ⚠ {t("DNTT lệch")} {dnttMismatch > 0 ? "+" : "−"}{fmt(Math.abs(dnttMismatch))}
              </span>
            )}
            <KSCodeEditor
              doanId={doanId}
              ksId={ksId}
              currentCode={ksData?.ngayRows?.find((r) => r.khach_san_id === ksId)?.ks_ma_code || ""}
            />
            <KSFocEditor
              doanId={doanId}
              ksId={ksId}
              rowIds={rows.map((r) => r.id).filter((id): id is number => id != null)}
              focKhach={ksFoc.foc_khach}
              focMien={ksFoc.foc_mien}
              disabled={locked}
            />
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 text-xs px-2 gap-1", isKsDinhKy ? "text-indigo-700 hover:text-indigo-800" : "text-muted-foreground hover:text-foreground")}
              onClick={() => handleToggleDinhKy(ksId)}
              title={isKsDinhKy ? t("Đang thanh toán định kỳ — bấm để bỏ") : t("Đặt thanh toán định kỳ")}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {isKsDinhKy && t("Định kỳ")}
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
            {t("Khách sạn đã được xóa khỏi lịch trình điều tour.")}
          </p>
        )}
        {!isOrphaned && <div className="overflow-x-auto">
          <div className="flex items-center gap-2 px-1 py-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">🛏️ {t("Phòng")}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-[120px] h-auto py-1 px-2">{t("Loại phòng")}</TableHead>
                <TableHead className="w-[60px] h-auto py-1 px-2">{t("Số phòng")}</TableHead>
                <TableHead className="w-[60px] h-auto py-1 px-2" title={t("Số phòng miễn phí (OP tự nhập). Gợi ý 16免1 hiện ở header ngày.")}>FOC</TableHead>
                <TableHead className="w-[90px] h-auto py-1 px-2">C/I</TableHead>
                <TableHead className="w-[90px] h-auto py-1 px-2">C/O</TableHead>
                <TableHead className="w-[50px] h-auto py-1 px-2">{t("Đêm")}</TableHead>
                <TableHead className="w-[100px] h-auto py-1 px-2 text-right">{t("Giá/phòng")}</TableHead>
                <TableHead className="w-[110px] h-auto py-1 px-2">{t("Thành tiền")}</TableHead>
                <TableHead className="w-[32px] h-auto py-1 px-2" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roomDayEntries.map(([dateStr, dayRows]) => {
                const ngaySo = ngayDateToNgaySo[dateStr];
                const doanNgayId = ngayDateToDoanNgayId[dateStr] || dayRows[0]?.doan_ngay_id;
                // Day-use card: row mới phải kế thừa ref_doan_ngay_item_id, nếu
                // không reload sẽ nhảy sang KS overnight (Path 2). Lấy DETERMINISTIC
                // từ dayUseItemMap (theo ksId + ngày) — KHÔNG dò sibling rows vì
                // sibling có thể đã mất link → refItemForDay undefined → row mới
                // lưu null → nhảy KS. Fallback sibling chỉ cho case hiếm.
                const dayUseEntry = Object.entries(dayUseItemMap).find(
                  ([, info]) => info.khach_san_id === ksId && info.ngay_date === dateStr,
                );
                const refItemForDay = dayUseEntry
                  ? Number(dayUseEntry[0])
                  : (dayRows.find((r) => r.ref_doan_ngay_item_id != null)?.ref_doan_ngay_item_id ?? undefined);
                return (
                  <DayGroup
                    key={dateStr}
                    dateStr={dateStr}
                    ngaySo={ngaySo}
                    dayRows={dayRows}
                    localRows={localRows}
                    focKhach={ksFoc.foc_khach}
                    focMien={ksFoc.foc_mien}
                    onFieldChange={handleFieldChange}
                    onBlurSave={handleBlurSave}
                    onDelete={handleDelete}
                    onAddRoom={() => handleAddRow(ksId, doanNgayId, dateStr, refItemForDay)}
                    onAddService={() => handleAddRow(ksId, doanNgayId, dateStr, refItemForDay, "dich_vu_khac")}
                    disabled={isKsLocked}
                    locked={locked}
                    cpCommittedById={cpCommittedById}
                  />
                );
              })}
              {ngayRows
                .filter((r): r is typeof r & { ngay_date: string } =>
                  r.khach_san_id === ksId && !!r.ngay_date && !roomsByDay[r.ngay_date])
                .map((r) => (
                  <EmptyDayHeader
                    key={r.ngay_date}
                    dateStr={r.ngay_date}
                    ngaySo={r.ngay_so}
                    onAddRoom={() => handleAddRow(ksId, r.id, r.ngay_date)}
                    onAddService={() => handleAddRow(ksId, r.id, r.ngay_date, undefined, "dich_vu_khac")}
                    locked={locked}
                  />
                ))}
              {Object.entries(dayUseItemMap)
                .filter(([, info]) => info.khach_san_id === ksId && !roomsByDay[info.ngay_date])
                .map(([itemIdStr, info]) => (
                  <EmptyDayHeader
                    key={`day-use-${itemIdStr}`}
                    dateStr={info.ngay_date}
                    ngaySo={info.ngay_so}
                    isDayUse
                    onAddRoom={() => handleAddRow(ksId, info.doan_ngay_id, info.ngay_date, Number(itemIdStr))}
                    onAddService={() => handleAddRow(ksId, info.doan_ngay_id, info.ngay_date, undefined, "dich_vu_khac")}
                    locked={locked}
                  />
                ))}
            </TableBody>
          </Table>

          {/* ── Dịch vụ KS sub-section — chỉ render khi đã có service rows ── */}
          {hasAnyServices && (
            <KSServicesSection
              serviceDayEntries={serviceDayEntries}
              ngayDateToNgaySo={ngayDateToNgaySo}
              ngayDateToDoanNgayId={ngayDateToDoanNgayId}
              localRows={localRows}
              onAddMore={(doanNgayId, ngayDate, refItemId) =>
                handleAddRow(ksId, doanNgayId, ngayDate, refItemId, "dich_vu_khac")
              }
              onFieldChange={handleFieldChange}
              onBlurSave={handleBlurSave}
              onDelete={handleDelete}
              onToggleNguoiTt={handleToggleRowNguoiTt}
              disabled={isKsLocked}
              locked={locked}
              cpCommittedById={cpCommittedById}
            />
          )}
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
                                  updateDNTT({ id: dntt.id, soTien: v });
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
                          <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">{t("Cọc")}</span>
                        )}
                        {(() => {
                          const ct = canTruByDnttId[dntt.id] || 0;
                          if (ct <= 0) return null;
                          const thucTT = Math.max(0, dntt.so_tien - ct);
                          return (
                            <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px]"
                              title={`${t("Tổng")} ${fmt(dntt.so_tien)} − ${t("Cấn trừ")} ${fmt(ct)} = ${t("Thực TT")} ${fmt(thucTT)}`}>
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
                            ? `${t("Đã TT")}${dntt.thanh_toan_luc ? ` ${format(new Date(dntt.thanh_toan_luc), "dd/MM")}` : ""}`
                            : isWaiting ? t("Chờ duyệt")
                            : isApproved ? t("Đã duyệt")
                            : "—"}
                        </span>
                        <HoaDonBadge
                          dnttId={dntt.id}
                          trangThai={(dntt.trang_thai_hoa_don ?? "chua_co") as TrangThaiDoc}
                        />
                        {dntt.ngay_can_thanh_toan && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 text-[10px] font-medium"
                            title={t("Ngày cần thanh toán")}
                          >
                            <CalendarClock className="h-3 w-3" />
                            {format(new Date(dntt.ngay_can_thanh_toan), "dd/MM/yyyy")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Sửa số tiền khi chờ duyệt */}
                        {isWaiting && editingDnttId === dntt.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-emerald-600 hover:text-emerald-700"
                              disabled={updateDNTTPending}
                              onClick={() => {
                                const v = parseInt(editAmount.replace(/\D/g, ""), 10);
                                if (!isNaN(v) && v > 0) {
                                  updateDNTT({ id: dntt.id, soTien: v });
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
                            {/* ĐNTT sai → hủy, KHÔNG sửa inline (gỡ pencil 2026-05-26) */}
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
                                {t("Hủy")}
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
                {t("Sau điều chỉnh")}:
                <span className="ml-1">{t("Thực tế")} <span className="font-medium text-foreground tabular-nums">{fmt(sumActual)}</span> ₫</span>
                <span className="mx-1">·</span>
                <span>{t("Đã TT")} <span className="font-medium text-foreground tabular-nums">{fmt(sumPaid)}</span> ₫</span>
                {groupCongNoTotal > 0 && (
                  <>
                    <span className="mx-1">·</span>
                    <span>{t("Đã CN/HT")} <span className="font-medium text-foreground tabular-nums">{fmt(groupCongNoTotal)}</span> ₫</span>
                  </>
                )}
                <span className="mx-1">·</span>
                <span>{t("Còn lệch")} <span className={cn(
                  "font-semibold tabular-nums",
                  effectiveDelta > 0 ? "text-orange-700" : "text-purple-700",
                )}>
                  {effectiveDelta > 0 ? "+" : "−"}{fmt(Math.abs(effectiveDelta))} ₫
                </span> ({effectiveDelta > 0 ? t("thiếu") : t("thừa")})</span>
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
                  setAggCanTru([]);
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
                  ? `${t("Thanh toán / Cọc bổ sung")} ${fmt(effectiveDelta)} ₫`
                  : `${t("Xử lý chênh lệch thừa")} ${fmt(Math.abs(effectiveDelta))} ₫`}
              </Button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 ml-auto">
              {/* Điều chỉnh — chỉ hiện khi đã có DNTT paid (giống NH/DV pattern).
                  Mở modal cho phép sửa so_phong/gia_phong nhiều row trong booking.
                  Ẩn khi đoàn đã quyết toán (Điều chỉnh = sửa cost) — trừ admin. */}
              {isKsLocked && !locked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  title={t("Điều chỉnh số phòng / giá phòng thực tế sau thanh toán")}
                  onClick={() => {
                    setKsAdjustTarget({
                      ksId,
                      ksName: ks?.ten || `KS #${ksId}`,
                      rows,
                      focKhach: ksFoc.foc_khach,
                      focMien: ksFoc.foc_mien,
                      sumPaid,
                    });
                  }}
                >
                  <SlidersHorizontal className="h-3 w-3 mr-1" />
                  {t("Điều chỉnh")}
                </Button>
              )}
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
                  {t("Hủy dịch vụ")}
                </Button>
              )}
              {/* Thanh toán định kỳ: ẩn nút ĐNTT, kế toán xử lý qua trang định kỳ */}
              {isKsDinhKy && effectiveKsStatus === "chua_de_nghi" && (
                <span className="text-[11px] text-indigo-500 italic">{t("Thanh toán định kỳ")}</span>
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
                  {t("Đề nghị TT")}
                </Button>
              )}
              {/* "Đề nghị TT bổ sung / còn lại" cũ — REMOVED, replaced by aggregate breakdown button. */}
            </div>
          </div>
        </div>
      </CardContent>}
    </Card>
  );
}
