import { RefreshCw, AlertTriangle, ChevronRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BaoGiaRow } from "@/hooks/use-bao-gia";
import { costBreakdown, fmtVnd } from "./helpers";

interface Props {
  row: BaoGiaRow;
}

export function TongHopChiPhiPanel({ row }: Props) {
  const c = costBreakdown(row);

  return (
    <aside className="space-y-3 sticky top-4 self-start">
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500">
            Tổng hợp chi phí
          </h2>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <h3 className="text-xs font-semibold text-slate-700 mb-2">1. CHI PHÍ VỐN</h3>
        <ul className="space-y-1.5 text-xs">
          <CostLine label="Khách sạn" value={c?.khach_san} />
          <CostLine label="Ăn uống"    value={c?.an_uong} />
          <CostLine label="Xe vận chuyển" value={c?.xe} />
          <CostLine label="Vé tham quan" value={c?.ve_tham_quan} />
          <CostLine label="Hướng dẫn viên" value={c?.hdv} />
          <CostLine label="Khác" value={c?.khac} />
        </ul>
        <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">Tổng chi phí vốn</span>
          <span className="font-semibold text-blue-700 tabular-nums">{fmtVnd(c?.tong_von)}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-slate-700 mb-2">2. MARKUP & LỢI NHUẬN</h3>
        <ul className="space-y-1.5 text-xs">
          <CostLine
            label={`Profit target (${c?.profit_target_usd ?? 0} USD/pax)`}
            value={c?.profit_vnd}
          />
          <CostLine label="Phụ thu" value={c?.phu_thu} />
        </ul>
        <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-700">Tổng lợi nhuận</span>
          <span className="font-semibold text-emerald-700 tabular-nums">{fmtVnd(c?.profit_vnd)}</span>
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
          Giá bán tour
        </div>
        <div className="text-2xl font-bold text-blue-700 tabular-nums">
          {fmtVnd(c?.gia_ban)} <span className="text-sm font-medium">VND</span>
        </div>
        <div className="text-xs text-slate-600 mt-0.5">
          ≈ {fmtVnd(c?.gia_ban_per_pax)} VND / pax
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Biên lợi nhuận</div>
            <div className="text-xl font-bold text-emerald-600 tabular-nums">
              {(c?.bien_loi_nhuan_pct ?? 0).toFixed(2)} %
            </div>
          </div>
          <TrendingUp className="h-8 w-8 text-emerald-500" />
        </div>
      </div>

      <button
        type="button"
        className="w-full bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 text-left hover:bg-amber-100/60"
      >
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-amber-800">Kiểm tra</div>
          <div className="text-[11px] text-amber-700 truncate">
            Dữ liệu chưa phân theo ngày
          </div>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      </button>
    </aside>
  );
}

function CostLine({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-800 font-medium tabular-nums">{fmtVnd(value)}</span>
    </li>
  );
}
