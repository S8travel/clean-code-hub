import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  target: ChiPhiRow | null;
  sl: string;
  onSlChange: (v: string) => void;
  donGia: string;
  onDonGiaChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

// Modal "Điều chỉnh chi phí thực tế" cho 1 chi phí dịch vụ (tách từ ChiPhiDVSection).
export default function DVAdjustModal({
  target, sl, onSlChange, donGia, onDonGiaChange, reason, onReasonChange,
  onClose, onSubmit, submitting,
}: Props) {
  return (
    <Dialog open={!!target} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Điều chỉnh chi phí thực tế</DialogTitle>
        </DialogHeader>
        {target && (() => {
          const newSL    = parseInt(sl.replace(/\D/g, ""), 10) || 0;
          const newGia   = parseFloat(donGia.replace(/\.$/, "")) || 0;
          const newTotal = newSL * newGia;
          const oldTotal = target.so_luong * target.don_gia;
          const changed  = newSL !== target.so_luong || newGia !== target.don_gia;
          return (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-xs text-muted-foreground">{target.mo_ta}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Hiện tại:</span>
                <span className="font-medium tabular-nums">
                  {target.so_luong} × {fmt(target.don_gia)} = {fmt(oldTotal)} ₫
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Số lượng thực tế</Label>
                  <Input
                    className="h-8 text-sm tabular-nums"
                    value={sl}
                    onChange={e => onSlChange(e.target.value.replace(/\D/g, ""))}
                    placeholder="SL"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Đơn giá thực tế</Label>
                  <Input
                    className="h-8 text-sm tabular-nums"
                    inputMode="decimal"
                    value={donGia}
                    onChange={(e) => {
                      let s = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
                      const firstDot = s.indexOf(".");
                      if (firstDot >= 0) {
                        s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
                      }
                      onDonGiaChange(s);
                    }}
                    placeholder="Đơn giá"
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs border-t pt-2">
                <span className="text-muted-foreground">Tổng thực tế:</span>
                <span className="font-semibold tabular-nums text-primary">{fmt(newTotal)} ₫</span>
              </div>
              {changed && (
                <div className="text-[11px] text-muted-foreground">
                  Sau lưu, hệ thống sẽ tự tính delta toàn nhóm (main + extras) và hiện
                  nút "Ghi nhận công nợ" hoặc "Thanh toán bổ sung" ở cuối nhóm nếu cần.
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Lý do (optional)</Label>
                <Textarea
                  className="text-xs min-h-[56px]"
                  value={reason}
                  onChange={e => onReasonChange(e.target.value)}
                  placeholder="VD: 1 khách không đi do mệt..."
                />
              </div>
            </div>
          );
        })()}
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Đóng</Button>
          <Button
            size="sm"
            className="text-xs"
            disabled={
              submitting ||
              !target ||
              !sl || !donGia ||
              (parseInt(sl.replace(/\D/g, ""), 10) === target?.so_luong &&
               (parseFloat(donGia.replace(/\.$/, "")) || 0) === target?.don_gia)
            }
            onClick={onSubmit}
          >
            Cập nhật
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
