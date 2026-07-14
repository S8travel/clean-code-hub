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

export interface NHCancelTarget {
  dnttId: number;
  isPaid: boolean;
  nhName: string;
  /** Dòng chi phí chưa gắn NCC → mode 'cong_no' cần OP chọn NCC để công nợ cấn trừ được. */
  missingNcc?: boolean;
  /** NCC gợi ý (từ master nhà hàng) — điền sẵn để OP chỉ cần xác nhận, không phải tự tìm. */
  suggestedNccId?: number | null;
}

interface Props {
  target: NHCancelTarget | null;
  mode: "cong_no" | "hoan_tien";
  onModeChange: (v: "cong_no" | "hoan_tien") => void;
  submitting: boolean;
  onClose: () => void;
  /** NCC = NCC OP chọn khi dịch vụ chưa gắn (chỉ dùng cho mode 'cong_no' + missingNcc). */
  onSubmit: (ncc: { id: number; ten: string } | null) => void;
}

// Modal hủy ĐNTT / khoản thanh toán bữa ăn. Tách verbatim từ ChiPhiNHSection.
export default function NHCancelModal({
  target, mode, onModeChange, submitting, onClose, onSubmit,
}: Props) {
  useTranslate();
  const { data: nccList = [] } = useNhaCungCapList();
  const [nccId, setNccId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Mở cho target mới → điền sẵn NCC gợi ý (từ master nhà hàng). OP chỉ cần xác
  // nhận thay vì tự dò trong danh sách; vẫn đổi được nếu gợi ý sai.
  useEffect(() => {
    setNccId(target?.suggestedNccId ?? null);
    setPickerOpen(false);
  }, [target?.dnttId, target?.suggestedNccId]);

  // Chỉ hỏi NCC khi: đã thanh toán + chọn "Cấn trừ công nợ" + dịch vụ chưa gắn NCC.
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
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {target?.isPaid ? t("Hủy khoản thanh toán") : t("Hủy đề nghị thanh toán")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-xs text-muted-foreground">{target?.nhName}</p>
          {target?.isPaid ? (
            <RadioGroup
              value={mode}
              onValueChange={(v) => onModeChange(v as "cong_no" | "hoan_tien")}
              className="space-y-2"
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="hoan_tien" id="nh-hoan" className="mt-0.5" />
                <Label htmlFor="nh-hoan" className="text-xs cursor-pointer">
                  <span className="font-medium">{t("Hoàn lại tiền")}</span>
                  <p className="text-muted-foreground font-normal">{t("Không ghi nhận công nợ")}</p>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="cong_no" id="nh-cno" className="mt-0.5" />
                <Label htmlFor="nh-cno" className="text-xs cursor-pointer">
                  <span className="font-medium">{t("Cấn trừ công nợ")}</span>
                  <p className="text-muted-foreground font-normal">{t("Ghi nhận công nợ cho nhà cung cấp")}</p>
                </Label>
              </div>
            </RadioGroup>
          ) : (
            <p className="text-xs">{t("Đề nghị sẽ bị hủy, chi phí trở về trạng thái chưa gửi duyệt.")}</p>
          )}

          {/* Dịch vụ phát sinh chưa gắn NCC → bắt chọn NCC để công nợ cấn trừ được. */}
          {needNcc && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t("Nhà cung cấp")} <span className="text-destructive">*</span>
              </Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-8 text-xs font-normal"
                  >
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
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>
            {t("Đóng")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="text-xs"
            onClick={handleSubmit}
            disabled={blockSubmit}
          >
            {t("Xác nhận hủy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
