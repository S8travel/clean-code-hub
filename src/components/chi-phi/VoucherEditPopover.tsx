import { useState } from "react";
import { Ticket, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calcVoucherEditDelta } from "@/lib/voucher";
import { fmt } from "./nh-section-shared";

interface Props {
  /** Số vé voucher hiện tại của dòng (redemption.soVe). */
  veCu: number;
  /** Số khách tính tiền của dòng (sau FOC) — trần vé. */
  soKhachThucTe: number;
  donGia: number;
  ckPct: number | null;
  loai: "mua" | "tang";
  voucherTen: string;
  /** Tồn kho còn lại của voucher (để kẹp khi tăng). */
  tonKhoConLai: number;
  /** Đoàn đã quyết toán → khóa hẳn. */
  disabled?: boolean;
  submitting?: boolean;
  /** veMoi = 0 → caller gỡ voucher; ngược lại sửa tại chỗ. */
  onSubmit: (veMoi: number) => void;
}

// Popover "Sửa số vé voucher" — neo vào icon 🎟 trên dòng đã phủ voucher.
// Thay cho nút "Gỡ voucher" cũ (vốn hoàn trả toàn bộ). Cho tăng/giảm tại chỗ;
// đặt về 0 vẫn gỡ hẳn.
export default function VoucherEditPopover({
  veCu, soKhachThucTe, donGia, ckPct, loai, voucherTen, tonKhoConLai,
  disabled = false, submitting = false, onSubmit,
}: Props) {
  const [open, setOpen] = useState(false);
  const [veMoi, setVeMoi] = useState(veCu);

  const maxVe = Math.max(0, Math.min(soKhachThucTe, veCu + Math.max(0, tonKhoConLai)));
  const d = calcVoucherEditDelta({ veCu, veMoi, soKhachThucTe, donGia, ckPct, loai, tonKhoConLai });
  const willRemove = d.veClamped <= 0;
  const noChange = d.route === "noop";

  const handleOpenChange = (v: boolean) => {
    if (v) setVeMoi(veCu); // mỗi lần mở reset về vé hiện tại
    setOpen(v);
  };
  const clampSet = (v: number) =>
    setVeMoi(Math.max(0, Math.min(Math.round(v) || 0, maxVe)));

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost" size="sm"
          className="h-6 w-6 p-0 text-purple-600 hover:text-purple-700"
          title="Sửa số vé voucher"
          disabled={disabled}
        >
          <Ticket className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Ticket className="h-3.5 w-3.5 text-purple-600 shrink-0" />
          <span className="truncate">{voucherTen || "Voucher"}</span>
          <span className={cn(
            "ml-auto shrink-0 px-1 py-px rounded text-[10px] font-medium",
            loai === "tang" ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700",
          )}>
            {loai === "tang" ? "Tặng" : "Mua"}
          </span>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Vé hiện tại: <b className="text-foreground">{veCu}</b> / {soKhachThucTe} khách
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7 shrink-0"
            disabled={disabled || veMoi <= 0}
            onClick={() => clampSet(veMoi - 1)}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input
            type="number"
            value={veMoi}
            min={0}
            max={maxVe}
            disabled={disabled}
            onChange={(e) => clampSet(Number(e.target.value))}
            className="h-7 w-16 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <Button variant="outline" size="icon" className="h-7 w-7 shrink-0"
            disabled={disabled || veMoi >= maxVe}
            onClick={() => clampSet(veMoi + 1)}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground text-center">Tối đa {maxVe} vé (theo số khách + tồn kho)</div>

        {/* Preview tiền */}
        {!noChange && !willRemove && (
          <div className="rounded bg-muted/50 px-2 py-1.5 text-[11px] space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vé</span>
              <span className="tabular-nums">{veCu} → <b>{d.veClamped}</b></span>
            </div>
            {loai === "mua" ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trả bằng voucher</span>
                <span className="tabular-nums">{fmt(d.coverCu)} → <b>{fmt(d.coverMoi)}</b></span>
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Công ty trả</span>
                <span className="tabular-nums">{fmt(d.tienCongTyCu)} → <b>{fmt(d.tienCongTyMoi)}</b></span>
              </div>
            )}
            {d.clamped && <div className="text-amber-600">⚠ Đã kẹp theo tồn kho / số khách</div>}
          </div>
        )}
        {willRemove && (
          <div className="text-[11px] text-destructive">Đặt 0 vé → sẽ gỡ hẳn voucher khỏi dòng này.</div>
        )}

        <Button
          size="sm"
          className={cn("h-7 w-full text-xs", willRemove && "bg-destructive hover:bg-destructive/90")}
          disabled={disabled || submitting || noChange}
          onClick={() => { onSubmit(veMoi); setOpen(false); }}
        >
          {willRemove ? "Gỡ voucher" : "Lưu"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
