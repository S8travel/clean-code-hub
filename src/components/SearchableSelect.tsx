import { useState, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { chuanHoaTim } from "@/lib/bao-gia-loc";
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
  /** Khoá chọn (vd chỉ 1 lựa chọn hợp lệ) — trigger không bấm được */
  disabled?: boolean;
  /** Cho dùng chữ đang gõ làm một mục tự do (vd dòng ghi chú ở cột Chương trình của Điều
   *  tour). Có chữ trong ô tìm → cuối danh sách thêm một dòng. Không khớp mục nào thì nó là
   *  dòng duy nhất nên Enter chọn luôn nó; còn khớp thì Enter vẫn chọn mục khớp đầu tiên. */
  taoTuChu?: {
    nhan: string;
    /** Dòng phụ nhỏ bên dưới, vd "Không tính chi phí". */
    ghiChu?: string;
    onTao: (chu: string) => void;
  };
}

/** Lọc không phân biệt dấu / hoa thường / ký tự toàn chiều rộng, theo từng từ: gõ
 *  "cho dem" hay "phu quoc cho" đều ra "Chợ đêm Phú Quốc". Trước đây so nguyên chuỗi có
 *  dấu — gõ thiếu dấu là "Không tìm thấy" dù mục nằm ngay trong danh sách. */
function locTheoTuKhoa<T>(ds: T[], nhanDaChuan: string[], search: string): T[] {
  const tuKhoa = chuanHoaTim(search).split(" ").filter(Boolean);
  if (tuKhoa.length === 0) return ds;
  return ds.filter((_, i) => tuKhoa.every((tk) => nhanDaChuan[i].includes(tk)));
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
  disabled = false,
  taoTuChu,
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

  const nhanDaChuan = useMemo(() => options.map((o) => chuanHoaTim(o.label)), [options]);
  const filtered = locTheoTuKhoa(options, nhanDaChuan, search);
  const chuGo = search.trim();

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
          disabled={disabled}
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
            {taoTuChu && chuGo && (
              <CommandGroup>
                {filtered.length === 0 && (
                  <p className="px-2 pb-1 text-xs text-muted-foreground">{emptyText}</p>
                )}
                <CommandItem
                  value="__tao_tu_chu__"
                  className="items-start"
                  onSelect={() => {
                    taoTuChu.onTao(chuGo);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <PenLine className="mr-2 mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="min-w-0 break-words">
                    <div>
                      {taoTuChu.nhan}: <span className="font-medium">“{chuGo}”</span>
                    </div>
                    {taoTuChu.ghiChu && (
                      <div className="text-[11px] text-muted-foreground">{taoTuChu.ghiChu}</div>
                    )}
                  </div>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
