import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { BangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";

interface ServiceComboboxProps {
  value: string;        // tên dịch vụ đang chọn
  onSelect: (ten: string, gia: number) => void;
  onClear: () => void;
  items: BangGiaDichVu[];
  placeholder?: string;
}

export function ServiceCombobox({ value, onSelect, onClear, items, placeholder = "Tìm dịch vụ..." }: ServiceComboboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-7 min-w-[180px] max-w-[280px] justify-between text-xs font-normal px-2"
          >
            <span className="truncate">
              {value || <span className="text-muted-foreground">{placeholder}</span>}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Tìm tên dịch vụ..." className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">
                Không tìm thấy dịch vụ.
              </CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.ten}
                    onSelect={() => {
                      onSelect(item.ten, item.gia ?? 0);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <Check className={cn("mr-1.5 h-3 w-3", value === item.ten ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{item.ten}</span>
                    {item.gia && (
                      <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">
                        {item.gia.toLocaleString("vi-VN")}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value && (
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground" onClick={onClear}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
