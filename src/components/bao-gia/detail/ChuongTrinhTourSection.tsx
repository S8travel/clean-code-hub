import { useState } from "react";
import { Copy, MoreHorizontal, Plus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { DayPanel } from "./DayPanel";

interface Props {
  draft: BaoGiaRow;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
}

// 2-col layout: vertical day tabs (trái) + day accordions (phải).
// Items được lưu trong ket_qua.items[] với items[].ngay_so. DayPanel filter
// items theo dayIdx + render editable rows.
export function ChuongTrinhTourSection({ draft, updateDraftKetQua, saveKetQua }: Props) {
  const ket = draft.ket_qua;
  const [expandedDay, setExpandedDay] = useState(1);
  if (!ket) return null;
  const soNgay = Math.max(1, ket.so_ngay ?? 1);

  // Day i có bao nhiêu item (cho badge counter ở tab).
  const countByDay: Record<number, number> = {};
  (ket.items || []).forEach((it) => {
    const d = it.ngay_so ?? 1;
    countByDay[d] = (countByDay[d] || 0) + 1;
  });

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500">
          Chương trình tour
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => toast.info("Sao chép ngày: tính năng đang phát triển")}
          >
            <Copy className="h-3 w-3" />
            Sao chép ngày
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[180px_1fr] gap-3">
        {/* Day tabs (vertical) */}
        <div className="space-y-1.5">
          {Array.from({ length: soNgay }, (_, i) => i + 1).map((day) => {
            const active = expandedDay === day;
            const count = countByDay[day] || 0;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setExpandedDay(day)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-md border text-left transition-colors",
                  active
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700",
                )}
              >
                <div className="flex flex-col items-start min-w-0">
                  <span className={cn("text-[11px] font-semibold", active ? "text-blue-700" : "text-slate-500")}>
                    DAY {day}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate w-full">
                    {count} dịch vụ
                  </span>
                </div>
                <GripVertical className={cn("h-3.5 w-3.5 shrink-0", active ? "text-blue-400" : "text-slate-300")} />
              </button>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 text-xs gap-1 border-dashed text-slate-600 hover:bg-slate-50"
            onClick={() => {
              // Tăng so_ngay +1; user có thể giảm bằng cách sửa ô Số ngày ở section trên.
              saveKetQua({ ...ket, so_ngay: soNgay + 1 });
              setExpandedDay(soNgay + 1);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm ngày
          </Button>
        </div>

        {/* Day panels */}
        <div className="space-y-2">
          {Array.from({ length: soNgay }, (_, i) => i + 1).map((day) => (
            <DayPanel
              key={day}
              dayIdx={day}
              cityLabel={day === 1 ? `${ket.ten_chuong_trinh || "—"}`.split("–")[0]?.trim() : "—"}
              ket={ket}
              isExpanded={expandedDay === day}
              onToggle={() => setExpandedDay(day === expandedDay ? 0 : day)}
              updateDraftKetQua={updateDraftKetQua}
              saveKetQua={saveKetQua}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
