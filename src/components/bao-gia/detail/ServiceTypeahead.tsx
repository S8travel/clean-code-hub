import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { BangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";

// Map loai BaoGiaItem → loai bang_gia_dich_vu để filter dropdown.
// transport luôn nằm trong "Thông tin tour" (VehicleSelector cho cả tour);
// day-level transport ở đây là phụ trợ (transfer/grab) → filter bằng "xe".
const LOAI_MAP: Record<"hotel" | "meal" | "transport" | "ticket", BangGiaDichVu["loai"]> = {
  hotel: "hotel",
  meal: "nha_hang",
  transport: "xe",
  ticket: "dich_vu",
};

interface Props {
  value: string;                                            // mo_ta hiện tại (free-text)
  onChangeText: (text: string) => void;                     // user gõ tay
  onPick: (ten: string, gia: number, foc: number) => void;  // chọn entry catalog (fill mo_ta + don_gia + foc snapshot)
  onCommit: () => void;                                     // blur → save DB
  loai: "hotel" | "meal" | "transport" | "ticket";
  items: BangGiaDichVu[];                                   // toàn bộ catalog (caller cache 1 lần)
  placeholder?: string;
  className?: string;
}

// Input typeahead: gõ tự do (free-text) + popover gợi ý từ catalog theo loai.
// Chọn gợi ý → fill tên + giá (snapshot lúc gửi sẽ làm phase sau).
// Không khớp → user vẫn lưu được text + giá tự nhập (NCC mới chưa import).
export function ServiceTypeahead({
  value, onChangeText, onPick, onCommit, loai, items, placeholder, className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const targetLoai = LOAI_MAP[loai];

  const suggestions = useMemo(() => {
    const q = value.toLowerCase().trim();
    const pool = items.filter((x) => x.loai === targetLoai);
    if (!q) return pool.slice(0, 30);
    return pool.filter((x) => x.ten.toLowerCase().includes(q)).slice(0, 30);
  }, [items, targetLoai, value]);

  useEffect(() => { setActiveIdx(0); }, [value, open]);

  const pick = (s: BangGiaDichVu) => {
    onPick(s.ten, s.gia ?? 0, s.foc ?? 0);
    setOpen(false);
    // KHÔNG blur input ở đây. onPick đã save. Nếu blur lúc này, onBlur sẽ
    // schedule onCommit với closure CŨ (chưa re-render sau setDraft) →
    // 150ms sau ghi đè đúng items vừa pick. Giữ focus input để user có thể
    // gõ tinh chỉnh tên — click ra ngoài sẽ blur tự nhiên (closure đã fresh).
  };

  return (
    <Popover open={open && suggestions.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative", className)}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => {
              // Delay để cho phép click suggestion fire trước blur
              setTimeout(() => { setOpen(false); onCommit(); }, 150);
            }}
            onKeyDown={(e) => {
              if (!open || suggestions.length === 0) {
                if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(suggestions[activeIdx]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder={placeholder ?? "Tìm hoặc gõ tên dịch vụ..."}
            className="h-9 text-xs pl-7"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] p-0 max-h-[260px] overflow-y-auto"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {suggestions.map((s, i) => (
          <button
            key={s.id}
            type="button"
            // mousedown thay vì click để fire TRƯỚC onBlur của input
            onMouseDown={(e) => { e.preventDefault(); pick(s); }}
            onMouseEnter={() => setActiveIdx(i)}
            className={cn(
              "w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs text-left",
              i === activeIdx ? "bg-slate-100" : "hover:bg-slate-50",
            )}
          >
            <span className="truncate flex-1">{s.ten}</span>
            {s.gia != null && (
              <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                {s.gia.toLocaleString("vi-VN")} ₫
              </span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
