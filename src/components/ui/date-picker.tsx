import { useState, type ReactNode } from "react";
import { format, parse, isValid } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import type { Matcher } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  value: string;           // YYYY-MM-DD
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  align?: "start" | "center" | "end";
  /** Optional controlled open state — pass both to make it external-controlled. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom DayPicker modifiers (e.g. to highlight related dates). */
  modifiers?: Record<string, Matcher | Matcher[]>;
  modifiersClassNames?: Record<string, string>;
  /** Month to focus when no value (YYYY-MM-DD). */
  defaultMonth?: string;
  /** Content rendered under the calendar (e.g. legend for highlighted days). */
  footer?: ReactNode;
}

function parseISODate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Chọn ngày",
  className,
  align = "start",
  open: openProp,
  onOpenChange,
  modifiers,
  modifiersClassNames,
  defaultMonth,
  footer,
}: DatePickerProps) {
  const [openInternal, setOpenInternal] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInternal;
  const setOpen = (v: boolean) => {
    if (!isControlled) setOpenInternal(v);
    onOpenChange?.(v);
  };

  const validDate = parseISODate(value);
  const fallbackMonth = parseISODate(defaultMonth);

  const handleSelect = (d: Date | undefined) => {
    onChange(d ? format(d, "yyyy-MM-dd") : "");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal",
            !validDate && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {validDate
            ? format(validDate, "dd/MM/yyyy", { locale: vi })
            : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="single"
          selected={validDate}
          onSelect={handleSelect}
          defaultMonth={validDate ?? fallbackMonth}
          locale={vi}
          initialFocus
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
        />
        {footer && (
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {footer}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
