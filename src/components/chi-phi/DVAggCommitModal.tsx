import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { type CanTruSelection } from "./KSCongNoPanel";
import KSCongNoMultiPanel from "./KSCongNoMultiPanel";
import type { ChiPhiRow, DNTTRow } from "@/hooks/use-chi-phi";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export interface AggCommitTarget {
  mainRow: ChiPhiRow;
  delta: number;       // < 0 = thừa (cong_no), > 0 = thiếu (DNTT bổ sung)
  sumActual: number;
  sumPaid: number;
  groupCongNoCN: number;   // sum so_tien_goc cong_no state con_du + da_can_tru
  groupCongNoHT: number;   // sum so_tien_goc cong_no state da_hoan_tien
  paidDntt: DNTTRow | null;
}

interface Props {
  target: AggCommitTarget | null;
  reason: string;
  onReasonChange: (v: string) => void;
  ngayCan: string;
  onNgayCanChange: (v: string) => void;
  surplusMode: "con_du" | "hoan_tien";
  onSurplusModeChange: (v: "con_du" | "hoan_tien") => void;
  canTru: CanTruSelection[];
  onCanTruChange: (v: CanTruSelection[]) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

// Modal chốt chênh lệch sau điều chỉnh: tạo ĐNTT bổ sung (thiếu) hoặc ghi
// công nợ / hoàn tiền (thừa). Tách từ ChiPhiDVSection.
export default function DVAggCommitModal({
  target, reason, onReasonChange, ngayCan, onNgayCanChange,
  surplusMode, onSurplusModeChange, canTru, onCanTruChange,
  onClose, onSubmit, submitting,
}: Props) {
  useTranslate();
  return (
    <Dialog open={!!target} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {target && target.delta > 0
              ? t("Tạo ĐNTT bổ sung")
              : surplusMode === "hoan_tien" ? t("Ghi nhận hoàn tiền") : t("Ghi nhận công nợ")}
          </DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-3 py-1 text-sm">
            <p className="text-xs text-muted-foreground">{target.mainRow.mo_ta}</p>
            <div className="space-y-1 text-xs border rounded px-2 py-1.5 bg-muted/30">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Tổng thực tế (nhóm)")}:</span>
                <span className="font-medium tabular-nums">{fmt(target.sumActual)} ₫</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("Đã thanh toán")}:</span>
                <span className="font-medium tabular-nums">{fmt(target.sumPaid)} ₫</span>
              </div>
              {target.groupCongNoCN > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("(−) Đã ghi nhận công nợ")}:</span>
                  <span className="font-medium tabular-nums">{fmt(target.groupCongNoCN)} ₫</span>
                </div>
              )}
              {target.groupCongNoHT > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("(−) Đã hoàn tiền")}:</span>
                  <span className="font-medium tabular-nums">{fmt(target.groupCongNoHT)} ₫</span>
                </div>
              )}
              {(target.groupCongNoCN > 0 || target.groupCongNoHT > 0) && (
                <div className="flex justify-between border-t pt-1">
                  <span className="text-muted-foreground">{t("Còn cần thanh toán")}:</span>
                  <span className="font-medium tabular-nums">{fmt(target.sumPaid - target.groupCongNoCN - target.groupCongNoHT)} ₫</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1">
                <span className="text-muted-foreground">{t("Chênh lệch còn lại")}:</span>
                <span className={cn(
                  "font-semibold tabular-nums",
                  target.delta > 0 ? "text-orange-700" : "text-purple-700",
                )}>
                  {target.delta > 0 ? "+" : "−"}{fmt(Math.abs(target.delta))} ₫
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                    ({target.delta > 0 ? t("thiếu, cần thanh toán thêm") : t("thừa")})
                  </span>
                </span>
              </div>
            </div>
            {target.paidDntt?.ten_nha_cung_cap && (
              <div className="text-xs text-muted-foreground">
                NCC: <span className="font-medium text-foreground">{target.paidDntt.ten_nha_cung_cap}</span>
              </div>
            )}
            {target.delta > 0 && target.mainRow.nha_cung_cap_id != null && (() => {
              const totalCt = canTru.reduce((s, x) => s + x.soTienCanTru, 0);
              return (
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("Cấn trừ công nợ NCC (optional)")}</Label>
                  <KSCongNoMultiPanel
                    nccId={target.mainRow.nha_cung_cap_id}
                    value={canTru}
                    onChange={onCanTruChange}
                    maxAmount={target.delta}
                  />
                  {totalCt > 0 && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {t("DNTT sẽ tạo")}: <span className="font-medium text-foreground">{fmt(target.delta)} ₫</span>
                      {" · "}{t("Cấn trừ")}: <span className="font-medium text-amber-700">{fmt(totalCt)} ₫</span>
                      {" · "}{t("Cash còn TT")}: <span className="font-medium text-foreground">{fmt(target.delta - totalCt)} ₫</span>
                    </p>
                  )}
                </div>
              );
            })()}
            {target.delta < 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("Hình thức xử lý")}</Label>
                <RadioGroup
                  value={surplusMode}
                  onValueChange={(v) => onSurplusModeChange(v as "con_du" | "hoan_tien")}
                  className="space-y-1.5"
                >
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="con_du" id="dv-agg-cn" className="mt-0.5" />
                    <Label htmlFor="dv-agg-cn" className="text-xs cursor-pointer leading-tight">
                      <span className="font-medium">{t("Ghi nhận công nợ")}</span>
                      <p className="text-muted-foreground font-normal">{t("NCC giữ tiền — có thể cấn trừ với DNTT khác cùng NCC")}</p>
                    </Label>
                  </div>
                  <div className="flex items-start gap-2">
                    <RadioGroupItem value="hoan_tien" id="dv-agg-ht" className="mt-0.5" />
                    <Label htmlFor="dv-agg-ht" className="text-xs cursor-pointer leading-tight">
                      <span className="font-medium">{t("Ghi nhận hoàn tiền")}</span>
                      <p className="text-muted-foreground font-normal">{t("NCC trả lại tiền cash — không cấn trừ")}</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}
            {target.delta > 0 && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">{t("Ngày cần thanh toán")}</Label>
                <DatePicker className="h-8 text-xs w-full" value={ngayCan} onChange={onNgayCanChange} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs font-medium">{t("Lý do (optional)")}</Label>
              <Textarea
                className="text-xs min-h-[56px]"
                value={reason}
                onChange={e => onReasonChange(e.target.value)}
                placeholder={
                  target.delta > 0
                    ? t("VD: phát sinh thêm 1 vé trẻ em...")
                    : t("VD: 1 khách không đi do mệt...")
                }
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
            {t("Đóng")}
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
            {t("Xác nhận")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
