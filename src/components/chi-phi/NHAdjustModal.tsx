import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { calcSoKhachThucTe } from "@/lib/foc-calc";
import { applyChietKhau } from "@/lib/chi-phi-calc";
import type { ChiPhiRow } from "@/hooks/use-chi-phi";
import { fmt } from "./nh-section-shared";

export interface AdjustNHTarget {
  chiPhi: ChiPhiRow;
  mainMoTa: string;        // "<NH name> (trưa|tối)"
  nhName: string;
  focKhach: number | null;
  focMien: number | null;
  ckPct: number;
}

interface Props {
  target: AdjustNHTarget | null;
  soKhach: string;
  onSoKhachChange: (v: string) => void;
  donGia: string;
  onDonGiaChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

// Modal điều chỉnh bữa ăn thực tế sau thanh toán (HYBRID). Tách verbatim từ ChiPhiNHSection.
export default function NHAdjustModal({
  target, soKhach, onSoKhachChange, donGia, onDonGiaChange,
  reason, onReasonChange, submitting, onClose, onSubmit,
}: Props) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Điều chỉnh bữa ăn thực tế</DialogTitle>
        </DialogHeader>
        {target && (() => {
          const newSK  = parseInt(soKhach.replace(/\D/g, ""), 10) || 0;
          const newGia = parseFloat(donGia.replace(/\.$/, "")) || 0;
          const skTT = calcSoKhachThucTe(newSK, target.focKhach, target.focMien);
          const totalTruocCK = skTT * newGia;
          const totalSauCK = applyChietKhau(totalTruocCK, target.ckPct);
          const ckTien = totalTruocCK - totalSauCK;
          const oldSK = target.chiPhi.so_luong;
          const oldGia = target.chiPhi.don_gia;
          const oldTotal = Number(target.chiPhi.thanh_tien_thuc_te ?? target.chiPhi.tien_cong_ty ?? 0);
          const changed = newSK !== oldSK || newGia !== oldGia;
          return (
            <div className="space-y-3 py-1 text-sm">
              <p className="text-xs text-muted-foreground">{target.mainMoTa}</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Hiện tại:</span>
                <span className="font-medium tabular-nums">
                  {oldSK} × {fmt(oldGia)} = {fmt(oldTotal)} ₫
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Số khách thực tế</Label>
                  <Input
                    className="h-8 text-sm tabular-nums"
                    value={soKhach}
                    onChange={(e) => onSoKhachChange(e.target.value.replace(/\D/g, ""))}
                    placeholder="SK"
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
              <div className="space-y-0.5 text-[11px] text-muted-foreground border-t pt-1.5">
                {(target.focKhach && target.focMien) ? (
                  <div className="flex justify-between">
                    <span>FOC ({target.focKhach} miễn {target.focMien}):</span>
                    <span className="tabular-nums">{newSK} → tính {skTT} suất</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span>Tổng trước CK:</span>
                  <span className="tabular-nums">{fmt(totalTruocCK)} ₫</span>
                </div>
                {target.ckPct > 0 && (
                  <div className="flex justify-between">
                    <span>Chiết khấu {target.ckPct}%:</span>
                    <span className="tabular-nums">−{fmt(ckTien)} ₫</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between text-xs border-t pt-2">
                <span className="text-muted-foreground">Tổng thực tế:</span>
                <span className="font-semibold tabular-nums text-primary">{fmt(totalSauCK)} ₫</span>
              </div>
              {changed && (
                <div className="text-[11px] text-muted-foreground">
                  Sau lưu, hệ thống tự tính chênh lệch toàn nhóm (main + extras) và hiện
                  nút "Ghi nhận công nợ" hoặc "Thanh toán bổ sung" ở cuối nhóm nếu cần.
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Lý do (optional)</Label>
                <Textarea
                  className="text-xs min-h-[56px]"
                  value={reason}
                  onChange={(e) => onReasonChange(e.target.value)}
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
              !soKhach || !donGia ||
              (parseInt(soKhach.replace(/\D/g, ""), 10) === target?.chiPhi.so_luong &&
               (parseFloat(donGia.replace(/\.$/, "")) || 0) === target?.chiPhi.don_gia)
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
