import { RefreshCw, AlertTriangle, ChevronRight, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BaoGiaRow } from "@/hooks/use-bao-gia";
import { costBreakdown, fmtVnd } from "./helpers";
import { TY_GIA_BAO_GIA_MAC_DINH, tyGiaCuaBaoGia } from "@/lib/bao-gia-ty-gia";

interface Props {
  draft: BaoGiaRow;
}

// Panel tổng hợp chi phí: 2 phương án 16 khách + 20 khách. Giá bán tour =
// TB per-pax của 2 phương án (đúng công thức gia_trung_binh cũ, nhưng dữ
// liệu live từ items + xe_gia + phu_thu + foc hiện tại).
export function TongHopChiPhiPanel({ draft }: Props) {
  const c = costBreakdown({
    ket: draft.ket_qua,
    exchangeRate: tyGiaCuaBaoGia(draft.exchange_rate),
    profitUsd: draft.profit_usd ?? 0,
    xeGia: draft.xe_gia,
    phuThu: draft.phu_thu,
    vcbRate: draft.vcb_rate,
  });

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

        {/* Header 2 phương án */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-[10px] uppercase tracking-wider font-semibold text-slate-500 pb-1.5 border-b border-slate-100">
          <span>&nbsp;</span>
          <span className="text-right min-w-[80px]">16 khách</span>
          <span className="text-right min-w-[80px]">20 khách</span>
        </div>

        <h3 className="text-xs font-semibold text-slate-700 mt-2 mb-1">1. CHI PHÍ VỐN</h3>
        <ul className="space-y-1.5 text-xs">
          <CostRow label="Khách sạn"      v16={c?.case16.khach_san}    v20={c?.case20.khach_san} />
          <CostRow label="Ăn uống"        v16={c?.case16.an_uong}      v20={c?.case20.an_uong} />
          <CostRow label="Xe vận chuyển"  v16={c?.case16.xe}           v20={c?.case20.xe} />
          <CostRow label="Phụ thu (cầu đường, transfer...)" v16={c?.case16.phu_thu_xe} v20={c?.case20.phu_thu_xe} />
          <CostRow label="Vé tham quan"   v16={c?.case16.ve_tham_quan} v20={c?.case20.ve_tham_quan} />
          <CostRow label="Hướng dẫn viên" v16={c?.case16.hdv}          v20={c?.case20.hdv} />
          <CostRow label="Khác"           v16={c?.case16.khac}         v20={c?.case20.khac} />
        </ul>
        <div className="mt-2 pt-2 border-t border-slate-200 grid grid-cols-[1fr_auto_auto] gap-x-3 text-sm items-center">
          <span className="font-semibold text-slate-700">Tổng chi phí vốn</span>
          <span className="font-semibold text-blue-700 tabular-nums text-right min-w-[80px]">{fmtVnd(c?.case16.tong_von)}</span>
          <span className="font-semibold text-blue-700 tabular-nums text-right min-w-[80px]">{fmtVnd(c?.case20.tong_von)}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-slate-700 mb-2">2. MARKUP & LỢI NHUẬN</h3>
        <ul className="space-y-1.5 text-xs">
          <CostRow
            label={`Profit target (${c?.profit_target_usd ?? 0} USD/pax)`}
            v16={c?.case16.profit_vnd}
            v20={c?.case20.profit_vnd}
          />
          {c?.vcb_rate && (
            <CostRow
              label={`Chênh lệch tỷ giá (VCB ${Math.round(c.vcb_rate).toLocaleString("vi-VN")} vs ${Math.round(c.exchange_rate).toLocaleString("vi-VN")})`}
              v16={c.case16.chenh_lech_xr}
              v20={c.case20.chenh_lech_xr}
            />
          )}
        </ul>
        <div className="mt-2 pt-2 border-t border-slate-200 grid grid-cols-[1fr_auto_auto] gap-x-3 text-sm items-center">
          <span className="font-semibold text-slate-700">Giá bán tour</span>
          <span className="font-semibold text-emerald-700 tabular-nums text-right min-w-[80px]">{fmtVnd(c?.case16.gia_ban)}</span>
          <span className="font-semibold text-emerald-700 tabular-nums text-right min-w-[80px]">{fmtVnd(c?.case20.gia_ban)}</span>
        </div>
      </div>

      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-1">
          Giá bán tour (TB 2 phương án)
        </div>
        <div className="text-2xl font-bold text-blue-700 tabular-nums">
          {fmtVnd(c?.gia_ban_tb_per_pax)} <span className="text-sm font-medium">VND / pax</span>
        </div>
        <div className="text-xs text-slate-600 mt-0.5">
          ≈ {(c?.gia_ban_tb_per_pax_usd ?? 0).toFixed(2)} USD / pax
        </div>
        <div className="mt-2 pt-2 border-t border-blue-200 text-[11px] text-slate-600 space-y-0.5">
          <div className="flex justify-between"><span>16 khách</span><span className="tabular-nums font-medium">{fmtVnd(c?.case16.gia_ban_per_pax)} / pax</span></div>
          <div className="flex justify-between"><span>20 khách</span><span className="tabular-nums font-medium">{fmtVnd(c?.case20.gia_ban_per_pax)} / pax</span></div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Biên lợi nhuận (TB)</div>
            <div className="text-xl font-bold text-emerald-600 tabular-nums">
              {(c?.bien_loi_nhuan_tb_pct ?? 0).toFixed(2)} %
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

function CostRow({ label, v16, v20 }: { label: string; v16: number | null | undefined; v20: number | null | undefined }) {
  return (
    <li className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center">
      <span className="text-slate-600">{label}</span>
      <span className="text-slate-800 font-medium tabular-nums text-right min-w-[80px]">{fmtVnd(v16)}</span>
      <span className="text-slate-800 font-medium tabular-nums text-right min-w-[80px]">{fmtVnd(v20)}</span>
    </li>
  );
}
