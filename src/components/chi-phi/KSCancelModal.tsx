import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { fmt } from "./ks-section-shared";

export interface KSCancelTarget {
  type: "dntt" | "dich_vu"; // "dntt" = hủy khoản đề nghị, "dich_vu" = hủy toàn bộ dịch vụ
  ksId: number;
  ksName: string;
  paidDnttIds: number[];
  unpaidDnttIds: number[];
  paidTotal: number;
}

interface Props {
  target: KSCancelTarget | null;
  mode: "cong_no" | "hoan_tien";
  onModeChange: (v: "cong_no" | "hoan_tien") => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

// Modal hủy ĐNTT / hủy dịch vụ khách sạn. Tách verbatim từ ChiPhiKSSection.
export default function KSCancelModal({
  target, mode, onModeChange, submitting, onClose, onSubmit,
}: Props) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {target?.type === "dntt" ? "Hủy đề nghị thanh toán" : "Hủy sử dụng dịch vụ"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm font-medium">{target?.ksName}</p>

          {target?.type === "dntt" ? (
            /* Hủy ĐNTT: chỉ cancel khoản chưa TT để tạo lại */
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Hủy {target.unpaidDnttIds.length} đề nghị thanh toán đang chờ xử lý.
                Sau khi hủy, bạn có thể tạo đề nghị mới với số tiền chính xác hơn.
              </p>
              <p className="text-xs text-muted-foreground">
                Các khoản đã thanh toán trước đó không bị ảnh hưởng.
              </p>
            </div>
          ) : (
            /* Hủy dịch vụ: cancel tất cả, hỏi xử lý tiền đã TT */
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1 text-xs">
                {target && target.paidTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Đã thanh toán ({target.paidDnttIds.length} khoản)</span>
                    <span className="font-semibold text-destructive">{fmt(target.paidTotal)} VND</span>
                  </div>
                )}
                {target && target.unpaidDnttIds.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Đề nghị chưa TT ({target.unpaidDnttIds.length} khoản)</span>
                    <span className="text-muted-foreground">→ hủy đề nghị</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium">Xử lý {fmt(target?.paidTotal ?? 0)} VND đã thanh toán:</p>
                <RadioGroup value={mode} onValueChange={(v) => onModeChange(v as "cong_no" | "hoan_tien")} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="hoan_tien" id="ks-hoan" className="mt-0.5" />
                    <Label htmlFor="ks-hoan" className="text-xs cursor-pointer">
                      <span className="font-medium">Hoàn lại tiền</span>
                      <p className="text-muted-foreground font-normal">Nhà cung cấp trả lại tiền cho công ty</p>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="cong_no" id="ks-cno" className="mt-0.5" />
                    <Label htmlFor="ks-cno" className="text-xs cursor-pointer">
                      <span className="font-medium">Cấn trừ công nợ</span>
                      <p className="text-muted-foreground font-normal">Giữ lại làm công nợ, cấn trừ vào booking sau</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Đóng</Button>
          <Button variant="destructive" size="sm" className="text-xs" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Đang xử lý..." : "Xác nhận hủy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
