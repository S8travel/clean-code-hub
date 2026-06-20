import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import KSCongNoMultiPanel from "./KSCongNoMultiPanel";
import type { CanTruSelection } from "./KSCongNoPanel";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export interface DVModalTarget {
  chiPhiId: number;
  thanhTien: number;
  moTa: string;
  nccId: number | null;
  nhaySo: number | null;
}

interface Props {
  target: DVModalTarget | null;
  mode: "full" | "deposit";
  onModeChange: (v: "full" | "deposit") => void;
  depositAmount: number;
  onDepositAmountChange: (v: number) => void;
  ngayCan: string;
  onNgayCanChange: (v: string) => void;
  canTru: CanTruSelection[];
  onCanTruChange: (v: CanTruSelection[]) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

// Modal "Tạo đề nghị thanh toán" cho 1 chi phí dịch vụ (tách từ ChiPhiDVSection).
export default function DVDnttModal({
  target, mode, onModeChange, depositAmount, onDepositAmountChange,
  ngayCan, onNgayCanChange, canTru, onCanTruChange, onClose, onSubmit, submitting,
}: Props) {
  useTranslate();
  return (
    <Dialog open={!!target} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{t("Tạo đề nghị thanh toán")} — {target?.moTa || t("Dịch vụ")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-xs">
          <p>{t("Tổng tiền")}: <span className="font-semibold">{fmt(target?.thanhTien ?? 0)} VND</span></p>
          <RadioGroup value={mode} onValueChange={v => onModeChange(v as "full" | "deposit")} className="space-y-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="full" id="dv-full" />
              <Label htmlFor="dv-full" className="text-xs cursor-pointer">
                {t("Toàn bộ")} — {fmt(target?.thanhTien ?? 0)} VND
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="deposit" id="dv-dep" />
              <Label htmlFor="dv-dep" className="text-xs cursor-pointer">{t("1 phần (cọc)")}</Label>
            </div>
          </RadioGroup>
          {mode === "deposit" && (
            <div className="space-y-1">
              <Label className="text-xs">{t("Số tiền cọc")}</Label>
              <Input type="number" className="h-8 text-xs"
                value={depositAmount || ""}
                onChange={e => onDepositAmountChange(Number(e.target.value) || 0)}
                max={target?.thanhTien} />
              {depositAmount > 0 && target && (
                <p className="text-[11px] text-muted-foreground">{t("Còn lại")}: {fmt(target.thanhTien - depositAmount)} VND</p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">{t("Ngày cần thanh toán")}</Label>
            <DatePicker className="h-8 text-xs w-full" value={ngayCan} onChange={onNgayCanChange} />
          </div>
          <KSCongNoMultiPanel
            nccId={target?.nccId ?? undefined}
            maxAmount={mode === "deposit" ? depositAmount || 0 : target?.thanhTien ?? 0}
            value={canTru}
            onChange={onCanTruChange}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>{t("Hủy")}</Button>
          <Button size="sm" className="text-xs" onClick={onSubmit} disabled={submitting}>
            {t("Tạo đề nghị TT")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
