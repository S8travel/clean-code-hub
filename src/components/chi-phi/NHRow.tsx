import { format, subDays, parseISO } from "date-fns";
import { Plus, Ban, Check, X, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";
import type { DNTTRow } from "@/hooks/use-dntt";
import type { NHMealRow, NhaHangDetail } from "@/hooks/use-chi-phi-nh";
import type { PaymentByChiPhi } from "@/hooks/use-payments";
import type { CongNoRow } from "@/hooks/use-cong-no";
import { calcSoKhachThucTe, resolveNHFoc } from "@/lib/foc-calc";
import { applyChietKhau } from "@/lib/chi-phi-calc";
import { sumCompanyChiPhi, splitGroupCongNo, calcAggregateDelta, calcDnttMismatch } from "@/lib/aggregate-calc";
import CatalogHoverCard from "./CatalogHoverCard";
import { NHInput } from "./NHInput";
import { NHFocEditor } from "./NHFocEditor";
import NHExtraRow from "./NHExtraRow";
import NHAggFooterRow from "./NHAggFooterRow";
import { type AggCommitNHTarget } from "./NHAggCommitModal";
import { type CanTruSelection } from "./KSCongNoPanel";
import { type NHCancelTarget } from "./NHCancelModal";
import { fmt, STATUS_LABEL, extraPrefix, type LocalNHRow, type LocalNHExtra } from "./nh-section-shared";
import { t, useTranslate } from "@/lib/i18n";

/** Dữ liệu dùng chung — gom cụm để khỏi truyền hàng chục props rời. */
export interface NHRowData {
  localRows: Record<string, LocalNHRow>;
  extrasMap: Record<string, LocalNHExtra[]>;
  nhaHangMap: Record<number, NhaHangDetail>;
  selectedKeys: string[];
  dinhKyKeys: Set<string>;
  dnttList: DNTTRow[];
  paymentsList: PaymentByChiPhi[];
  congNoList: CongNoRow[];
  chiPhiRows: ChiPhiRow[];
  canTruByDnttId: Record<number, number>;
  editingDnttId: number | null;
  editAmount: string;
  doanId: number;
  upsertPending: boolean;
  updateDNTTPending: boolean;
}

/** Handler dùng chung — gom cụm. */
export interface NHRowHandlers {
  setSelectedKeys: (updater: (prev: string[]) => string[]) => void;
  handleChange: (key: string, field: "so_khach" | "don_gia" | "chiet_khau_phan_tram", value: number) => void;
  handleSave: (key: string, nguoiTtOverride?: "cong_ty" | "hdv") => void;
  handleToggleNguoiTtNH: (key: string) => void;
  handleToggleDinhKyNH: (key: string) => void;
  addExtra: (key: string) => void;
  handleExtraChange: (key: string, idx: number, field: keyof LocalNHExtra, value: LocalNHExtra[keyof LocalNHExtra]) => void;
  handleExtraSave: (key: string, idx: number, nguoiTtOverride?: "cong_ty" | "hdv") => void;
  handleExtraDelete: (key: string, idx: number) => void;
  handleResetOverrideNH: (key: string) => void;
  handleEditAmountSave: (dnttId: number) => void;
  setEditingDnttId: (v: number | null) => void;
  setEditAmount: (v: string) => void;
  setCancelMode: (v: "cong_no" | "hoan_tien") => void;
  setCancelTarget: (v: NHCancelTarget | null) => void;
  setDnttAlreadyPaid: (v: number) => void;
  setDnttModalMode: (v: "full" | "deposit") => void;
  setDnttDepositAmount: (v: number) => void;
  setDnttNgayCan: (v: string) => void;
  setDnttModalKey: (v: string | null) => void;
  setAggCommit: (v: AggCommitNHTarget | null) => void;
  setAggReason: (v: string) => void;
  setAggSurplusMode: (v: "con_du" | "hoan_tien") => void;
  setAggCanTru: (v: CanTruSelection[]) => void;
  setAggNgayCan: (v: string) => void;
}

interface Props {
  meal: NHMealRow;
  data: NHRowData;
  handlers: NHRowHandlers;
}

// 1 bữa ăn: dòng chính + dòng phát sinh + dòng aggregate footer.
// Tách verbatim từ ChiPhiNHSection — giữ nguyên 100% logic/hành vi.
export default function NHRow({ meal, data, handlers }: Props) {
  useTranslate();
  const {
    localRows, extrasMap, nhaHangMap, selectedKeys, dinhKyKeys, dnttList,
    paymentsList, congNoList, chiPhiRows, canTruByDnttId, editingDnttId,
    editAmount, doanId, upsertPending, updateDNTTPending,
  } = data;
  const {
    setSelectedKeys, handleChange, handleSave, handleToggleNguoiTtNH,
    handleToggleDinhKyNH, addExtra, handleExtraChange, handleExtraSave,
    handleExtraDelete, handleResetOverrideNH, handleEditAmountSave,
    setEditingDnttId, setEditAmount, setCancelMode, setCancelTarget,
    setDnttAlreadyPaid, setDnttModalMode, setDnttDepositAmount, setDnttNgayCan,
    setDnttModalKey, setAggCommit, setAggReason, setAggSurplusMode,
    setAggCanTru, setAggNgayCan,
  } = handlers;

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
  // Extras: mỗi dòng áp CK% riêng (suất trẻ em = menu chính cần CK).
  const extrasTotal = extras.reduce(
    (s, e) => s + applyChietKhau(e.so_luong * e.don_gia, e.chiet_khau_phan_tram),
    0,
  );
  const totalTruocCK = mainTotal + extrasTotal;
  // Chiết khấu % từ local row (override) hoặc từ nha_hang — chỉ áp dụng cho main row
  const ckPhanTram = row?.chiet_khau_phan_tram ?? nh?.chiet_khau_phan_tram ?? 0;
  const mainThanhTien = applyChietKhau(mainTotal, ckPhanTram);
  const chietKhauSoTien = mainTotal - mainThanhTien;
  const totalBua = mainThanhTien + extrasTotal;

  const dateLabel = meal.ngay_date
    ? `N${meal.ngay_so} · ${format(new Date(meal.ngay_date + "T00:00:00"), "d/M")}`
    : `N${meal.ngay_so}`;
  const buaLabel = meal.bua_an === "trua" ? t("Trưa") : t("Tối");
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
  // cong_no chỉ tra theo ĐNTT CÒN HIỆU LỰC. cong_no từ ĐNTT đã hủy/từ chối
  // (vd hủy dịch vụ + hoàn tiền) là lịch sử đã tất toán → không tính vào card,
  // không ẩn row khi user chọn lại nhà hàng đó ở Điều tour.
  const mealDnttIds = activeDntts.map((d) => d.id);
  const hoanTienAmount = congNoList
    .filter((c) => c.dntt_goc_id != null && mealDnttIds.includes(c.dntt_goc_id) && c.trang_thai === "da_hoan_tien")
    .reduce((s, c) => s + c.so_tien_goc, 0);

  // Tổng cong_no đã ghi nhận cho group này. Split CN/HT cho display modal.
  const groupCongNoForGroup = congNoList.filter(
    (c) => c.dntt_goc_id != null && mealDnttIds.includes(c.dntt_goc_id),
  );
  const { groupCongNoCN, groupCongNoHT, groupCongNoTotal } =
    splitGroupCongNo(groupCongNoForGroup);

  // Aggregate-after-edits delta (CHỈ phần công ty thanh toán).
  // Group = main chi_phi (id=row.id) + extras chi_phi (mo_ta startsWith [trua]/[toi]).
  const extraPrefixStr = extraPrefix(meal.bua_an);
  const groupChiPhi = chiPhiRows.filter((cp) =>
    cp.danh_muc === "nha_hang" &&
    cp.ref_doan_ngay_id === meal.doan_ngay_id &&
    (cp.id === row?.id || cp.mo_ta?.startsWith(extraPrefixStr)),
  );
  const { sumActual, sumPaid } = sumCompanyChiPhi(groupChiPhi);
  const sumCommitted = activeDntts.reduce((s, d) => s + Number(d.so_tien), 0);
  const { effectiveDelta, effectiveCommitted } = calcAggregateDelta({
    sumActual, sumPaid, sumCommitted, groupCongNoTotal,
  });
  const showAggBtn =
    nguoiTtMain === "cong_ty" &&
    daDeNghi === 0 &&
    sumPaid > 0 &&
    effectiveDelta !== 0;
  const aggPaidDntt = paidDntts[0] ?? null;
  const mainChiPhiRow = row?.id ? chiPhiRows.find((c) => c.id === row.id) : null;
  const hasCommittedDntt = activeDntts.some((d) =>
    d.trang_thai_duyet === "cho_duyet" || d.trang_thai_duyet === "da_duyet",
  );
  // Ẩn badge khi nút footer hiện (trùng thông tin). sumActual === 0 nghĩa
  // là chi_phi.tien_cong_ty CHƯA persist (NH ghi lazily) → KHÔNG cảnh báo.
  const dnttMismatch = sumActual > 0
    ? calcDnttMismatch({ sumActual, effectiveCommitted, hasCommittedDntt, showAggBtn })
    : 0;

  return (
    <>
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

        {/* Số khách — editable inline; input căn trái cố định (🔒/FOC nằm sau) */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {row ? (
              <>
                <NHInput
                  value={row.so_khach}
                  onChange={(v) => handleChange(key, "so_khach", v)}
                  onBlur={() => handleSave(key)}
                  width="w-[56px]"
                />
                {row.is_overridden && (
                  <span title={t("Đã override — không sync với Điều tour")} className="text-amber-500 text-[10px]">🔒</span>
                )}
                <span className="w-[20px] text-green-600 text-[10px]">
                  {focMienSo > 0 ? `-${focMienSo}` : ""}
                </span>
              </>
            ) : <span className="text-muted-foreground">—</span>}
          </div>
        </td>

        {/* Đơn giá — editable inline; input căn trái cố định (↺ nằm sau) */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {row ? (
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
                    onClick={() => handleResetOverrideNH(key)}
                    title={t("Reset override → sync lại từ Điều tour ngay")}
                    className="text-muted-foreground hover:text-primary text-[10px]"
                  >↺</button>
                )}
              </>
            ) : <span className="text-muted-foreground">—</span>}
          </div>
        </td>

        {/* CK% editable + số tiền CK (absolute để input thẳng hàng các cell khác) */}
        <td className="px-2 py-2">
          <div className="relative flex justify-center">
            {row ? (
              <>
                <NHInput
                  value={row.chiet_khau_phan_tram}
                  onChange={(v) => handleChange(key, "chiet_khau_phan_tram", v)}
                  onBlur={() => handleSave(key)}
                  width="w-[48px]"
                />
                {chietKhauSoTien > 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 top-full -mt-1 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap pointer-events-none">
                    −{fmt(chietKhauSoTien)}
                  </span>
                )}
              </>
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
              disabled={upsertPending}
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border",
                nguoiTtMain === "cong_ty"
                  ? "bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200"
                  : "bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200"
              )}
            >
              {nguoiTtMain === "cong_ty" ? t("Công ty") : t("HDV")}
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
                            if (e.key === "Enter") handleEditAmountSave(d.id);
                            if (e.key === "Escape") setEditingDnttId(null);
                          }}
                          className="h-5 w-20 text-[10px] px-1.5 py-0"
                        />
                        <Button variant="ghost" size="sm" className="h-4 w-4 p-0 text-emerald-600 hover:text-emerald-700"
                          disabled={updateDNTTPending}
                          onClick={() => handleEditAmountSave(d.id)}>
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
                                {t(statusInfo.textKey)} · {fmt(d.so_tien)}
                                {d.la_coc && <span className="ml-1 opacity-70">·{t("Cọc")}</span>}
                              </span>
                              {ct > 0 && (
                                <span className="text-[9px] text-amber-700 leading-tight whitespace-nowrap">
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
                    {t("Đã TT")}{d.thanh_toan_luc ? ` ${format(new Date(d.thanh_toan_luc), "dd/MM")}` : ""}
                  </span>
                ) : (
                  <span className="px-1 py-px rounded text-[10px] leading-none font-medium bg-yellow-100 text-yellow-800">
                    {t("Chờ UNC")} · {fmt(d.so_tien - (d.paid_amount || 0))}
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
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title={t("Thêm dịch vụ phát sinh")}
              onClick={() => addExtra(key)}>
              <Plus className="h-3 w-3" />
            </Button>
            {nguoiTtMain === "cong_ty" && canCancel && activeDntt && (activeDntt.payment_status !== "paid" || groupCongNoTotal < sumPaid) && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                title={t("Hủy")}
                onClick={() => {
                  setCancelMode("hoan_tien");
                  setCancelTarget({
                    dnttId: activeDntt.id,
                    isPaid: activeDntt.payment_status === "paid",
                    nhName: nh?.ten || t("Nhà hàng"),
                  });
                }}>
                <Ban className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="sm"
              className={cn("h-7 text-xs px-2 gap-1", isMealDinhKy ? "text-indigo-700 hover:text-indigo-800" : "text-muted-foreground hover:text-foreground")}
              onClick={() => handleToggleDinhKyNH(key)}
              title={isMealDinhKy ? t("Đang định kỳ — bấm để bỏ") : t("Đặt thanh toán định kỳ")}>
              <CalendarClock className="h-3.5 w-3.5" />
              {isMealDinhKy && t("Định kỳ")}
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
                {t("ĐNTT")}
              </Button>
            )}
            {/* "ĐNTT bổ sung" cũ — REMOVED, replaced by aggregate footer button (showAggBtn) */}
          </div>
        </td>
      </tr>

      {/* Extras sub-rows */}
      {extras.map((extra, idx) => (
        <NHExtraRow
          key={idx}
          mealKey={key}
          extra={extra}
          idx={idx}
          onChange={handleExtraChange}
          onSave={handleExtraSave}
          onDelete={handleExtraDelete}
        />
      ))}

      {/* Aggregate commit footer row — chỉ hiện khi còn chênh lệch SAU TRỪ cong_no đã ghi nhận */}
      {showAggBtn && mainChiPhiRow && (
        <NHAggFooterRow
          effectiveDelta={effectiveDelta}
          sumActual={sumActual}
          sumPaid={sumPaid}
          groupCongNoTotal={groupCongNoTotal}
          onCommit={() => {
            setAggCommit({
              mainRow: mainChiPhiRow,
              nhName: nh?.ten || t("Nhà hàng"),
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
            setAggCanTru([]);
            if (effectiveDelta > 0 && meal.ngay_date) {
              try {
                setAggNgayCan(format(subDays(parseISO(meal.ngay_date), 1), "yyyy-MM-dd"));
              } catch { setAggNgayCan(""); }
            } else {
              setAggNgayCan("");
            }
          }}
        />
      )}
    </>
  );
}
