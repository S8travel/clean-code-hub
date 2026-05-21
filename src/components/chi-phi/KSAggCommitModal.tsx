import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { DNTTRow } from "@/hooks/use-dntt";
import KSCongNoPanel, { type CanTruSelection } from "./KSCongNoPanel";
import { fmt } from "./ks-section-shared";

// Aggregate commit dialog (chốt chênh lệch sau OP edit so_phong/gia_phong/FOC)
export interface AggCommitKSTarget {
  ksId: number;
  ksName: string;
  nccId: number | null;
  nccName: string | null;
  chiPhiIds: number[];
  delta: number;       // < 0 = thừa (cong_no), > 0 = thiếu (DNTT bổ sung)
  sumActual: number;
  sumPaid: number;
  groupCongNoCN: number;
  groupCongNoHT: number;
  paidDntt: DNTTRow | null;
  serviceDate: string | null;
}

interface Props {
  target: AggCommitKSTarget | null;
  doanId: number;
  commitMode: "full" | "deposit";
  onCommitModeChange: (v: "full" | "deposit") => void;
  depositAmount: number;
  onDepositAmountChange: (v: number) => void;
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

// Modal chốt chênh lệch KS sau OP edit so_phong/gia_phong/FOC. Tách verbatim từ ChiPhiKSSection.
export default function KSAggCommitModal({
  target: aggCommit, doanId,
  commitMode: aggCommitMode, onCommitModeChange: setAggCommitMode,
  depositAmount: aggDepositAmount, onDepositAmountChange: setAggDepositAmount,
  reason: aggReason, onReasonChange: setAggReason,
  ngayCan: aggNgayCan, onNgayCanChange: setAggNgayCan,
  surplusMode: aggSurplusMode, onSurplusModeChange: setAggSurplusMode,
  canTru: aggCanTru, onCanTruChange: setAggCanTru,
  submitting, onClose, onSubmit: handleAggCommit,
}: Props) {
  return (
    <Dialog open={!!aggCommit} onOpenChange={o => { if (!o) { onClose(); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {aggCommit && aggCommit.delta > 0
              ? (aggCommitMode === "deposit" ? "Tạo ĐNTT cọc bổ sung" : "Tạo ĐNTT bổ sung")
              : aggSurplusMode === "hoan_tien" ? "Ghi nhận hoàn tiền" : "Ghi nhận công nợ"}
          </DialogTitle>
        </DialogHeader>
        {aggCommit && (
          <div className="space-y-3 py-1 text-sm">
            <p className="text-xs text-muted-foreground">{aggCommit.ksName}</p>
            <div className="space-y-1 text-xs border rounded px-2 py-1.5 bg-muted/30">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng thực tế (KS):</span>
                <span className="font-medium tabular-nums">{fmt(aggCommit.sumActual)} ₫</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Đã thanh toán:</span>
                <span className="font-medium tabular-nums">{fmt(aggCommit.sumPaid)} ₫</span>
              </div>
              {aggCommit.groupCongNoCN > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">(−) Đã ghi nhận công nợ:</span>
                  <span className="font-medium tabular-nums">{fmt(aggCommit.groupCongNoCN)} ₫</span>
                </div>
              )}
              {aggCommit.groupCongNoHT > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">(−) Đã hoàn tiền:</span>
                  <span className="font-medium tabular-nums">{fmt(aggCommit.groupCongNoHT)} ₫</span>
                </div>
              )}
              {(aggCommit.groupCongNoCN > 0 || aggCommit.groupCongNoHT > 0) && (
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">Còn cần thanh toán:</span>
                  <span className="font-medium tabular-nums">{fmt(aggCommit.sumPaid - aggCommit.groupCongNoCN - aggCommit.groupCongNoHT)} ₫</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1">
                <span className="text-muted-foreground">Chênh lệch còn lại:</span>
                <span className={cn(
                  "font-semibold tabular-nums",
                  aggCommit.delta > 0 ? "text-orange-700" : "text-purple-700",
                )}>
                  {aggCommit.delta > 0 ? "+" : "−"}{fmt(Math.abs(aggCommit.delta))} ₫
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    ({aggCommit.delta > 0 ? "thiếu, cần thanh toán thêm" : "thừa"})
                  </span>
                </span>
              </div>
            </div>
            {aggCommit.nccName && (
              <div className="text-xs text-muted-foreground">
                NCC: <span className="font-medium text-foreground">{aggCommit.nccName}</span>
              </div>
            )}
            {aggCommit.delta > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Hình thức tạo</Label>
                <RadioGroup
                  value={aggCommitMode}
                  onValueChange={(v) => {
                    setAggCommitMode(v as "full" | "deposit");
                    if (v === "deposit" && aggDepositAmount === 0) {
                      // Default cọc 30% của delta, làm tròn 1000
                      const def = Math.round((aggCommit.delta * 0.3) / 1000) * 1000;
                      setAggDepositAmount(def);
                    }
                  }}
                  className="space-y-1.5"
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="full" id="ks-agg-full" className="mt-0.5" />
                    <Label htmlFor="ks-agg-full" className="text-xs cursor-pointer leading-tight">
                      <span className="font-medium">Toàn bộ — {fmt(aggCommit.delta)} ₫</span>
                      <p className="text-muted-foreground font-normal">Thanh toán hết phần còn lại</p>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="deposit" id="ks-agg-deposit" className="mt-0.5" />
                    <Label htmlFor="ks-agg-deposit" className="text-xs cursor-pointer leading-tight">
                      <span className="font-medium">Cọc thêm 1 phần</span>
                      <p className="text-muted-foreground font-normal">Đánh dấu là cọc — có thể tạo cọc nhiều lần</p>
                    </Label>
                  </div>
                </RadioGroup>
                {aggCommitMode === "deposit" && (
                  <div className="mt-1.5 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Số tiền cọc (tối đa {fmt(aggCommit.delta)} ₫)</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={aggDepositAmount || ""}
                      onChange={(e) => setAggDepositAmount(Math.min(Number(e.target.value) || 0, aggCommit.delta))}
                      max={aggCommit.delta}
                      min={0}
                    />
                    {aggDepositAmount > 0 && (
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        Còn lại sau cọc này: <span className="font-medium text-foreground">{fmt(aggCommit.delta - aggDepositAmount)} ₫</span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {aggCommit.delta > 0 && aggCommit.nccId != null && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">Cấn trừ công nợ NCC (optional)</Label>
                <KSCongNoPanel
                  nccId={aggCommit.nccId}
                  doanId={doanId}
                  value={aggCanTru}
                  onChange={(v) => {
                    if (v && aggCommit) {
                      const maxAmt = aggCommitMode === "deposit" ? aggDepositAmount : aggCommit.delta;
                      const capped = Math.min(v.soTienCanTru, maxAmt);
                      setAggCanTru({ ...v, soTienCanTru: capped });
                    } else {
                      setAggCanTru(v);
                    }
                  }}
                />
                {aggCanTru && aggCanTru.soTienCanTru > 0 && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    DNTT sẽ tạo: <span className="font-medium text-foreground">{fmt(aggCommitMode === "deposit" ? aggDepositAmount : aggCommit.delta)} ₫</span>
                    {" · "}Cấn trừ: <span className="font-medium text-amber-700">{fmt(aggCanTru.soTienCanTru)} ₫</span>
                    {" · "}Cash còn TT: <span className="font-medium text-foreground">{fmt((aggCommitMode === "deposit" ? aggDepositAmount : aggCommit.delta) - aggCanTru.soTienCanTru)} ₫</span>
                  </p>
                )}
              </div>
            )}
            {aggCommit.delta < 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Hình thức xử lý</Label>
                <RadioGroup
                  value={aggSurplusMode}
                  onValueChange={(v) => setAggSurplusMode(v as "con_du" | "hoan_tien")}
                  className="space-y-1.5"
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="con_du" id="ks-agg-cn" className="mt-0.5" />
                    <Label htmlFor="ks-agg-cn" className="text-xs cursor-pointer leading-tight">
                      <span className="font-medium">Ghi nhận công nợ</span>
                      <p className="text-muted-foreground font-normal">NCC giữ tiền — có thể cấn trừ với DNTT khác cùng NCC</p>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="hoan_tien" id="ks-agg-ht" className="mt-0.5" />
                    <Label htmlFor="ks-agg-ht" className="text-xs cursor-pointer leading-tight">
                      <span className="font-medium">Ghi nhận hoàn tiền</span>
                      <p className="text-muted-foreground font-normal">NCC trả lại tiền cash — không cấn trừ</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}
            {aggCommit.delta > 0 && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">Ngày cần thanh toán</Label>
                <DatePicker className="h-8 text-xs w-full" value={aggNgayCan} onChange={setAggNgayCan} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-medium">Lý do (optional)</Label>
              <Textarea
                className="text-xs min-h-[56px]"
                value={aggReason}
                onChange={e => setAggReason(e.target.value)}
                placeholder={
                  aggCommit.delta > 0
                    ? "VD: phụ thu giường phụ..."
                    : "VD: 1 phòng không sử dụng..."
                }
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs"
            onClick={onClose}>
            Đóng
          </Button>
          <Button
            size="sm"
            className={cn(
              "text-xs text-white",
              aggCommit && aggCommit.delta > 0
                ? "bg-orange-600 hover:bg-orange-700"
                : "bg-purple-600 hover:bg-purple-700",
            )}
            disabled={submitting || !aggCommit}
            onClick={handleAggCommit}
          >
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
