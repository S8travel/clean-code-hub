import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { t, useTranslate } from "@/lib/i18n";

export interface CancelTarget {
  dnttId: number;
  isPaid: boolean;
  /** Dòng chi phí chưa gắn NCC → mode 'cong_no' cần OP chọn NCC để công nợ cấn trừ được. */
  missingNcc?: boolean;
  /** NCC gợi ý điền sẵn. DV thường không có master → null, OP tự chọn. */
  suggestedNccId?: number | null;
}

interface Props {
  target: CancelTarget | null;
  mode: "cong_no" | "hoan_tien";
  onModeChange: (v: "cong_no" | "hoan_tien") => void;
  onClose: () => void;
  /** NCC = NCC OP chọn khi dịch vụ chưa gắn (chỉ dùng cho mode 'cong_no' + missingNcc). */
  onSubmit: (ncc: { id: number; ten: string } | null) => void;
  submitting: boolean;
}

// Modal "Hủy đề nghị thanh toán" dùng chung cho DV + Xe (ref_loai='doan_chi_phi').
// Cùng pattern NHCancelModal: dòng chi phí chưa gắn NCC + chọn "Ghi công nợ" → bắt chọn
// NCC, nếu không guard hủy chặn (resolveNccForCancel đọc doan_chi_phi.nha_cung_cap_id)
// mà OP không có ô để chọn.
export default function ChiPhiCancelModal({
  target, mode, onModeChange, onClose, onSubmit, submitting,
}: Props) {
  useTranslate();
  const { data: nccList = [] } = useNhaCungCapList();
  const [nccId, setNccId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setNccId(target?.suggestedNccId ?? null);
    setPickerOpen(false);
  }, [target?.dnttId, target?.suggestedNccId]);

  const needNcc = !!target?.isPaid && mode === "cong_no" && !!target?.missingNcc;
  const selectedNcc = useMemo(
    () => nccList.find((n) => n.id === nccId) ?? null,
    [nccList, nccId],
  );
  const blockSubmit = submitting || (needNcc && !selectedNcc);

  const handleSubmit = () => {
    onSubmit(needNcc && selectedNcc ? { id: selectedNcc.id, ten: selectedNcc.ten } : null);
  };

  return (
    <Dialog open={!!target} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="text-sm">{t("Hủy đề nghị thanh toán")}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          {target?.isPaid && (
            <>
              <p className="text-xs text-muted-foreground">{t("Đã thanh toán — chọn cách xử lý")}:</p>
              <RadioGroup value={mode} onValueChange={v => onModeChange(v as "cong_no" | "hoan_tien")} className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="hoan_tien" id="dv-cancel-ht" />
                  <Label htmlFor="dv-cancel-ht" className="text-xs">{t("Hoàn tiền")}</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="cong_no" id="dv-cancel-cn" />
                  <Label htmlFor="dv-cancel-cn" className="text-xs">{t("Ghi công nợ")}</Label>
                </div>
              </RadioGroup>
            </>
          )}

          {/* Dịch vụ chưa gắn NCC → bắt chọn NCC để công nợ cấn trừ/thu hồi được. */}
          {needNcc && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t("Nhà cung cấp")} <span className="text-destructive">*</span>
              </Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between h-8 text-xs font-normal">
                    <span className={cn("truncate", !selectedNcc && "text-muted-foreground")}>
                      {selectedNcc?.ten ?? t("Chọn nhà cung cấp…")}
                    </span>
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                  <Command>
                    <CommandInput placeholder={t("Tìm nhà cung cấp…")} className="text-xs" />
                    <CommandList>
                      <CommandEmpty className="py-3 text-xs text-center text-muted-foreground">
                        {t("Không tìm thấy")}
                      </CommandEmpty>
                      <CommandGroup>
                        {nccList.map((n) => (
                          <CommandItem
                            key={n.id}
                            value={n.ten}
                            onSelect={() => { setNccId(n.id); setPickerOpen(false); }}
                            className="text-xs"
                          >
                            <Check className={cn("mr-2 h-3.5 w-3.5", nccId === n.id ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">{n.ten}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-muted-foreground">
                {t("Dịch vụ này chưa gắn nhà cung cấp — chọn NCC để công nợ có thể cấn trừ/thu hồi.")}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>{t("Đóng")}</Button>
          <Button variant="destructive" size="sm" onClick={handleSubmit} disabled={blockSubmit}>{t("Xác nhận hủy")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
