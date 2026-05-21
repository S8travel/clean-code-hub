import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { cn } from "@/lib/utils";

// Ô nhập số nhỏ inline cho bảng chi phí dịch vụ (giống NHInput của tab NH).
export function DVInput({ value, onChange, onBlur, width = "w-[60px]", money = false, decimal = false }: {
  value: number;
  onChange: (v: number) => void;
  onBlur: () => void;
  width?: string;
  /** Hiển thị dấu chấm phân cách hàng nghìn (vd 850.000). */
  money?: boolean;
  /** Cho phép số thập phân (đơn giá). Focus → raw "1500.5"; blur → "1.500,5". */
  decimal?: boolean;
}) {
  if (decimal) {
    return (
      <DecimalInput
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        className={cn("h-6 text-xs px-1.5 py-0 text-right", width)}
      />
    );
  }
  if (money) {
    return (
      <Input
        type="text"
        inputMode="numeric"
        value={value != null ? value.toLocaleString("vi-VN") : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "");
          onChange(digits ? Number(digits) : 0);
        }}
        onBlur={onBlur}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
        className={cn("h-6 text-xs px-1.5 py-0 text-right", width)}
      />
    );
  }
  return (
    <Input
      type="number"
      min={0}
      value={value ?? ""}
      onChange={e => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      onBlur={onBlur}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
      className={cn("h-6 text-xs px-1.5 py-0 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none", width)}
    />
  );
}
