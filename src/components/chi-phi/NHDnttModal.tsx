import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { calcSoKhachThucTe, resolveNHFoc } from "@/lib/foc-calc";
import { calcNHDnttAmount } from "@/lib/nh-dntt-calc";
import type { NhaHangDetail } from "@/hooks/use-chi-phi-nh";
import KSCongNoMultiPanel from "./KSCongNoMultiPanel";
import { type CanTruSelection } from "./KSCongNoPanel";
import { fmt, type LocalNHRow, type LocalNHExtra } from "./nh-section-shared";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  row: LocalNHRow | null;
  extras: LocalNHExtra[];
  nh: NhaHangDetail | undefined;
  mode: "full" | "deposit";
  onModeChange: (v: "full" | "deposit") => void;
  depositAmount: number;
  onDepositAmountChange: (v: number) => void;
  alreadyPaid: number;
  bsAmount: number;
  onBsAmountChange: (v: number) => void;
  ngayCan: string;
  onNgayCanChange: (v: string) => void;
  canTru: CanTruSelection[];
  onCanTruChange: (v: CanTruSelection[]) => void;
  submitting: boolean;
  /** Voucher TẶNG phủ N vé → ĐNTT chỉ tính số ghế CÒN LẠI (số khách − N). Phủ HẾT →
   *  suất chính = 0 (chỉ phát sinh). 0/undefined = không tặng (MUA giữ full / không voucher). */
  mainCoverVe?: number;
  onClose: () => void;
  onSubmit: () => void;
}

// Modal tạo ĐNTT cho 1 bữa ăn. Tách verbatim từ ChiPhiNHSection.
export default function NHDnttModal({
  row, extras, nh, mode, onModeChange, depositAmount, onDepositAmountChange,
  alreadyPaid, bsAmount, onBsAmountChange, ngayCan, onNgayCanChange,
  canTru, onCanTruChange, submitting, mainCoverVe = 0, onClose, onSubmit,
}: Props) {
  useTranslate();
  if (!row) return null;
  const focResolvedModal = resolveNHFoc(row, nh);
  const soKhachThucTe = calcSoKhachThucTe(row.so_khach, focResolvedModal.foc_khach, focResolvedModal.foc_mien);
  // Tặng N vé → ĐNTT chỉ gồm số ghế còn lại. mainCovered = true khi phủ hết (0 ghế còn).
  const effectiveMainSeats = Math.max(0, soKhachThucTe - mainCoverVe);
  const mainTotalModal = effectiveMainSeats * row.don_gia;
  const allExtrasTotalModal = extras.reduce((s, e) => s + e.so_luong * e.don_gia, 0);
  const hdvExtrasTotalModal = extras.filter(e => e.nguoi_tt === "hdv").reduce((s, e) => s + e.so_luong * e.don_gia, 0);
  const ckPctModal = row?.chiet_khau_phan_tram ?? nh?.chiet_khau_phan_tram ?? null;
  // Số tiền ĐNTT — DÙNG CHUNG calcNHDnttAmount (khớp handleDnttSubmit, hết drift CK phát sinh).
  const { grossCompany: grossBuaModal, chietKhau: chietKhauModal, netCompany: totalBua } =
    calcNHDnttAmount({ mainGrossAfterFoc: mainTotalModal, mainCkPct: ckPctModal, mainCovered: mainCoverVe > 0 && effectiveMainSeats <= 0, extras });
  const effectiveTotalBua = Math.max(0, totalBua - alreadyPaid);
  const isBSMode = effectiveTotalBua <= 0;
  const soTien = isBSMode ? bsAmount : (mode === "full" ? effectiveTotalBua : depositAmount);
  const soTienConLai = isBSMode ? 0 : (mode === "full" ? 0 : effectiveTotalBua - depositAmount);
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isBSMode ? t("ĐNTT bổ sung") : alreadyPaid > 0 ? t("ĐNTT còn lại") : t("Tạo đề nghị TT")} — {nh?.ten}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-xs">
          {chietKhauModal > 0 ? (
            <div className="space-y-0.5">
              <p className="text-muted-foreground">{t("Tổng bữa ăn (sau FOC)")}: <span className="font-semibold text-foreground">{fmt(grossBuaModal)} VND</span></p>
              <p className="text-green-600">{t("Chiết khấu")} {ckPctModal}%: <span className="font-semibold">−{fmt(chietKhauModal)} VND</span></p>
              <p>{t("Thực thanh toán")}: <span className="font-semibold">{fmt(totalBua)} VND</span></p>
            </div>
          ) : (
            <p>{t("Tổng bữa ăn")}: <span className="font-semibold">{fmt(totalBua)} VND</span></p>
          )}
          {alreadyPaid > 0 && (
            <>
              <p>{t("Đã thanh toán")}: <span className="font-semibold text-amber-600">- {fmt(alreadyPaid)} VND</span></p>
              {!isBSMode && <p>{t("Còn lại")}: <span className="font-semibold text-primary">{fmt(effectiveTotalBua)} VND</span></p>}
            </>
          )}
          {extras.length > 0 && alreadyPaid === 0 && (
            <div className="space-y-0.5 text-muted-foreground">
              <p>{t("Gồm")}: {fmt(mainTotalModal)} VND ({t("chính")}){allExtrasTotalModal > 0 ? ` + ${fmt(allExtrasTotalModal)} VND (${t("phát sinh")})` : ""}</p>
              {hdvExtrasTotalModal > 0 && (
                <p className="text-amber-600">{t("HDV thanh toán")}: <span className="font-semibold">−{fmt(hdvExtrasTotalModal)} VND</span></p>
              )}
            </div>
          )}
          {isBSMode ? (
            <div className="space-y-1.5">
              <p className="text-[11px] text-amber-600">{t("Đã thanh toán đủ — nhập số tiền bổ sung cần thanh toán thêm.")}</p>
              <Label className="text-xs">{t("Số tiền bổ sung")}</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={bsAmount || ""}
                onChange={(e) => onBsAmountChange(Number(e.target.value) || 0)}
                min={0}
                placeholder={t("Nhập số tiền...")}
              />
            </div>
          ) : (
            <>
              <RadioGroup
                value={mode}
                onValueChange={(v) => onModeChange(v as "full" | "deposit")}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="full" id="nh-full" />
                  <Label htmlFor="nh-full" className="text-xs cursor-pointer">
                    {t("Toàn bộ")} — {fmt(effectiveTotalBua)} VND
                  </Label>
                </div>
                {alreadyPaid === 0 && (
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="deposit" id="nh-dep" />
                    <Label htmlFor="nh-dep" className="text-xs cursor-pointer">{t("1 phần (cọc)")}</Label>
                  </div>
                )}
              </RadioGroup>
              {mode === "deposit" && alreadyPaid === 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("Số tiền cọc")}</Label>
                  <Input
                    type="number"
                    className="h-8 text-xs"
                    value={depositAmount || ""}
                    onChange={(e) => onDepositAmountChange(Number(e.target.value) || 0)}
                    max={effectiveTotalBua}
                  />
                  {depositAmount > 0 && (
                    <p className="text-[11px] text-muted-foreground">{t("Còn lại")}: {fmt(soTienConLai)} VND</p>
                  )}
                </div>
              )}
            </>
          )}
          {/* Ngày cần thanh toán */}
          <div className="space-y-1">
            <Label className="text-xs">{t("Ngày cần thanh toán")}</Label>
            <DatePicker className="h-8 text-xs w-full" value={ngayCan} onChange={onNgayCanChange} />
          </div>
          <KSCongNoMultiPanel
            nccId={nh?.nha_cung_cap_id}
            maxAmount={
              isBSMode
                ? bsAmount || 0
                : mode === "deposit"
                  ? depositAmount || 0
                  : effectiveTotalBua
            }
            value={canTru}
            onChange={onCanTruChange}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
            {t("Hủy")}
          </Button>
          <Button
            size="sm"
            className="text-xs"
            onClick={onSubmit}
            disabled={submitting || soTien <= 0}
          >
            {t("Tạo đề nghị TT")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
