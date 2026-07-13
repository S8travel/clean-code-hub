import { format, subDays, parseISO } from "date-fns";
import { Plus, Ban, Check, X, CalendarClock, Ticket } from "lucide-react";
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
import { canApplyVoucher, sumGroupVoucherMua, type CoveredInfo } from "@/lib/voucher";
import { type VoucherTarget } from "./DungVoucherModal";
import CatalogHoverCard from "./CatalogHoverCard";
import { NHInput } from "./NHInput";
import { NHFocEditor } from "./NHFocEditor";
import VoucherEditPopover from "./VoucherEditPopover";
import NHExtraRow from "./NHExtraRow";
import NHAggFooterRow from "./NHAggFooterRow";
import { HoaDonCell, HoaDonChiPhiBadge } from "./HoaDonBadge";
import type { TrangThaiDoc } from "@/hooks/use-hoa-don-unc";
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
  /** chi_phi_id → voucher đã phủ (badge 🎟 + khóa input). */
  redemptionByChiPhiId: Record<number, CoveredInfo>;
  /** voucher_id → tồn kho còn lại (kẹp trần khi tăng vé trong popover sửa). */
  voucherStockById: Record<number, number>;
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
  onOpenVoucher: (target: VoucherTarget) => void;
  onRemoveVoucher: (chiPhiId: number) => void;
  onEditVoucher: (chiPhiId: number, veMoi: number) => void;
  /** Sửa số khách suất ĐÃ phủ voucher → vé kẹp + tính lại tiền (đọc so_khach từ localRows). */
  onEditCoveredSoKhach: (key: string) => void;
}

interface Props {
  meal: NHMealRow;
  data: NHRowData;
  handlers: NHRowHandlers;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}

// 1 bữa ăn: dòng chính + dòng phát sinh + dòng aggregate footer.
// Tách verbatim từ ChiPhiNHSection — giữ nguyên 100% logic/hành vi.
export default function NHRow({ meal, data, handlers, locked = false }: Props) {
  useTranslate();
  const {
    localRows, extrasMap, nhaHangMap, selectedKeys, dinhKyKeys, dnttList,
    paymentsList, congNoList, chiPhiRows, canTruByDnttId, editingDnttId,
    editAmount, doanId, redemptionByChiPhiId, voucherStockById, upsertPending, updateDNTTPending,
  } = data;
  const {
    setSelectedKeys, handleChange, handleSave, handleToggleNguoiTtNH,
    handleToggleDinhKyNH, addExtra, handleExtraChange, handleExtraSave,
    handleExtraDelete, handleResetOverrideNH, handleEditAmountSave,
    setEditingDnttId, setEditAmount, setCancelMode, setCancelTarget,
    setDnttAlreadyPaid, setDnttModalMode, setDnttDepositAmount, setDnttNgayCan,
    setDnttModalKey, setAggCommit, setAggReason, setAggSurplusMode,
    setAggCanTru, setAggNgayCan, onOpenVoucher, onEditVoucher, onEditCoveredSoKhach,
  } = handlers;

  const key = `${meal.doan_ngay_id}_${meal.bua_an}`;
  const row = localRows[key];
  const extras = extrasMap[key] || [];
  const nh = nhaHangMap[meal.nha_hang_id];
  const selected = selectedKeys.includes(key);

  // FOC snapshot đọc trực tiếp từ chi_phi (DB cache) — không qua localRows vì
  // localRows chỉ init 1 lần, NHFocEditor cập nhật DB → cache invalidate mới reflect.
  const mainCpForFoc = row?.id ? chiPhiRows.find((c) => c.id === row.id) : null;
  const focSource = mainCpForFoc ?? row;
  const focResolvedRow = resolveNHFoc(focSource, nh);
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
  // Phần phát sinh CÔNG TY phải trả (loại HDV) — dùng để quyết định còn gì cần
  // tạo ĐNTT khi suất chính đã phủ voucher (công ty = 0). CHỈ tính extra ĐÃ LƯU
  // (có id) → nút ĐNTT chỉ hiện khi thật sự có dòng để allocate (tránh hiện nút
  // rồi bấm vào báo lỗi với extra chưa blur-save).
  const companyExtrasTotal = extras.reduce(
    (s, e) => (e.nguoi_tt !== "hdv" && e.id != null)
      ? s + applyChietKhau(e.so_luong * e.don_gia, e.chiet_khau_phan_tram)
      : s,
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
  // voucherKhoRefund: payment 'voucher' GIỮ-LẠI vượt giá trị phủ thực (giảm vé trên
  // ĐNTT đã trả đủ → vé về kho, không hạ payment). Loại khỏi lệch để boat voucher
  // KHÔNG tính vào tiền thừa — chỉ phần cash (extras) mới cần ghi công nợ.
  const groupChiPhiIds = groupChiPhi.map((cp) => cp.id).filter((x): x is number => x != null);
  const groupVoucherPaid = paymentsList
    .filter((p) => p.method === "voucher" && p.chi_phi_id != null && groupChiPhiIds.includes(p.chi_phi_id))
    .reduce((s, p) => s + p.payment_so_tien, 0);
  const groupVoucherGiaTri = groupChiPhiIds.reduce((s, id) => {
    const r = redemptionByChiPhiId[id];
    return r?.voucherLoai === "mua" ? s + r.giaTri : s;
  }, 0);
  const voucherKhoRefund = Math.max(0, groupVoucherPaid - groupVoucherGiaTri);
  const { effectiveDelta, effectiveCommitted } = calcAggregateDelta({
    sumActual, sumPaid, sumCommitted, groupCongNoTotal, voucherKhoRefund,
  });
  const showAggBtn =
    nguoiTtMain === "cong_ty" &&
    daDeNghi === 0 &&
    sumPaid > 0 &&
    effectiveDelta !== 0;
  const aggPaidDntt = paidDntts[0] ?? null;
  const mainChiPhiRow = row?.id ? chiPhiRows.find((c) => c.id === row.id) : null;
  // Phần delta được trả bằng voucher 'mua' (dòng phát sinh phủ voucher CHƯA chốt) —
  // để modal bổ sung hiện "cash thực phải trả". Clamp ≤ delta (khớp buildAggAllocations).
  const aggVoucherAmount = effectiveDelta > 0
    ? Math.min(
        effectiveDelta,
        sumGroupVoucherMua(
          groupChiPhi.filter((cp) => cp.id !== mainChiPhiRow?.id && (cp.so_tien_da_dntt ?? 0) === 0).map((cp) => cp.id),
          redemptionByChiPhiId,
        ).total,
      )
    : 0;
  const hasCommittedDntt = activeDntts.some((d) =>
    d.trang_thai_duyet === "cho_duyet" || d.trang_thai_duyet === "da_duyet",
  );
  // Ẩn badge khi nút footer hiện (trùng thông tin). sumActual === 0 nghĩa
  // là chi_phi.tien_cong_ty CHƯA persist (NH ghi lazily) → KHÔNG cảnh báo.
  const dnttMismatch = sumActual > 0
    ? calcDnttMismatch({ sumActual, effectiveCommitted, hasCommittedDntt, showAggBtn })
    : 0;

  // ── Voucher: chỉ suất chính, chỉ khi chưa có ĐNTT + công ty ────────────────
  // MUA → suất chính giữ giá trị (ĐNTT gồm đủ); TẶNG → miễn phí (loại khỏi ĐNTT).
  const voucherInfo = row?.id != null ? redemptionByChiPhiId[row.id] : undefined;
  const isVoucherCovered = !!voucherInfo;
  const isVoucherCoveredTang = voucherInfo?.voucherLoai === "tang";
  // Tặng MỘT PHẦN: voucher chỉ phủ vài vé → dòng chính còn phần công ty phải trả
  // (tien_cong_ty > 0). Khi đó vẫn cần nút ĐNTT cho phần còn lại. Chỉ tặng-phủ-HẾT
  // (tien_cong_ty = 0) mới loại suất chính khỏi ĐNTT.
  const mainCompanyRemainder = isVoucherCoveredTang ? (mainCpForFoc?.tien_cong_ty ?? 0) : 0;
  const isVoucherCoveredTangFull = isVoucherCoveredTang && mainCompanyRemainder <= 0;
  const voucherEligible = canApplyVoucher({
    nguoiTt: nguoiTtMain,
    activeDnttCount: activeDntts.length,
    hasChiPhiId: row?.id != null,
  });

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

        {/* Ngày + Bữa (gộp 1 cột — bữa hiển thị ngay dưới ngày) */}
        <td className="px-3 py-2 text-center text-muted-foreground whitespace-nowrap text-[11px]">
          <div className="flex flex-col items-center gap-0.5 leading-tight">
            <span>{dateLabel}</span>
            <span className="text-foreground/80">{buaIcon} {buaLabel}</span>
          </div>
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
              disabled={locked || isVoucherCovered}
            />
          )}
        </td>

        {/* Số khách — editable inline; input căn trái cố định (🔒/FOC nằm sau) */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {row ? (
              <>
                {isVoucherCovered ? (
                  // Suất đã phủ voucher: VẪN sửa được số khách — vé voucher kẹp ≤ số
                  // khách + tính lại tiền (onEditCoveredSoKhach). Đơn giá/CK vẫn khóa.
                  <NHInput
                    value={row.so_khach}
                    onChange={(v) => handleChange(key, "so_khach", v)}
                    onBlur={() => onEditCoveredSoKhach(key)}
                    width="w-[56px]"
                    disabled={locked}
                  />
                ) : (
                  <NHInput
                    value={row.so_khach}
                    onChange={(v) => handleChange(key, "so_khach", v)}
                    onBlur={() => handleSave(key)}
                    width="w-[56px]"
                    disabled={locked}
                  />
                )}
                {row.is_overridden && !isVoucherCovered && (
                  <span title={t("Đã override — không sync với Điều tour")} className="text-amber-500 text-[10px]">🔒</span>
                )}
                {focMienSo > 0 && (
                  <span className="text-green-600 text-xs font-semibold whitespace-nowrap">
                    (FOC -{focMienSo})
                  </span>
                )}
              </>
            ) : <span className="text-muted-foreground">—</span>}
          </div>
        </td>

        {/* Đơn giá — editable inline; input căn trái cố định (↺ nằm sau) */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {row ? (
              isVoucherCovered ? (
                <span className="w-[112px] text-right tabular-nums">{fmt(row.don_gia)}</span>
              ) : (
              <>
                <NHInput
                  value={row.don_gia}
                  onChange={(v) => handleChange(key, "don_gia", v)}
                  onBlur={() => handleSave(key)}
                  width="w-[112px]"
                  money
                  decimal
                  disabled={locked}
                />
                {row.is_overridden && row.id != null && !locked && (
                  <button
                    type="button"
                    onClick={() => handleResetOverrideNH(key)}
                    title={t("Reset override → sync lại từ Điều tour ngay")}
                    className="text-muted-foreground hover:text-primary text-[10px]"
                  >↺</button>
                )}
              </>
              )
            ) : <span className="text-muted-foreground">—</span>}
          </div>
        </td>

        {/* CK% editable + số tiền CK (absolute để input thẳng hàng các cell khác) */}
        <td className="px-2 py-2">
          <div className="relative flex justify-center">
            {row ? (
              isVoucherCovered ? (
                <span className="w-[48px] text-center tabular-nums">{row.chiet_khau_phan_tram || 0}</span>
              ) : (
              <>
                <NHInput
                  value={row.chiet_khau_phan_tram}
                  onChange={(v) => handleChange(key, "chiet_khau_phan_tram", v)}
                  onBlur={() => handleSave(key)}
                  width="w-[48px]"
                  disabled={locked}
                />
                {/* Chỉ hiện khi CK% > 0 thật; CK% = 0 + đơn giá lẻ → chietKhauSoTien
                    chỉ là phần dư làm tròn, không phải chiết khấu → không hiện. */}
                {ckPhanTram > 0 && chietKhauSoTien > 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 top-full -mt-1 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap pointer-events-none">
                    −{fmt(chietKhauSoTien)}
                  </span>
                )}
              </>
              )
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
              disabled={upsertPending || isVoucherCovered || locked}
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors border disabled:opacity-60 disabled:cursor-not-allowed",
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
          ) : (
            <div className="flex flex-col gap-0.5 items-center">
              {isVoucherCovered && (
                <span className="inline-flex items-center gap-1 px-1 py-px rounded text-[10px] font-medium bg-purple-100 text-purple-700 whitespace-nowrap"
                  title={voucherInfo?.voucherTen || undefined}>
                  <Ticket className="h-3 w-3" /> {t("Voucher")}
                  {voucherInfo && voucherInfo.soVe > 0 && (
                    <span className="opacity-80">· {voucherInfo.soVe} {t("vé")}</span>
                  )}
                </span>
              )}
              {mainCompanyRemainder > 0 && activeDntts.length === 0 && (
                <span className="text-[9px] text-amber-700 leading-tight whitespace-nowrap">
                  {t("Còn")} {fmt(mainCompanyRemainder)} {t("cần ĐNTT")}
                </span>
              )}
              {!isVoucherCovered && activeDntts.length === 0 && (
                <span className="text-[10px] text-muted-foreground">—</span>
              )}
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

        {/* Hóa đơn */}
        <td className="px-2 py-1 align-top text-center">
          {nguoiTtMain === "hdv"
            ? (row?.id != null
                ? <HoaDonChiPhiBadge chiPhiId={row.id} trangThai={(mainCpForFoc?.trang_thai_hoa_don ?? "chua_co") as TrangThaiDoc} />
                : <span className="text-[10px] text-muted-foreground">—</span>)
            : <HoaDonCell dntts={activeDntts} />}
        </td>

        {/* Actions — sticky mép phải để nút ĐNTT luôn thấy khi bảng cuộn ngang */}
        <td className={cn(
          "px-2 py-1.5 sticky right-0 z-10 shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.12)]",
          selected ? "bg-[#f5f8ff]" : "bg-card",
        )}>
          <div className="flex items-center gap-1 justify-end">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title={t("Thêm dịch vụ phát sinh")}
              disabled={locked}
              onClick={() => addExtra(key)}>
              <Plus className="h-3 w-3" />
            </Button>
            {nguoiTtMain === "cong_ty" && canCancel && activeDntt && (activeDntt.payment_status !== "paid" || groupCongNoTotal < sumPaid || dnttCashPaid(activeDntt.id) === 0) && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                title={t("Hủy")}
                onClick={() => {
                  setCancelMode("hoan_tien");
                  setCancelTarget({
                    dnttId: activeDntt.id,
                    // Chỉ-cấn-trừ: isPaid=false → modal confirm thường, mode=undefined
                    // (không tạo cong_no "hoàn tiền" ảo — credit tự hoàn về nguồn).
                    isPaid: activeDntt.payment_status === "paid" && dnttCashPaid(activeDntt.id) > 0,
                    nhName: nh?.ten || t("Nhà hàng"),
                    // Dịch vụ phát sinh chưa gắn NCC (master lẫn dòng chi phí đều trống)
                    // → modal sẽ hỏi NCC để công nợ cấn trừ được.
                    missingNcc: !nh?.nha_cung_cap_id && !mainChiPhiRow?.nha_cung_cap_id,
                  });
                }}>
                <Ban className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="sm"
              disabled={isVoucherCovered}
              className={cn("h-7 text-xs px-2 gap-1", isMealDinhKy ? "text-indigo-700 hover:text-indigo-800" : "text-muted-foreground hover:text-foreground")}
              onClick={() => handleToggleDinhKyNH(key)}
              title={isMealDinhKy ? t("Đang định kỳ — bấm để bỏ") : t("Đặt thanh toán định kỳ")}>
              <CalendarClock className="h-3.5 w-3.5" />
              {isMealDinhKy && t("Định kỳ")}
            </Button>
            {nguoiTtMain === "cong_ty" && !isMealDinhKy && activeDntts.length === 0 && !!row &&
             (!isVoucherCoveredTangFull || companyExtrasTotal > 0) && (
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2"
                title={isVoucherCoveredTangFull ? t("Tạo ĐNTT cho phần phát sinh (suất chính đã dùng voucher)") : undefined}
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
            {/* Voucher: dùng (đủ điều kiện) / sửa vé tại chỗ (đã phủ). Chỉ suất chính. */}
            {isVoucherCovered && voucherInfo ? (
              <VoucherEditPopover
                veCu={voucherInfo.soVe}
                soKhachThucTe={soKhachThucTe}
                donGia={row?.don_gia ?? 0}
                ckPct={ckPhanTram}
                loai={voucherInfo.voucherLoai}
                voucherTen={voucherInfo.voucherTen}
                tonKhoConLai={voucherStockById[voucherInfo.voucherId] ?? 0}
                disabled={locked}
                onSubmit={(veMoi) => row?.id != null && onEditVoucher(row.id, veMoi)}
              />
            ) : voucherEligible && !isMealDinhKy ? (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-purple-600"
                title={t("Dùng voucher")}
                onClick={() => onOpenVoucher({
                  chiPhiId: row!.id!,
                  nccId: nh?.nha_cung_cap_id ?? null,
                  nccName: nh?.ten_ncc ?? nh?.ten ?? null,
                  itemName: `${nh?.ten || t("Nhà hàng")} · ${dateLabel} ${buaLabel}`,
                  coverValue: mainThanhTien,
                  soVe: soKhachThucTe,
                  donGia: row!.don_gia,
                  ckPct: ckPhanTram,
                })}>
                <Ticket className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            {/* "ĐNTT bổ sung" cũ — REMOVED, replaced by aggregate footer button (showAggBtn) */}
          </div>
        </td>
      </tr>

      {/* Extras sub-rows */}
      {extras.map((extra, idx) => {
        // Voucher trên dòng phát sinh: cho khách +1 dùng voucher khi SUẤT CHÍNH ĐÃ
        // thanh toán (main.so_tien_da_tt>0) — né đường ĐNTT lẻ (vốn chỉ ghi voucher cho
        // suất chính). Dùng da_tt của RIÊNG suất chính, KHÔNG sumPaid nhóm (1 extra khác
        // đã trả cũng làm sumPaid>0 → mở nhầm khi suất chính chưa trả).
        const extraCp = extra.id != null ? chiPhiRows.find((c) => c.id === extra.id) : null;
        const mainPaid = (mainCpForFoc?.so_tien_da_tt ?? 0) > 0;
        const extraCovered = extra.id != null && !!redemptionByChiPhiId[extra.id];
        const extraEligible =
          !extraCovered &&
          !isMealDinhKy &&
          mainPaid &&
          extra.don_gia > 0 &&
          canApplyVoucher({
            nguoiTt: extra.nguoi_tt,
            // ĐNTT "của riêng extra" = đã được allocate (so_tien_da_dntt>0). KHÔNG dùng
            // activeDntts của nhóm bữa (suất chính đã trả → sẽ chặn sai).
            activeDnttCount: (extraCp?.so_tien_da_dntt ?? 0) > 0 ? 1 : 0,
            hasChiPhiId: extra.id != null,
          });
        const extraVoucherTarget: VoucherTarget | null = extra.id != null ? {
          chiPhiId: extra.id,
          nccId: nh?.nha_cung_cap_id ?? null,
          nccName: nh?.ten_ncc ?? nh?.ten ?? null,
          itemName: `${nh?.ten || t("Nhà hàng")} · ${dateLabel} ${buaLabel} · ${extra.mo_ta}`,
          coverValue: applyChietKhau(extra.so_luong * extra.don_gia, extra.chiet_khau_phan_tram),
          soVe: extra.so_luong,
          donGia: extra.don_gia,
          ckPct: extra.chiet_khau_phan_tram,
        } : null;
        const extraRedInfo = extra.id != null ? redemptionByChiPhiId[extra.id] : undefined;
        return (
          <NHExtraRow
            key={idx}
            mealKey={key}
            extra={extra}
            idx={idx}
            onChange={handleExtraChange}
            onSave={handleExtraSave}
            onDelete={handleExtraDelete}
            locked={locked}
            trangThaiHoaDon={extra.id != null ? (chiPhiRows.find((c) => c.id === extra.id)?.trang_thai_hoa_don ?? null) : null}
            covered={extraCovered}
            voucherTen={extraRedInfo?.voucherTen ?? null}
            voucherSoVe={extraRedInfo?.soVe ?? 0}
            voucherLoai={extraRedInfo?.voucherLoai ?? "mua"}
            tonKhoConLai={extraRedInfo ? (voucherStockById[extraRedInfo.voucherId] ?? 0) : 0}
            voucherEligible={extraEligible}
            onOpenVoucher={onOpenVoucher}
            onEditVoucher={onEditVoucher}
            voucherTarget={extraVoucherTarget}
          />
        );
      })}

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
              bua_an: meal.bua_an,
              voucherAmount: aggVoucherAmount,
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
