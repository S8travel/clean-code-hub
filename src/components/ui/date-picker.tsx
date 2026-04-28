import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
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
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Chọn ngày",
  className,
  align = "start",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const date = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const validDate = date && isValid(date) ? date : undefined;

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
          defaultMonth={validDate}
          locale={vi}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
