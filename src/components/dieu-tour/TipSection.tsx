import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatThousands, parseThousands } from "@/lib/utils";

interface Props {
  // Doan context
  soKhach: number;
  soKhachTl: number;
  ngayDi: string | null;
  ngayVe: string | null;
  // Controlled state
  thuTip: boolean;
  tipRate: number | null;
  tipSoNgayOverride: number | null;
  tipSoKhachOverride: number | null;
  tipLumpSum: number | null;
  // Handlers (debounced auto-save via parent)
  onThuTipChange: (v: boolean) => void;
  onTipRateChange: (v: number | null) => void;
  onTipSoNgayOverrideChange: (v: number | null) => void;
  onTipSoKhachOverrideChange: (v: number | null) => void;
  onTipLumpSumChange: (v: number | null) => void;
}

function daysBetween(start: string, end: string): number {
  try {
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    const diff = Math.round((e.getTime() - s.getTime()) / 86_400_000);
    return Math.max(0, diff + 1);
  } catch {
    return 0;
  }
}

const fmt = (n: number) => n.toLocaleString("vi-VN");

export default function TipSection({
  soKhach, soKhachTl, ngayDi, ngayVe,
  thuTip, tipRate, tipSoNgayOverride, tipSoKhachOverride, tipLumpSum,
  onThuTipChange, onTipRateChange, onTipSoNgayOverrideChange, onTipSoKhachOverrideChange, onTipLumpSumChange,
}: Props) {
  // Auto-suggest values
  const autoRate = soKhachTl > 0 ? 150 : 300;
  const autoSoNgay = ngayDi && ngayVe ? daysBetween(ngayDi, ngayVe) : 0;
  // T/L không đóng tip → mặc định trừ ra
  const autoSoKhach = Math.max(0, soKhach - soKhachTl);

  // Effective values used for compute
  const effectiveRate = tipRate ?? autoRate;
  const effectiveSoNgay = tipSoNgayOverride ?? autoSoNgay;
  const effectiveSoKhach = tipSoKhachOverride ?? autoSoKhach;
  const autoTotal = effectiveSoKhach * effectiveSoNgay * effectiveRate;
  const displayTotal = tipLumpSum ?? autoTotal;
  const isOverridden = tipLumpSum != null;

  // Local input states (for typing fluidity)
  const [localRate, setLocalRate] = useState(tipRate != null ? String(tipRate) : "");
  const [localSoNgay, setLocalSoNgay] = useState(tipSoNgayOverride != null ? String(tipSoNgayOverride) : "");
  const [localSoKhach, setLocalSoKhach] = useState(tipSoKhachOverride != null ? String(tipSoKhachOverride) : "");
  const [localLumpSum, setLocalLumpSum] = useState(tipLumpSum != null ? formatThousands(tipLumpSum) : "");

  // Sync local when props change (from DB load)
  useEffect(() => { setLocalRate(tipRate != null ? String(tipRate) : ""); }, [tipRate]);
  useEffect(() => { setLocalSoNgay(tipSoNgayOverride != null ? String(tipSoNgayOverride) : ""); }, [tipSoNgayOverride]);
  useEffect(() => { setLocalSoKhach(tipSoKhachOverride != null ? String(tipSoKhachOverride) : ""); }, [tipSoKhachOverride]);
  useEffect(() => { setLocalLumpSum(tipLumpSum != null ? formatThousands(tipLumpSum) : ""); }, [tipLumpSum]);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox checked={thuTip} onCheckedChange={(v) => onThuTipChange(!!v)} />
          <span className="text-sm font-medium">Thu tiền tip</span>
        </label>

        {thuTip && (
          <>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Đơn giá:</span>
              <Input
                type="text"
                inputMode="numeric"
                value={localRate}
                onChange={(e) => setLocalRate(e.target.value.replace(/\D/g, ""))}
                onBlur={() => {
                  const v = localRate ? Number(localRate) : null;
                  if (v !== tipRate) onTipRateChange(v);
                }}
                placeholder={String(autoRate)}
                className="h-7 w-16 text-xs text-center"
              />
              <span className="text-muted-foreground">NT/khách/ngày</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Số khách:</span>
              <Input
                type="text"
                inputMode="numeric"
                value={localSoKhach}
                onChange={(e) => setLocalSoKhach(e.target.value.replace(/\D/g, ""))}
                onBlur={() => {
                  const v = localSoKhach ? Number(localSoKhach) : null;
                  if (v !== tipSoKhachOverride) onTipSoKhachOverrideChange(v);
                }}
                placeholder={String(autoSoKhach)}
                className="h-7 w-14 text-xs text-center"
                title={`Mặc định = số khách − T/L (${soKhach} − ${soKhachTl} = ${autoSoKhach}). T/L không đóng tip.`}
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Số ngày:</span>
              <Input
                type="text"
                inputMode="numeric"
                value={localSoNgay}
                onChange={(e) => setLocalSoNgay(e.target.value.replace(/\D/g, ""))}
                onBlur={() => {
                  const v = localSoNgay ? Number(localSoNgay) : null;
                  if (v !== tipSoNgayOverride) onTipSoNgayOverrideChange(v);
                }}
                placeholder={String(autoSoNgay)}
                className="h-7 w-14 text-xs text-center"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs ml-auto">
              <span className="text-muted-foreground">
                {effectiveSoKhach} khách × {effectiveSoNgay} ngày × {fmt(effectiveRate)} = Tổng:
              </span>
              <Input
                type="text"
                inputMode="numeric"
                value={localLumpSum || (isOverridden ? "" : fmt(autoTotal))}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  setLocalLumpSum(digits ? Number(digits).toLocaleString("vi-VN") : "");
                }}
                onBlur={() => {
                  const v = parseThousands(localLumpSum);
                  // Khi user gõ tay → override. Nếu trống & đang override → revert auto.
                  if (localLumpSum.trim() === "") {
                    if (isOverridden) onTipLumpSumChange(null);
                  } else if (v !== tipLumpSum) {
                    onTipLumpSumChange(v);
                  }
                }}
                className={cn(
                  "h-7 w-28 text-xs text-right font-semibold",
                  isOverridden && "text-amber-700 border-amber-300",
                )}
                title={isOverridden ? "Lump sum override — không sync với số khách" : "Tự tính"}
              />
              <span className="text-muted-foreground">NT</span>
              {isOverridden && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => onTipLumpSumChange(null)}
                  title="Reset về auto-compute"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
