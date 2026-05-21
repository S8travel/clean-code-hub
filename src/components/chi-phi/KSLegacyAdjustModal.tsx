import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DNTTRow } from "@/hooks/use-dntt";
import { fmt } from "./ks-section-shared";

interface Props {
  target: DNTTRow | null;
  amount: string;
  onAmountChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  surplusMode: "cong_no" | "hoan_tien";
  onSurplusModeChange: (v: "cong_no" | "hoan_tien") => void;
  submitDisabled: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

// Adjustment dialog (legacy — vẫn giữ code nhưng button đã ẩn). Tách verbatim từ ChiPhiKSSection.
export default function KSLegacyAdjustModal({
  target: adjustTarget, amount: adjustAmount, onAmountChange: setAdjustAmount,
  reason: adjustReason, onReasonChange: setAdjustReason,
  surplusMode: adjustSurplusMode, onSurplusModeChange: setAdjustSurplusMode,
  submitDisabled, onClose, onSubmit,
}: Props) {
  return (
    <Dialog open={!!adjustTarget} onOpenChange={(o) => { if (!o) { onClose(); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Điều chỉnh sau thanh toán</DialogTitle>
        </DialogHeader>
        {adjustTarget && (
          <div className="space-y-3 py-1 text-sm">
            <p className="text-xs text-muted-foreground">{adjustTarget.mo_ta}</p>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Đã thanh toán:</span>
              <span className="font-semibold">{fmt(adjustTarget.so_tien)} ₫</span>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Số tiền thực tế</label>
              <input
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="Nhập số tiền..."
              />
            </div>
            {(() => {
              const actual = parseInt(adjustAmount.replace(/\D/g, ""), 10);
              if (isNaN(actual) || actual === adjustTarget.so_tien) return null;
              const delta = actual - adjustTarget.so_tien;
              if (delta > 0) return (
                <div className="rounded px-3 py-2 text-xs font-medium bg-yellow-50 text-yellow-700">
                  Thiếu {fmt(delta)} ₫ → tạo ĐNTT bổ sung (chờ duyệt)
                </div>
              );
              return (
                <div className="space-y-1.5">
                  <p className="text-xs text-purple-700 font-medium">Thừa {fmt(Math.abs(delta))} ₫ — chọn hình thức xử lý:</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAdjustSurplusMode("cong_no")}
                      className={cn("flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors",
                        adjustSurplusMode === "cong_no" ? "border-purple-400 bg-purple-50 text-purple-700" : "border-border text-muted-foreground hover:border-muted-foreground"
                      )}>Ghi công nợ NCC</button>
                    <button type="button" onClick={() => setAdjustSurplusMode("hoan_tien")}
                      className={cn("flex-1 rounded border px-2 py-1.5 text-xs font-medium transition-colors",
                        adjustSurplusMode === "hoan_tien" ? "border-green-400 bg-green-50 text-green-700" : "border-border text-muted-foreground hover:border-muted-foreground"
                      )}>Hoàn tiền</button>
                  </div>
                </div>
              );
            })()}
            <div className="space-y-1">
              <label className="text-xs font-medium">Lý do</label>
              <Textarea
                className="text-xs min-h-[56px]"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="VD: Đổi loại phòng, giảm số đêm..."
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Đóng</Button>
          <Button
            size="sm"
            className="text-xs"
            disabled={submitDisabled}
            onClick={onSubmit}
          >
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
