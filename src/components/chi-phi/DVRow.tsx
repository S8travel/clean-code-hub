import { format, parseISO, subDays } from "date-fns";
import { Check, X, Ban, Plus, Trash2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { sumCompanyChiPhi, splitGroupCongNo, calcAggregateDelta, calcDnttMismatch } from "@/lib/aggregate-calc";
import type { DnttLump } from "@/lib/can-tru-lump";
import type { ChiPhiRow, DNTTRow } from "@/hooks/use-chi-phi";
import { useDVCanhDiemMap } from "@/hooks/use-chi-phi-nh";
import { resolveDVFoc, calcSoKhachThucTe } from "@/lib/foc-calc";
import { DVFocEditor } from "./DVFocEditor";
import CatalogHoverCard from "./CatalogHoverCard";
import { HoaDonCell, HoaDonChiPhiBadge } from "./HoaDonBadge";
import type { TrangThaiDoc } from "@/hooks/use-hoa-don-unc";
import { DVInput } from "./DVInput";
import type { DVModalTarget } from "./DVDnttModal";
import type { CancelTarget } from "./DVCancelModal";
import type { AggCommitTarget } from "./DVAggCommitModal";
import { type CanTruSelection } from "./KSCongNoPanel";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

const STATUS_LABEL: Record<string, { textKey: string; cls: string }> = {
  cho_duyet: { textKey: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { textKey: "Đã duyệt",  cls: "bg-teal-100 text-teal-700" },
  tu_choi:   { textKey: "Từ chối",   cls: "bg-red-100 text-red-700" },
};

export interface LocalDVExtra {
  id?: number;
  mo_ta: string;
  so_luong: number;
  don_gia: number;
  nguoi_tt: "cong_ty" | "hdv";
  /** Trạng thái hóa đơn (dòng extra HDV trả) — badge bấm tay. NULL=chua_co. */
  trang_thai_hoa_don?: string | null;
}

// Shape tối thiểu — chỉ các field DVRow đụng tới.
interface DVPaymentLite { chi_phi_id: number | null; dntt_id: number; method: string; payment_so_tien: number }
interface DVCongNoLite { dntt_goc_id: number | null; trang_thai: string; so_tien_con_lai: number; so_tien_goc: number | null }

/** Dữ liệu dùng chung — gom cụm để khỏi truyền 30 props rời. */
export interface DVRowData {
  dnttList: DNTTRow[];
  extrasMap: Record<number, LocalDVExtra[]>;
  paymentsList: DVPaymentLite[];
  congNoList: DVCongNoLite[];
  allDvRows: ChiPhiRow[];
  dvCdMap: ReturnType<typeof useDVCanhDiemMap>;
  doanId: number;
  /** chi_phi_id → (dntt_id → so_tien allocation). Map dòng → ĐNTT (kể cả ĐNTT gộp). */
  allocByChiPhi: Map<number, Map<number, number>>;
  /** dntt_id → lump cấn trừ/tiền mặt theo từng chi_phi (dồn vào dòng đầu) — chỉ hiển thị. */
  lumpedByDntt: Map<number, DnttLump>;
  selectedIds: number[];
  editingId: number | null;
  editAmount: string;
  ngayBatDau?: string;
  upsertMut: { isPending: boolean };
  updateDNTT: { isPending: boolean };
}

/** Handler dùng chung — gom cụm. */
export interface DVRowHandlers {
  getRowEdit: (row: ChiPhiRow) => { so_luong: number; don_gia: number };
  getDateLabel: (ngaySo: number | null) => string;
  setSelectedIds: (updater: (prev: number[]) => number[]) => void;
  /** Tích/bỏ tích 1 dòng → kéo theo cả nhóm cùng ĐNTT gộp. */
  toggleSelectRow: (rowId: number, checked: boolean) => void;
  handleRowChange: (id: number | undefined, field: "so_luong" | "don_gia", v: number) => void;
  handleRowSave: (row: ChiPhiRow) => void;
  handleResetOverride: (row: ChiPhiRow) => void;
  handleApplyMasterFoc: (row: ChiPhiRow, focKhach: number, focMien: number) => void;
  handleToggleNguoiTt: (row: ChiPhiRow) => void;
  setEditAmount: (v: string) => void;
  setEditingId: (v: number | null) => void;
  handleEditSave: (id: number) => void;
  handleToggleDinhKy: (row: ChiPhiRow) => void;
  handleExtraAdd: (mainId: number) => void;
  openDvModal: (chiPhiId: number, thanhTien: number, moTa: string, nccId: number | null, ngaySo: number | null) => void;
  setCancelMode: (v: "cong_no" | "hoan_tien") => void;
  setCancelTarget: (v: CancelTarget | null) => void;
  setAggCommit: (v: AggCommitTarget | null) => void;
  setAggReason: (v: string) => void;
  setAggSurplusMode: (v: "con_du" | "hoan_tien") => void;
  setAggCanTru: (v: CanTruSelection[]) => void;
  setAggNgayCan: (v: string) => void;
  handleExtraChange: (mainId: number, idx: number, field: keyof LocalDVExtra, v: LocalDVExtra[keyof LocalDVExtra]) => void;
  handleExtraSave: (mainId: number, idx: number, nguoiTtOverride?: "cong_ty" | "hdv") => void;
  handleExtraDelete: (mainId: number, idx: number) => void;
}

interface Props {
  row: ChiPhiRow;
  day: number;
  data: DVRowData;
  handlers: DVRowHandlers;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}

// 1 dòng chi phí dịch vụ: dòng chính + dòng phát sinh + dòng aggregate footer.
// Tách verbatim từ ChiPhiDVSection — giữ nguyên 100% logic/hành vi.
export default function DVRow({ row, day, data, handlers, locked = false }: Props) {
  useTranslate();
  const {
    dnttList, extrasMap, paymentsList, congNoList, allDvRows, dvCdMap, doanId,
    allocByChiPhi, lumpedByDntt, selectedIds, editingId, editAmount, ngayBatDau,
    upsertMut, updateDNTT,
  } = data;
  const {
    getRowEdit, getDateLabel, setSelectedIds, toggleSelectRow, handleRowChange, handleRowSave,
    handleResetOverride, handleApplyMasterFoc, handleToggleNguoiTt, setEditAmount, setEditingId,
    handleEditSave, handleToggleDinhKy, handleExtraAdd, openDvModal,
    setCancelMode, setCancelTarget, setAggCommit, setAggReason,
    setAggSurplusMode, setAggCanTru, setAggNgayCan,
    handleExtraChange, handleExtraSave, handleExtraDelete,
  } = handlers;

  const local = getRowEdit(row);
  // FOC dịch vụ: CHỈ đọc snapshot trên row (không fallback master) → Thành tiền hiển
  // thị KHỚP tien_cong_ty đã lưu (đã trừ FOC ở handleRowSave/cascade/áp danh mục).
  const focResolved = resolveDVFoc(row);
  const billedSoLuong = calcSoKhachThucTe(local.so_luong, focResolved.foc_khach, focResolved.foc_mien);
  const focMienSo = local.so_luong - billedSoLuong;
  const thanhTienLocal = billedSoLuong * local.don_gia;
  const nguoiTt = row.tien_hdv > 0 ? "hdv" : "cong_ty";

  // Đoàn cũ (tạo trước khi cảnh điểm có FOC) → chưa có snapshot. Nếu master canh_diem
  // CÓ FOC → gợi ý nút "áp" để snapshot + tính lại tien (1 lần, có chủ đích). KHÔNG
  // tự lấy master vào compute (tránh phantom FOC: hiển thị có nhưng tien_cong_ty chưa trừ).
  const cdMaster = row.ref_doan_ngay_item_id ? dvCdMap[row.ref_doan_ngay_item_id] : null;
  const hasFocSnapshot = row.foc_khach_snapshot != null || row.foc_mien_snapshot != null;
  const masterFocKhach = cdMaster?.foc_khach ?? null;
  const masterFocMien = cdMaster?.foc_mien ?? null;
  const canSuggestMasterFoc =
    !hasFocSnapshot && !!masterFocKhach && !!masterFocMien && !locked;

  // Map dòng → ĐNTT qua ALLOCATION (không chỉ ref_id) → dòng nằm trong ĐNTT gộp
  // (ref_id trỏ dòng khác) vẫn nhận diện đúng ĐNTT của mình.
  const myAllocByDntt = (row.id != null ? allocByChiPhi.get(row.id) : undefined) ?? new Map<number, number>();
  const allDntts = dnttList.filter(
    d => d.ref_loai === "doan_chi_phi" && (myAllocByDntt.has(d.id) || d.ref_id === row.id),
  );
  // Phần allocation của DÒNG NÀY trong 1 ĐNTT (gộp → chỉ phần của dòng, không phải cả ĐNTT).
  const allocAmt = (d: DNTTRow): number => myAllocByDntt.get(d.id) ?? Number(d.so_tien);
  // Tiền đã trả của DÒNG NÀY cho 1 ĐNTT (payment_so_tien đã pro-rate per-allocation).
  const paidForDntt = (d: DNTTRow): number =>
    paymentsList
      .filter(p => p.dntt_id === d.id && p.chi_phi_id === row.id)
      .reduce((s, p) => s + p.payment_so_tien, 0);
  // Lump cấn trừ HIỂN THỊ của dòng này cho 1 ĐNTT — đã dồn vào dòng đầu (display-only),
  // KHÔNG pro-rata. undefined nếu ĐNTT không có cấn trừ (→ dùng paidForDntt như cũ).
  const lumpFor = (d: DNTTRow) => (row.id != null ? lumpedByDntt.get(d.id)?.rows.get(row.id) : undefined);
  const canTruNoteFor = (d: DNTTRow): string | undefined => lumpedByDntt.get(d.id)?.canTruNote;
  const activeDntts = allDntts.filter(
    d => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi",
  );
  const rejectedDntts = allDntts.filter(d => d.trang_thai_duyet === "tu_choi");
  const paidDntts = activeDntts.filter(d => d.payment_status === "paid");
  const pendingDntts = activeDntts.filter(d => d.payment_status !== "paid");
  // Per-dòng (allocation-based) thay vì cả ĐNTT → ĐNTT gộp hiển thị đúng phần của dòng.
  const daTT = row.so_tien_da_tt ?? 0;
  const daDeNghi = pendingDntts.reduce((s, d) => s + Math.max(0, allocAmt(d) - paidForDntt(d)), 0);
  const thanhTien = row.tien_cong_ty;
  const rowExtras = extrasMap[row.id!] || [];
  const extrasCtTotal = rowExtras
    .filter(e => e.nguoi_tt !== "hdv")
    .reduce((s, e) => s + e.so_luong * e.don_gia, 0);
  const totalTienCt = thanhTien + extrasCtTotal;
  const isDaTT = totalTienCt > 0 && daTT >= totalTienCt;
  const conLai = Math.max(0, totalTienCt - daTT);
  // cong_no chỉ tra theo ĐNTT CÒN HIỆU LỰC. cong_no từ ĐNTT đã hủy/từ chối
  // (vd hủy dịch vụ + hoàn tiền) là lịch sử đã tất toán → không tính vào row,
  // không ẩn row khi user dùng lại dịch vụ đó ở Điều tour.
  const dnttIds = activeDntts.map((d) => d.id);
  const congNoAmount = congNoList
    .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "con_du")
    .reduce((s, c) => s + c.so_tien_con_lai, 0);
  const hoanTienAmount = congNoList
    .filter((c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id) && c.trang_thai === "da_hoan_tien")
    .reduce((s, c) => s + (c.so_tien_goc ?? 0), 0);
  // Tổng cong_no đã ghi nhận cho group này (con_du + da_can_tru + da_hoan_tien).
  const groupCongNoForGroup = congNoList.filter(
    (c) => c.dntt_goc_id != null && dnttIds.includes(c.dntt_goc_id),
  );
  const { groupCongNoCN, groupCongNoHT, groupCongNoTotal } =
    splitGroupCongNo(groupCongNoForGroup);
  const activeDntt = pendingDntts[0] ?? paidDntts[0] ?? null;
  // Cash đã trả cho 1 ĐNTT (chỉ method='cash'). ĐNTT "paid" nhưng chỉ toàn cấn trừ
  // (cho_duyet + cấn trừ full lúc tạo) vẫn hủy được — useCancelDNTT xóa can_tru
  // payments + hoàn credit về cong_no nguồn (cùng lớp bug KS ngoài tour, PR #250).
  const dnttCashPaid = (dnttId: number): number =>
    paymentsList
      .filter((p) => p.dntt_id === dnttId && p.method === "cash")
      .reduce((s, p) => s + p.payment_so_tien, 0);
  const canCancel = activeDntt && (
    activeDntt.trang_thai_duyet === "cho_duyet" ||
    activeDntt.trang_thai_duyet === "da_duyet" ||
    activeDntt.payment_status === "paid"
  );
  const shownDntts = [...activeDntts, ...rejectedDntts];
  const isSelected = row.id != null && selectedIds.includes(row.id);

  // Aggregate-after-edits delta (CHỈ phần công ty thanh toán).
  const extraChiPhiRows = allDvRows.filter(r =>
    r.mo_ta?.startsWith(`[dvps_${row.id}] `),
  );
  const groupChiPhi = [row, ...extraChiPhiRows];
  const { sumActual, sumPaid } = sumCompanyChiPhi(groupChiPhi);
  // Cam kết ĐNTT của CẢ NHÓM (main + extras) theo allocation per-dòng (so_tien_da_dntt),
  // KHÔNG phải tổng so_tien của ĐNTT (ĐNTT gộp gồm nhiều dòng khác NCC chung).
  const sumCommitted = groupChiPhi.reduce((s, r) => s + (r.so_tien_da_dntt ?? 0), 0);
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
            // Tích 1 dòng → kéo theo cả nhóm cùng ĐNTT gộp (xem toggleSelectRow).
            toggleSelectRow(row.id, !!v);
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
            ? { kind: "dv", ...dvCdMap[row.ref_doan_ngay_item_id] }
            : null
        }>
          <span>{row.mo_ta || "—"}</span>
        </CatalogHoverCard>
        {row.id != null && (
          <DVFocEditor
            doanId={doanId}
            rowId={row.id}
            focKhach={focResolved.foc_khach}
            focMien={focResolved.foc_mien}
            disabled={locked}
          />
        )}
        {canSuggestMasterFoc && row.id != null && (
          <button
            type="button"
            onClick={() => handleApplyMasterFoc(row, masterFocKhach!, masterFocMien!)}
            disabled={upsertMut.isPending}
            title={t("Áp FOC từ danh mục cảnh điểm vào chi phí (tính lại tiền)")}
            className="ml-1 mt-0.5 inline-flex items-center rounded border border-amber-300 bg-amber-50 px-1 py-px text-[10px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            {t("Áp FOC")} {masterFocKhach}免{masterFocMien}
          </button>
        )}
      </td>

      {/* SL — editable inline; input căn trái cố định (🔒/FOC nằm sau) */}
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1">
          <DVInput
            value={local.so_luong}
            onChange={v => handleRowChange(row.id, "so_luong", v)}
            onBlur={() => handleRowSave(row)}
            width="w-[44px]"
            disabled={locked}
          />
          {row.is_overridden && (
            <span title={t("Đã override — không sync với Điều tour")} className="text-amber-500 text-[10px]">🔒</span>
          )}
          {focMienSo > 0 && (
            <span className="text-green-600 text-xs font-semibold whitespace-nowrap">
              (FOC -{focMienSo})
            </span>
          )}
        </div>
      </td>

      {/* Đơn giá — editable inline; input căn trái cố định (↺ nằm sau) */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <DVInput
            value={local.don_gia}
            onChange={v => handleRowChange(row.id, "don_gia", v)}
            onBlur={() => handleRowSave(row)}
            width="w-[112px]"
            money
            decimal
            disabled={locked}
          />
          {row.is_overridden && !locked && (
            <button
              type="button"
              onClick={() => handleResetOverride(row)}
              title={t("Reset override → sync lại từ Điều tour lần save tới")}
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
          disabled={upsertMut.isPending || locked}
          className={cn(
            "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
            nguoiTt === "cong_ty"
              ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
              : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
          )}
        >
          {nguoiTt === "cong_ty" ? t("Công ty") : t("HDV")}
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
                      {t(statusInfo.textKey)} · {fmt(allocAmt(d))}
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
                        // Cấn trừ dồn vào dòng đầu (lump): chỉ dòng gánh cấn trừ mới hiện CT → TT.
                        const lump = lumpFor(d);
                        const ct = lump?.canTru ?? 0;
                        // TT = còn phải trả (sau cấn trừ & tiền mặt đã trả) — KHỚP cột "Chờ UNC".
                        const thucTT = lump?.choUNC ?? Math.max(0, allocAmt(d) - ct);
                        return (
                          <div className="inline-flex flex-col items-start gap-0.5">
                            <span className={`px-1 py-px rounded text-[10px] leading-tight font-medium whitespace-nowrap ${statusInfo.cls}`}>
                              {t(statusInfo.textKey)} · {fmt(allocAmt(d))}
                              {d.la_coc && <span className="ml-1 opacity-70">·{t("Cọc")}</span>}
                            </span>
                            {ct > 0 && (
                              <span className="text-[9px] text-amber-700 leading-tight whitespace-nowrap" title={canTruNoteFor(d)}>
                                CT {fmt(ct)} → TT {fmt(thucTT)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      {/* ĐNTT sai → hủy, KHÔNG sửa inline (gỡ pencil 2026-05-26) */}
                    </>
                  )}
                </div>
              );
            })}
            {dnttMismatch !== 0 && (
              <span
                className="inline-flex items-center px-1 py-px rounded text-[10px] leading-tight font-medium bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap"
                title={`${t("Số tiền DNTT đã commit")} (${fmt(sumCommitted)} ₫) ${t("khác chi phí thực tế")} (${fmt(sumActual)} ₫). ${t("Hủy ĐNTT & tạo lại.")}`}
              >
                ⚠ {t("DNTT lệch")} {dnttMismatch > 0 ? "+" : "−"}{fmt(Math.abs(dnttMismatch))}
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
                  {t("Đã TT")}{d.thanh_toan_luc ? ` ${format(new Date(d.thanh_toan_luc), "dd/MM")}` : ""}
                </span>
              ) : (
                <span className="px-1 py-px rounded text-[10px] leading-tight font-medium bg-yellow-100 text-yellow-800 whitespace-nowrap">
                  {/* Lump: ĐNTT có cấn trừ → còn lại = alloc − cấn trừ dồn − tiền mặt (tương ứng cột CT).
                      ĐNTT không cấn trừ → giữ logic cũ (alloc − đã trả pro-rata). */}
                  {t("Chờ UNC")} · {fmt(lumpFor(d)?.choUNC ?? Math.max(0, allocAmt(d) - paidForDntt(d)))}
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

      {/* Hóa đơn — dòng công ty: theo ĐNTT; dòng HDV trả: theo chi_phi (kế toán bấm tay). */}
      <td className="px-2 py-2.5 align-top text-center">
        {nguoiTt === "hdv"
          ? <HoaDonChiPhiBadge chiPhiId={row.id!} trangThai={(row.trang_thai_hoa_don ?? "chua_co") as TrangThaiDoc} />
          : <HoaDonCell dntts={activeDntts} />}
      </td>

      {/* Actions */}
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          {nguoiTt === "cong_ty" && canCancel && activeDntt && (activeDntt.payment_status !== "paid" || groupCongNoTotal < sumPaid || dnttCashPaid(activeDntt.id) === 0) && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              title={t("Hủy ĐNTT")}
              onClick={() => {
                setCancelMode("hoan_tien");
                // Chỉ-cấn-trừ: isPaid=false → modal confirm thường, mode=undefined
                // (không tạo cong_no "hoàn tiền" ảo — credit tự hoàn về nguồn).
                setCancelTarget({ dnttId: activeDntt.id, isPaid: activeDntt.payment_status === "paid" && dnttCashPaid(activeDntt.id) > 0 });
              }}>
              <Ban className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="sm"
            className={cn("h-7 text-xs px-2 gap-1", row.thanh_toan_dinh_ky ? "text-indigo-700 hover:text-indigo-800" : "text-muted-foreground hover:text-foreground")}
            title={row.thanh_toan_dinh_ky ? t("Đang định kỳ — bấm để tắt") : t("Đặt thanh toán định kỳ")}
            disabled={upsertMut.isPending}
            onClick={() => handleToggleDinhKy(row)}>
            <CalendarClock className="h-3.5 w-3.5" />
            {row.thanh_toan_dinh_ky && t("Định kỳ")}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            title={t("Thêm dịch vụ phát sinh")}
            disabled={locked}
            onClick={() => handleExtraAdd(row.id!)}>
            <Plus className="h-3 w-3" />
          </Button>
          {nguoiTt === "cong_ty" && !row.thanh_toan_dinh_ky && activeDntts.length === 0 && totalTienCt > 0 && (
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
              onClick={() => openDvModal(row.id!, totalTienCt, row.mo_ta || "", row.nha_cung_cap_id, row.ngay_so)}>
              {t("ĐNTT")}
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
              placeholder={t("Tên dịch vụ phát sinh...")}
              value={extra.mo_ta}
              disabled={locked}
              onChange={(e) => handleExtraChange(row.id!, idx, "mo_ta", e.target.value)}
              onBlur={() => handleExtraSave(row.id!, idx)}
            />
          </div>
        </td>
        {/* SL — căn trái, khớp dòng chính */}
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1">
            <DVInput
              value={extra.so_luong}
              onChange={v => handleExtraChange(row.id!, idx, "so_luong", v)}
              onBlur={() => handleExtraSave(row.id!, idx)}
              width="w-[44px]"
              disabled={locked}
            />
          </div>
        </td>
        {/* Đơn giá — căn trái, khớp dòng chính */}
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1">
            <DVInput
              value={extra.don_gia}
              onChange={v => handleExtraChange(row.id!, idx, "don_gia", v)}
              onBlur={() => handleExtraSave(row.id!, idx)}
              width="w-[112px]"
              money
              decimal
              disabled={locked}
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
            disabled={locked}
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
            {extra.nguoi_tt === "cong_ty" ? t("Công ty") : t("HDV")}
          </button>
        </td>
        <td colSpan={2} /> {/* TT ĐNTT + TT Thanh toán */}
        {/* Hóa đơn — extra HDV trả → badge riêng. Đọc trang_thai_hoa_don từ allDvRows
            (tươi) vì extrasMap chỉ init 1 lần, không reconcile sau khi đổi badge. */}
        <td className="px-2 py-1.5 text-center">
          {extra.nguoi_tt === "hdv" && extra.id != null && (
            <HoaDonChiPhiBadge
              chiPhiId={extra.id}
              trangThai={(allDvRows.find((r) => r.id === extra.id)?.trang_thai_hoa_don ?? "chua_co") as TrangThaiDoc}
            />
          )}
        </td>
        {/* Delete — khóa khi nhóm còn ĐNTT hiệu lực: tiền extra đã nằm trong alloc
            của main (per-row/gộp), xóa row sẽ làm committed lệch khỏi thực tế.
            Muốn bỏ → sửa SL/đơn giá về 0 (footer aggregate tự tính công nợ). */}
        <td className="px-2 py-1.5 text-right">
          <button
            disabled={locked || activeDntts.length > 0}
            title={activeDntts.length > 0 ? t("Nhóm còn ĐNTT hiệu lực — sửa SL/đơn giá về 0 thay vì xóa") : undefined}
            onClick={() => handleExtraDelete(row.id!, idx)}
            className="text-destructive hover:text-destructive/80 p-0.5 disabled:opacity-40"
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
        <td colSpan={11} className="px-3 py-1.5">
          <div className="flex items-center justify-end gap-3 text-[11px]">
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
                setAggCanTru([]);
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
                ? `${t("Thanh toán bổ sung")} ${fmt(effectiveDelta)} ₫`
                : `${t("Xử lý chênh lệch thừa")} ${fmt(Math.abs(effectiveDelta))} ₫`}
            </Button>
          </div>
        </td>
      </tr>
    ),
  ];
}
