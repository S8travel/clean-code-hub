import { Star } from "lucide-react";

interface StarRatingProps {
  label: string;
  value: number; // 0 = chưa chấm
  onChange: (v: number) => void;
  disabled?: boolean;
}

// 1 hàng: nhãn tiêu chí + 5 ngôi sao tap-to-select.
// Bấm sao đang chọn để bỏ chấm (về 0).
export function StarRating({ label, value, onChange, disabled }: StarRatingProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-700 flex-1 leading-snug">{label}</span>
      <div className="flex gap-0.5 sm:gap-1 shrink-0">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= value;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-label={`${label}: ${n}/5`}
              aria-pressed={value === n}
              onClick={() => onChange(value === n ? 0 : n)}
              className="p-0.5 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            >
              <Star
                className={
                  "w-6 h-6 sm:w-7 sm:h-7 transition-colors " +
                  (active
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-slate-300")
                }
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
