import { useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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

export interface SelectOption {
  value: string;
  label: string;
  /** Class tuỳ chỉnh cho dòng option (vd nền đỏ cho "Đã hủy xe"). Cũng phản chiếu lên nút trigger khi đang chọn. */
  className?: string;
}

interface Props {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** Mở popover ngay khi mount (Google Sheets-like flow: Enter → row mới → tiếp tục gõ) */
  autoOpen?: boolean;
  /** Gọi khi popover đóng (kể cả đóng mà không chọn) — để parent thoát chế độ chọn */
  onClose?: () => void;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Chọn...",
  searchPlaceholder = "Gõ để tìm...",
  emptyText = "Không tìm thấy",
  className,
  autoOpen = false,
  onClose,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Khi parent set autoOpen=true (vd: row vừa được thêm sau Enter chọn dòng cuối) → mở popover.
  // Effect explicit để robust với StrictMode double-mount + React 18 concurrent rendering.
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const selectedOption = options.find((o) => o.value === value);
  const selectedLabel = selectedOption?.label;

  const filtered = search
    ? options.filter((o) => o.label?.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) { setSearch(""); onClose?.(); }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between rounded-lg font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className={cn("truncate text-left rounded px-1 -mx-1", selectedOption?.className)}>{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false} className="h-auto">
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  className={option.className}
                  onSelect={() => {
                    onChange(option.value === value ? "" : option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
