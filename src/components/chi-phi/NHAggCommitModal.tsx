import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";
import type { DNTTRow } from "@/hooks/use-dntt";
import KSCongNoPanel, { type CanTruSelection } from "./KSCongNoPanel";
import { fmt } from "./nh-section-shared";

export interface AggCommitNHTarget {
  mainRow: ChiPhiRow;
  nhName: string;
  nccId: number | null;
  nccName: string | null;
  delta: number;       // < 0 = thừa (cong_no), > 0 = thiếu (DNTT bổ sung)
  sumActual: number;
  sumPaid: number;
  groupCongNoCN: number;
  groupCongNoHT: number;
  paidDntt: DNTTRow | null;
  ngayDate: string | null;
}

interface Props {
  target: AggCommitNHTarget | null;
  doanId: number;
  reason: string;
  onReasonChange: (v: string) => void;
  ngayCan: string;
  onNgayCanChange: (v: string) => void;
  surplusMode: "con_du" | "hoan_tien";
  onSurplusModeChange: (v: "con_du" | "hoan_tien") => void;
  canTru: CanTruSelection | null;
  onCanTruChange: (v: CanTruSelection | null) => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

// Modal chốt chênh lệch sau điều chỉnh bữa ăn. Tách verbatim từ ChiPhiNHSection.
export default function NHAggCommitModal({
  target, doanId, reason, onReasonChange, ngayCan, onNgayCanChange,
  surplusMode, onSurplusModeChange, canTru, onCanTruChange,
  submitting, onClose, onSubmit,
}: Props) {
  return (
    <Dialog open={!!target} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {target && target.delta > 0
              ? "Tạo ĐNTT bổ sung"
              : surplusMode === "hoan_tien" ? "Ghi nhận hoàn tiền" : "Ghi nhận công nợ"}
          </DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3 py-1 text-sm">
            <p className="text-xs text-muted-foreground">{target.mainRow.mo_ta}</p>
            <div className="space-y-1 text-xs border rounded px-2 py-1.5 bg-muted/30">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng thực tế (nhóm):</span>
                <span className="font-medium tabular-nums">{fmt(target.sumActual)} ₫</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Đã thanh toán:</span>
                <span className="font-medium tabular-nums">{fmt(target.sumPaid)} ₫</span>
              </div>
              {target.groupCongNoCN > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">(−) Đã ghi nhận công nợ:</span>
                  <span className="font-medium tabular-nums">{fmt(target.groupCongNoCN)} ₫</span>
                </div>
              )}
              {target.groupCongNoHT > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">(−) Đã hoàn tiền:</span>
                  <span className="font-medium tabular-nums">{fmt(target.groupCongNoHT)} ₫</span>
                </div>
              )}
              {(target.groupCongNoCN > 0 || target.groupCongNoHT > 0) && (
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">Còn cần thanh toán:</span>
                  <span className="font-medium tabular-nums">{fmt(target.sumPaid - target.groupCongNoCN - target.groupCongNoHT)} ₫</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1">
                <span className="text-muted-foreground">Chênh lệch còn lại:</span>
                <span className={cn(
                  "font-semibold tabular-nums",
                  target.delta > 0 ? "text-orange-700" : "text-purple-700",
                )}>
                  {target.delta > 0 ? "+" : "−"}{fmt(Math.abs(target.delta))} ₫
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    ({target.delta > 0 ? "thiếu, cần thanh toán thêm" : "thừa"})
                  </span>
                </span>
              </div>
            </div>
            {target.nccName && (
              <div className="text-xs text-muted-foreground">
                NCC: <span className="font-medium text-foreground">{target.nccName}</span>
              </div>
            )}
            {target.delta > 0 && target.nccId != null && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">Cấn trừ công nợ NCC (optional)</Label>
                <KSCongNoPanel
                  nccId={target.nccId}
                  doanId={doanId}
                  value={canTru}
                  onChange={(v) => {
                    if (v && target) {
                      const capped = Math.min(v.soTienCanTru, target.delta);
                      onCanTruChange({ ...v, soTienCanTru: capped });
                    } else {
                      onCanTruChange(v);
                    }
                  }}
                />
                {canTru && canTru.soTienCanTru > 0 && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    DNTT sẽ tạo: <span className="font-medium text-foreground">{fmt(target.delta)} ₫</span>
                    {" · "}Cấn trừ: <span className="font-medium text-amber-700">{fmt(canTru.soTienCanTru)} ₫</span>
                    {" · "}Cash còn TT: <span className="font-medium text-foreground">{fmt(target.delta - canTru.soTienCanTru)} ₫</span>
                  </p>
                )}
              </div>
            )}
            {target.delta < 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Hình thức xử lý</Label>
                <RadioGroup
                  value={surplusMode}
                  onValueChange={(v) => onSurplusModeChange(v as "con_du" | "hoan_tien")}
                  className="space-y-1.5"
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="con_du" id="nh-agg-cn" className="mt-0.5" />
                    <Label htmlFor="nh-agg-cn" className="text-xs cursor-pointer leading-tight">
                      <span className="font-medium">Ghi nhận công nợ</span>
                      <p className="text-muted-foreground font-normal">NCC giữ tiền — có thể cấn trừ với DNTT khác cùng NCC</p>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="hoan_tien" id="nh-agg-ht" className="mt-0.5" />
                    <Label htmlFor="nh-agg-ht" className="text-xs cursor-pointer leading-tight">
                      <span className="font-medium">Ghi nhận hoàn tiền</span>
                      <p className="text-muted-foreground font-normal">NCC trả lại tiền cash — không cấn trừ</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}
            {target.delta > 0 && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">Ngày cần thanh toán</Label>
                <DatePicker className="h-8 text-xs w-full" value={ngayCan} onChange={onNgayCanChange} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Lý do (optional)</Label>
              <Textarea
                className="text-xs min-h-[56px]"
                value={reason}
                onChange={e => onReasonChange(e.target.value)}
                placeholder={
                  target.delta > 0
                    ? "VD: phát sinh thêm 1 món tráng miệng..."
                    : "VD: 1 khách không đi do mệt..."
                }
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
            Đóng
          </Button>
          <Button
            size="sm"
            className={cn(
              "text-xs text-white",
              target && target.delta > 0
                ? "bg-orange-600 hover:bg-orange-700"
                : "bg-purple-600 hover:bg-purple-700",
            )}
            disabled={submitting || !target}
            onClick={onSubmit}
          >
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
