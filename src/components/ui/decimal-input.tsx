import { useState, useEffect } from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  onChange: (v: number) => void;
  onBlur?: () => void;
  /** placeholder display */
  placeholder?: string;
  /** Khi focused: hiển thị raw decimal "1500.5" để gõ thoải mái.
   *  Khi blurred: hiển thị "1.500,5" (vi-VN format). */
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Decimal number input — chấp nhận "." hoặc "," làm decimal separator.
 * - Khi focus: raw decimal ("1500.5") cho phép user gõ thoải mái.
 * - Khi blur: format vi-VN ("1.500,5") cho dễ đọc.
 * - Internal storage: number (JS Number). Caller nhận `onChange(number)` only on blur.
 */
export function DecimalInput({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  disabled,
  ariaLabel,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [local, setLocal] = useState(value ? String(value) : "");

  // Sync local từ value prop khi không focus (để external updates reflect)
  useEffect(() => {
    if (!focused) setLocal(value ? String(value) : "");
  }, [value, focused]);

  const fmtVN = (n: number) =>
    n ? n.toLocaleString("vi-VN", { maximumFractionDigits: 10 }) : "";
  const display = focused ? local : fmtVN(value);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={() => {
        setFocused(true);
        setLocal(value ? String(value) : "");
      }}
      onChange={(e) => {
        // Replace "," → "." (cả 2 đều coi là decimal sep), strip non-digit non-dot,
        // giữ chỉ 1 dấu chấm đầu tiên (dấu sau sẽ bị xoá)
        let s = e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "");
        const firstDot = s.indexOf(".");
        if (firstDot >= 0) {
          s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
        }
        setLocal(s);
      }}
      onBlur={() => {
        const trimmed = local.replace(/\.$/, "");
        const v = trimmed ? Number(trimmed) : 0;
        setFocused(false);
        if (v !== value) onChange(v);
        if (onBlur) setTimeout(onBlur, 0);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLElement).blur();
      }}
      className={cn(className)}
    />
  );
}
