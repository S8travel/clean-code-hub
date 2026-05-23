import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { t, useTranslate } from "@/lib/i18n";

export interface NHCancelTarget {
  dnttId: number;
  isPaid: boolean;
  nhName: string;
}

interface Props {
  target: NHCancelTarget | null;
  mode: "cong_no" | "hoan_tien";
  onModeChange: (v: "cong_no" | "hoan_tien") => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

// Modal hủy ĐNTT / khoản thanh toán bữa ăn. Tách verbatim từ ChiPhiNHSection.
export default function NHCancelModal({
  target, mode, onModeChange, submitting, onClose, onSubmit,
}: Props) {
  useTranslate();
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {target?.isPaid ? t("Hủy khoản thanh toán") : t("Hủy đề nghị thanh toán")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-xs text-muted-foreground">{target?.nhName}</p>
          {target?.isPaid ? (
            <RadioGroup
              value={mode}
              onValueChange={(v) => onModeChange(v as "cong_no" | "hoan_tien")}
              className="space-y-2"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="hoan_tien" id="nh-hoan" className="mt-0.5" />
                <Label htmlFor="nh-hoan" className="text-xs cursor-pointer">
                  <span className="font-medium">{t("Hoàn lại tiền")}</span>
                  <p className="text-muted-foreground font-normal">{t("Không ghi nhận công nợ")}</p>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="cong_no" id="nh-cno" className="mt-0.5" />
                <Label htmlFor="nh-cno" className="text-xs cursor-pointer">
                  <span className="font-medium">{t("Cấn trừ công nợ")}</span>
                  <p className="text-muted-foreground font-normal">{t("Ghi nhận công nợ cho nhà cung cấp")}</p>
                </Label>
              </div>
            </RadioGroup>
          ) : (
            <p className="text-xs">{t("Đề nghị sẽ bị hủy, chi phí trở về trạng thái chưa gửi duyệt.")}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
            {t("Đóng")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="text-xs"
            onClick={onSubmit}
            disabled={submitting}
          >
            {t("Xác nhận hủy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
