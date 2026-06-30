import { useState, useEffect } from "react";
import { Ticket } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useVoucherByNCC, type VoucherRow } from "@/hooks/use-voucher";
import { splitVoucherCoverage } from "@/lib/voucher";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

/** Dòng chi phí đang muốn đổi voucher. coverValue = giá trị công ty cả dòng (full). */
export interface VoucherTarget {
  chiPhiId: number;
  nccId: number | null;
  nccName: string | null;
  itemName: string;
  /** Giá trị công ty CẢ DÒNG (thành tiền sau FOC + CK) — dùng làm full để chia theo số vé. */
  coverValue: number;
  /** Số vé tối đa = số khách tính tiền (sau FOC). Cũng là mặc định phủ HẾT. */
  soVe: number;
  /** Đơn giá 1 vé (trước CK) — để tính giá trị phủ khi chọn số vé < số khách. */
  donGia: number;
  /** CK% suất chính — áp khi tính giá trị phủ một phần. */
  ckPct: number | null;
}

interface Props {
  target: VoucherTarget | null;
  onClose: () => void;
  onSelect: (voucher: VoucherRow, soVe: number) => void;
  submitting: boolean;
}

// Modal chọn voucher còn tồn của ĐÚNG NCC dòng chi phí → đổi N vé của 1 suất.
// Dùng chung cho cả Nhà hàng và Dịch vụ.
export default function DungVoucherModal({ target, onClose, onSelect, submitting }: Props) {
  useTranslate();
  const { data: vouchers = [], isLoading } = useVoucherByNCC(target?.nccId);

  // Số vé voucher phủ — mặc định phủ HẾT (= số khách). Sửa được để phủ một phần.
  const maxVe = target?.soVe ?? 0;
  const [soVe, setSoVe] = useState(maxVe);
  useEffect(() => { setSoVe(target?.soVe ?? 0); }, [target?.chiPhiId, target?.soVe]);

  const veClamped = Math.max(0, Math.min(soVe, maxVe));
  const coverValue = target
    ? splitVoucherCoverage({
        soKhachThucTe: maxVe, donGia: target.donGia, ckPct: target.ckPct,
        soVe: veClamped, loai: "tang",
      }).coverValue
    : 0;
  const isPartial = veClamped > 0 && veClamped < maxVe;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-purple-600" />
            {t("Dùng voucher")}
          </DialogTitle>
        </DialogHeader>

        {target && (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-2">
              <div className="font-medium">{target.itemName}</div>
              <div className="text-muted-foreground">
                {target.nccName || t("Dòng chưa có nhà cung cấp")}
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">{t("Số vé phủ")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={maxVe}
                  step={1}
                  value={soVe || ""}
                  onChange={(e) => setSoVe(Math.max(0, Math.min(Math.round(Number(e.target.value) || 0), maxVe)))}
                  className="h-7 w-20 text-xs tabular-nums"
                />
                <span className="text-muted-foreground">/ {maxVe} {t("khách")}</span>
              </div>
              <div className="text-muted-foreground">
                {t("Giá trị phủ")}: <span className="font-semibold text-foreground tabular-nums">{fmt(coverValue)} ₫</span>
                {isPartial && (
                  <span className="ml-1 text-[11px] text-amber-600">
                    ({t("còn lại")} {fmt(Math.max(0, target.coverValue - coverValue))} ₫ {t("tạo ĐNTT")})
                  </span>
                )}
              </div>
            </div>

            {!target.nccId ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("Dòng chưa có nhà cung cấp")}
              </p>
            ) : isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : vouchers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("NCC này chưa có voucher tồn")}
              </p>
            ) : (
              <div className="max-h-72 overflow-auto space-y-1.5">
                {vouchers.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={submitting || veClamped <= 0}
                    onClick={() => onSelect(v, veClamped)}
                    className="w-full flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-xs hover:bg-purple-50 hover:border-purple-200 transition-colors disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-1.5">
                        {v.ten}
                        <span className={cn(
                          "shrink-0 px-1 py-px rounded text-[9px] font-medium",
                          v.loai === "tang" ? "bg-pink-100 text-pink-700" : "bg-sky-100 text-sky-700",
                        )}>
                          {v.loai === "tang" ? t("Tặng") : t("Mua")}
                        </span>
                      </div>
                      {v.ghi_chu && <div className="text-[11px] text-muted-foreground truncate">{v.ghi_chu}</div>}
                    </div>
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700">
                      {t("Còn lại")}: {v.so_luong_con_lai}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>{t("Hủy")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
