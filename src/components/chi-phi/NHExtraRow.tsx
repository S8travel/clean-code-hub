import { Trash2, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyChietKhau } from "@/lib/chi-phi-calc";
import { NHInput } from "./NHInput";
import { HoaDonChiPhiBadge } from "./HoaDonBadge";
import VoucherEditPopover from "./VoucherEditPopover";
import type { TrangThaiDoc } from "@/hooks/use-hoa-don-unc";
import { fmt, type LocalNHExtra } from "./nh-section-shared";
import type { VoucherTarget } from "./DungVoucherModal";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  mealKey: string;
  extra: LocalNHExtra;
  idx: number;
  onChange: (key: string, idx: number, field: keyof LocalNHExtra, value: string | number) => void;
  onSave: (key: string, idx: number, nguoiTtOverride?: "cong_ty" | "hdv") => void;
  onDelete: (key: string, idx: number) => void;
  /** Đoàn đã quyết toán → khóa (trừ admin). */
  locked?: boolean;
  /** Trạng thái hóa đơn TƯƠI đọc từ chiPhiRows (extrasMap init-once, không reconcile). */
  trangThaiHoaDon?: string | null;
  /** Dòng phát sinh ĐÃ phủ voucher → 🔒 khóa input + popover sửa vé + chặn xóa. */
  covered?: boolean;
  /** Tên voucher đã phủ (tooltip badge + popover). */
  voucherTen?: string | null;
  /** Số vé voucher hiện phủ (cho popover sửa). */
  voucherSoVe?: number;
  /** Loại voucher (mua/tặng) — quyết định preview popover. */
  voucherLoai?: "mua" | "tang";
  /** Tồn kho voucher còn lại (kẹp trần khi tăng vé). */
  tonKhoConLai?: number;
  /** Đủ điều kiện áp voucher (công ty + chưa ĐNTT riêng + suất chính đã thanh toán). */
  voucherEligible?: boolean;
  onOpenVoucher?: (target: VoucherTarget) => void;
  onEditVoucher?: (chiPhiId: number, veMoi: number) => void;
  /** Target build sẵn ở NHRow (có nh/ngày/giá sau CK) để mở modal voucher. */
  voucherTarget?: VoucherTarget | null;
}

// 1 dòng dịch vụ phát sinh của bữa ăn. Tách verbatim từ NHRow.
export default function NHExtraRow({
  mealKey, extra, idx, onChange, onSave, onDelete, locked = false, trangThaiHoaDon = null,
  covered = false, voucherTen = null, voucherSoVe = 0, voucherLoai = "mua", tonKhoConLai = 0,
  voucherEligible = false, onOpenVoucher, onEditVoucher, voucherTarget = null,
}: Props) {
  useTranslate();
  // Khóa sửa giá/SL/CK khi đã phủ voucher (giá trị đã chốt vào redemption.gia_tri).
  const inputDisabled = locked || covered;
  return (
    <tr className="border-b border-border/50 last:border-b-0 bg-muted/20">
      {/* Col 1: empty */}
      <td />
      {/* Col 2: empty */}
      <td />
      {/* Col 3: description */}
      <td className="px-3 py-1">
        <div className="flex items-center gap-1.5 pl-4">
          <span className="text-muted-foreground text-[10px] shrink-0">↳</span>
          <Input
            placeholder={t("Dịch vụ phát sinh")}
            value={extra.mo_ta}
            disabled={inputDisabled}
            onChange={(e) => onChange(mealKey, idx, "mo_ta", e.target.value)}
            onBlur={() => onSave(mealKey, idx)}
            className="h-6 text-xs flex-1"
          />
          {covered && (
            <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700"
              title={voucherTen || t("Đã dùng voucher")}>
              <Ticket className="h-3 w-3" /> {t("Voucher")}
            </span>
          )}
        </div>
      </td>
      {/* Col 4: số lượng — căn trái, khớp dòng chính */}
      <td className="px-3 py-1">
        <div className="flex items-center gap-1">
          <NHInput
            value={extra.so_luong}
            onChange={(v) => onChange(mealKey, idx, "so_luong", v)}
            onBlur={() => onSave(mealKey, idx)}
            width="w-[56px]"
            disabled={inputDisabled}
          />
        </div>
      </td>
      {/* Col 6: đơn giá — căn trái, khớp dòng chính */}
      <td className="px-3 py-1">
        <div className="flex items-center gap-1">
          <NHInput
            value={extra.don_gia}
            onChange={(v) => onChange(mealKey, idx, "don_gia", v)}
            onBlur={() => onSave(mealKey, idx)}
            width="w-[112px]"
            money
            decimal
            disabled={inputDisabled}
          />
        </div>
      </td>
      {/* Col 7: CK% riêng từng extra (suất trẻ em = CK; HDV phát sinh để 0) */}
      <td className="px-2 py-1">
        <div className="relative flex justify-center">
          <NHInput
            value={extra.chiet_khau_phan_tram}
            onChange={(v) => onChange(mealKey, idx, "chiet_khau_phan_tram", v)}
            onBlur={() => onSave(mealKey, idx)}
            width="w-[48px]"
            disabled={inputDisabled}
          />
          {(() => {
            const truocCK = extra.so_luong * extra.don_gia;
            const sauCK = applyChietKhau(truocCK, extra.chiet_khau_phan_tram);
            const ckSoTien = truocCK - sauCK;
            // Chỉ hiện khi CK% > 0 thật. Nếu CK% = 0 mà đơn giá lẻ, ckSoTien chỉ là
            // phần dư làm tròn thành tiền (vd 25000,92×12=300011,04 → −0,04), KHÔNG
            // phải chiết khấu — không hiện để khỏi gây hiểu nhầm là có CK.
            return extra.chiet_khau_phan_tram > 0 && ckSoTien > 0 ? (
              <span className="absolute left-1/2 -translate-x-1/2 top-full -mt-1 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap pointer-events-none">
                −{fmt(ckSoTien)}
              </span>
            ) : null;
          })()}
        </div>
      </td>
      {/* Col 8: thành tiền (đã trừ CK) */}
      <td className="px-3 py-1 text-right whitespace-nowrap">
        {extra.so_luong > 0 && extra.don_gia > 0 ? (
          <span className={cn("text-[11px] font-semibold", extra.nguoi_tt === "hdv" ? "text-amber-600" : "text-primary")}>
            {fmt(applyChietKhau(extra.so_luong * extra.don_gia, extra.chiet_khau_phan_tram))}
          </span>
        ) : extra.mo_ta.trim() ? (
          // Đã đặt tên mà chưa có giá: ô trống trông y như khoản miễn phí, OP bỏ dở
          // rồi xuất Excel là dòng in ra "SL 1 / đơn giá 0". Nói thẳng ở đúng chỗ.
          <span className="text-[10px] text-orange-600 font-medium" title={t("Nhập số lượng và đơn giá, nếu không dòng này in ra trống")}>
            {t("chưa nhập giá")}
          </span>
        ) : ""}
      </td>
      {/* Col 9: Ai trả — toggle giống main row */}
      <td className="px-2 py-1 text-center">
        <button
          disabled={inputDisabled}
          onClick={() => {
            const next = extra.nguoi_tt === "hdv" ? "cong_ty" : "hdv";
            onChange(mealKey, idx, "nguoi_tt", next);
            onSave(mealKey, idx, next);
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
      {/* Col 10: empty */}
      <td />
      {/* Col Hóa đơn: extra HDV trả → badge riêng (kế toán bấm tay). Extra công ty gộp nhóm → trống. */}
      <td className="px-2 py-1 text-center">
        {extra.nguoi_tt === "hdv" && extra.id != null && (
          <HoaDonChiPhiBadge chiPhiId={extra.id} trangThai={(trangThaiHoaDon ?? "chua_co") as TrangThaiDoc} />
        )}
      </td>
      {/* Col 11: voucher (dùng/gỡ) + delete — sticky mép phải khớp cột Actions hàng chính */}
      <td className="px-2 py-1 sticky right-0 z-10 bg-card shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.12)]">
        <div className="flex justify-end items-center gap-0.5">
          {/* Voucher: chỉ dòng công ty đủ điều kiện. Sửa vé tại chỗ khi đã phủ. */}
          {covered ? (
            <VoucherEditPopover
              veCu={voucherSoVe}
              soKhachThucTe={extra.so_luong}
              donGia={extra.don_gia}
              ckPct={extra.chiet_khau_phan_tram}
              loai={voucherLoai}
              voucherTen={voucherTen ?? ""}
              tonKhoConLai={tonKhoConLai}
              disabled={locked}
              onSubmit={(veMoi) => extra.id != null && onEditVoucher?.(extra.id, veMoi)}
            />
          ) : voucherEligible && voucherTarget ? (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-purple-600"
              title={t("Dùng voucher")}
              onClick={() => onOpenVoucher?.(voucherTarget)}>
              <Ticket className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" className="h-6 w-6" disabled={locked || covered}
            title={covered ? t("Gỡ voucher trước khi xóa") : undefined}
            onClick={() => onDelete(mealKey, idx)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
