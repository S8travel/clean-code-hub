import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { t, useTranslate } from "@/lib/i18n";

export interface CancelTarget { dnttId: number; isPaid: boolean }

interface Props {
  target: CancelTarget | null;
  mode: "cong_no" | "hoan_tien";
  onModeChange: (v: "cong_no" | "hoan_tien") => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

// Modal "Hủy đề nghị thanh toán" (tách từ ChiPhiDVSection).
export default function DVCancelModal({
  target, mode, onModeChange, onClose, onSubmit, submitting,
}: Props) {
  useTranslate();
  return (
    <Dialog open={!!target} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader><DialogTitle className="text-sm">{t("Hủy đề nghị thanh toán")}</DialogTitle></DialogHeader>
        {target?.isPaid && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("Đã thanh toán — chọn cách xử lý")}:</p>
            <RadioGroup value={mode} onValueChange={v => onModeChange(v as "cong_no" | "hoan_tien")} className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="hoan_tien" id="dv-cancel-ht" />
                <Label htmlFor="dv-cancel-ht" className="text-xs">{t("Hoàn tiền")}</Label>
              </div>
              <div className="flex items-center gap-1.5">
                <RadioGroupItem value="cong_no" id="dv-cancel-cn" />
                <Label htmlFor="dv-cancel-cn" className="text-xs">{t("Ghi công nợ")}</Label>
              </div>
            </RadioGroup>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>{t("Đóng")}</Button>
          <Button variant="destructive" size="sm" onClick={onSubmit} disabled={submitting}>{t("Xác nhận hủy")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
