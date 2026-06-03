import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";

// Ô nhập số nhỏ inline cho bảng chi phí nhà hàng. Tách verbatim từ ChiPhiNHSection.
export function NHInput({
  value, onChange, onBlur, width = "w-[72px]", money = false, decimal = false, disabled = false,
}: {
  value: number;
  onChange: (v: number) => void;
  onBlur: () => void;
  width?: string;
  /** Hiển thị dấu chấm phân cách hàng nghìn cho dễ đọc (vd 850.000). */
  money?: boolean;
  /** Cho phép số thập phân (đơn giá). Focus → raw "1500.5"; blur → "1.500,5". */
  decimal?: boolean;
  /** Đoàn đã quyết toán → khóa (trừ admin). */
  disabled?: boolean;
}) {
  // Hook phải gọi vô điều kiện TRƯỚC mọi return sớm (Rules of Hooks).
  const formatVN = (n: number) => (n ? n.toLocaleString("vi-VN") : "");
  const [local, setLocal] = useState(money ? formatVN(value) : String(value));
  useEffect(() => { setLocal(money ? formatVN(value) : String(value)); }, [value, money]);

  if (decimal) {
    return (
      <DecimalInput
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        className={`h-7 text-xs ${width} text-right`}
      />
    );
  }
  return (
    <Input
      type={money ? "text" : "number"}
      inputMode="numeric"
      value={local}
      disabled={disabled}
      onChange={(e) => {
        if (money) {
          const digits = e.target.value.replace(/\D/g, "");
          setLocal(digits ? Number(digits).toLocaleString("vi-VN") : "");
        } else {
          setLocal(e.target.value);
        }
      }}
      onBlur={() => {
        const v = money ? Number(local.replace(/\D/g, "")) || 0 : Number(local) || 0;
        onChange(v);
        setTimeout(onBlur, 0);
      }}
      className={`h-7 text-xs ${width} ${money ? "text-right" : "text-center"} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
    />
  );
}
