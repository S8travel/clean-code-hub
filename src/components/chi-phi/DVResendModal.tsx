import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { DNTTRow } from "@/hooks/use-chi-phi";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  target: DNTTRow | null;
  mode: "full" | "partial";
  onModeChange: (v: "full" | "partial") => void;
  amount: number;
  onAmountChange: (v: number) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}

// Modal "Gửi lại ĐNTT" cho ĐNTT bị từ chối (tách từ ChiPhiDVSection).
export default function DVResendModal({
  target, mode, onModeChange, amount, onAmountChange, onClose, onSubmit, submitting,
}: Props) {
  return (
    <Dialog open={!!target} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader><DialogTitle className="text-sm">Gửi lại ĐNTT</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Số tiền gốc: {fmt(target?.so_tien ?? 0)} VND</p>
          <RadioGroup value={mode} onValueChange={v => onModeChange(v as "full" | "partial")} className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="full" id="dv-resend-full" />
              <Label htmlFor="dv-resend-full" className="text-xs">Toàn bộ</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="partial" id="dv-resend-partial" />
              <Label htmlFor="dv-resend-partial" className="text-xs">1 phần</Label>
            </div>
          </RadioGroup>
          {mode === "partial" && (
            <Input type="number" value={amount || ""}
              onChange={e => onAmountChange(Number(e.target.value) || 0)}
              placeholder="Nhập số tiền" className="h-8 text-xs" />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
          <Button size="sm" onClick={onSubmit} disabled={submitting}>Gửi lại</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
