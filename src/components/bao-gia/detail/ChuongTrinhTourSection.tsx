import { useState } from "react";
import { Copy, MoreHorizontal, Plus, GripVertical, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BaoGiaRow } from "@/hooks/use-bao-gia";
import { groupItemsByLoai } from "./helpers";
import { DayPanel } from "./DayPanel";

interface Props {
  row: BaoGiaRow;
}

// 2-col layout: vertical day tabs (trái) + day accordions (phải).
// Click day tab → expand đúng day đó, scroll vào view.
export function ChuongTrinhTourSection({ row }: Props) {
  const ket = row.ket_qua;
  const soNgay = Math.max(1, ket?.so_ngay ?? 1);
  const [expandedDay, setExpandedDay] = useState(1);

  const grouped = groupItemsByLoai(ket?.items);
  // P1 shell — chưa có day grouping ở schema → mọi item dồn vào Day 1.
  // Day 2..N hiển thị empty (placeholder rows trong DayPanel).

  const dayLabels = Array.from({ length: soNgay }, (_, i) => `Ngày ${i + 1}`);

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500">
          Chương trình tour
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
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
          {dayLabels.map((_, i) => {
            const day = i + 1;
            const active = expandedDay === day;
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
                    {/* schema chưa có city per ngày */}
                    {day === 1 ? "Bắt đầu" : "—"}
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
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm ngày
          </Button>
        </div>

        {/* Day panels */}
        <div className="space-y-2">
          {dayLabels.map((_, i) => {
            const day = i + 1;
            return (
              <DayPanel
                key={day}
                dayIdx={day}
                cityLabel={day === 1 ? `${ket?.ten_chuong_trinh || "—"}`.split("–")[0]?.trim() : "—"}
                // Day 1 nhận hết items (chưa có schema split-by-day).
                // Day khác = empty.
                hotelItems={day === 1 ? grouped.hotel : []}
                mealItems={day === 1 ? grouped.meal : []}
                ticketItems={day === 1 ? grouped.ticket : []}
                transportItems={day === 1 ? grouped.transport : []}
                isExpanded={expandedDay === day}
                onToggle={() => setExpandedDay(day === expandedDay ? 0 : day)}
              />
            );
          })}
          {/* P1 note: data chưa phân theo ngày */}
          {soNgay > 1 && (
            <p className="text-[11px] text-slate-400 italic px-1 inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              Dữ liệu chưa phân theo ngày — hiện gom về Day 1. P2 sẽ thêm `items[].ngay_so`.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
