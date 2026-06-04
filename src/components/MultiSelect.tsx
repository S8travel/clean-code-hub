import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface Props {
  options: MultiSelectOption[];
  /** Các value đang chọn. Rỗng = "tất cả" (không lọc). */
  value: string[];
  onChange: (value: string[]) => void;
  /** Nhãn nút khi chưa chọn gì (vd "Tất cả Agent"). */
  allLabel: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}

/**
 * Multi-select dạng TÍCH (checkbox) — Popover + Command có tìm kiếm.
 * Chọn nhiều: popover KHÔNG đóng khi tích. Rỗng = không lọc (hiện allLabel).
 * Anh em với SearchableSelect (chọn 1).
 */
export function MultiSelect({
  options,
  value,
  onChange,
  allLabel,
  searchPlaceholder = "Gõ để tìm...",
  emptyText = "Không tìm thấy",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = new Set(value);
  const filtered = search
    ? options.filter((o) => o.label?.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (v: string) =>
    onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  // Nhãn nút: rỗng → allLabel; 1 → tên mục; ≥2 → "allLabel · N".
  const triggerText =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? allLabel
        : `${allLabel} · ${value.length}`;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "justify-between rounded-lg font-normal",
            value.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate text-left">{triggerText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {value.length > 0 && (
              <CommandGroup>
                <CommandItem value="__clear__" onSelect={() => onChange([])}>
                  <span className="text-muted-foreground">Bỏ chọn tất cả ({value.length})</span>
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => toggle(option.value)}
                >
                  <Checkbox
                    checked={selected.has(option.value)}
                    className="mr-2 h-4 w-4 pointer-events-none"
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
