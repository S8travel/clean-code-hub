import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { tierGuestsOf, liveTierBreakdown, fmtVnd, type TierLine } from "./helpers";

interface Props {
  draft: BaoGiaRow;
  saveKetQua: (next: BaoGiaKetQua) => void;
  /** Số khách dự kiến của lead → tô đậm cột bậc áp dụng. 0/undefined = bỏ qua. */
  leadPax?: number;
}

// Bảng giá nhiều bậc theo số khách. Mỗi bậc tính giá THẬT (số phòng/FOC/chia
// khách riêng) thay vì 2 mức cứng 16/20. Bậc = 1 số khách (nhập mức thấp nhất
// của khoảng cho an toàn). Lưu vào ket_qua.tier_guests.
export function TierMatrixSection({ draft, saveKetQua, leadPax }: Props) {
  const [newG, setNewG] = useState("");
  const ket = draft.ket_qua;
  const guests = tierGuestsOf(ket);
  const tiers = liveTierBreakdown(draft);
  const xr = draft.exchange_rate ?? 26000;
  // Bậc áp dụng cho pax lead = ngưỡng cao nhất ≤ pax (tiers sort tăng dần).
  const matchIdx = leadPax && leadPax > 0
    ? tiers.reduce((acc, t, i) => (leadPax >= t.guests ? i : acc), -1)
    : -1;

  const setGuests = (next: number[]) => {
    if (!ket) return;
    const cleaned = [...new Set(next.filter((n) => n > 0).map((n) => Math.round(n)))].sort((a, b) => a - b);
    saveKetQua({ ...ket, tier_guests: cleaned.length ? cleaned : [16, 20] });
  };
  const addTier = () => {
    const n = Number(newG);
    if (!n || n <= 0) return;
    setGuests([...guests, n]);
    setNewG("");
  };
  const removeTier = (g: number) => {
    if (guests.length <= 1) return;
    setGuests(guests.filter((x) => x !== g));
  };

  if (!ket) return null;

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500">
        Bảng giá theo số khách (ma trận)
      </h2>

      {leadPax && leadPax > 0 && (
        <p className="text-[11px]">
          {matchIdx >= 0 ? (
            <span className="text-emerald-700">
              Đoàn ~<b>{leadPax}</b> khách (lead) → giá áp dụng:{" "}
              <b className="tabular-nums">{fmtVnd(tiers[matchIdx].line.gia_ban_per_pax)} ₫</b>/khách{" "}
              <span className="text-slate-500">(bậc {tiers[matchIdx].guests} khách — cột tô đậm)</span>
            </span>
          ) : (
            <span className="text-amber-700">Đoàn ~<b>{leadPax}</b> khách (lead) — chưa có bậc nào phủ số khách này.</span>
          )}
        </p>
      )}

      {/* Editor bậc khách */}
      <div className="flex flex-wrap items-center gap-1.5">
        {guests.map((g) => (
          <span key={g} className="inline-flex items-center gap-1 rounded-full border bg-slate-50 px-2 py-0.5 text-xs">
            {g} khách
            <button
              type="button"
              onClick={() => removeTier(g)}
              disabled={guests.length <= 1}
              className="text-slate-400 hover:text-red-500 disabled:opacity-30"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <Input
            type="number"
            min={1}
            value={newG}
            onChange={(e) => setNewG(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTier()}
            placeholder="Số khách"
            className="h-7 w-24 text-xs"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addTier}>
            <Plus className="h-3 w-3" /> Thêm bậc
          </Button>
        </span>
      </div>

      {/* Ma trận giá */}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-[#E6F1FB]">
              <th className="text-left py-1.5 px-2 font-semibold sticky left-0 bg-[#E6F1FB] z-10">Khoản</th>
              {tiers.map((t, i) => (
                <th
                  key={t.guests}
                  className={`text-right py-1.5 px-2 font-semibold min-w-[92px] ${i === matchIdx ? "bg-emerald-100" : ""}`}
                >
                  {t.guests} khách
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MRow label="Khách sạn"      tiers={tiers} pick={(l) => l.khach_san} />
            <MRow label="Ăn uống"        tiers={tiers} pick={(l) => l.an_uong} />
            <MRow label="Xe vận chuyển"  tiers={tiers} pick={(l) => l.xe} />
            <MRow label="Phụ thu"        tiers={tiers} pick={(l) => l.phu_thu_xe} />
            <MRow label="Vé tham quan"   tiers={tiers} pick={(l) => l.ve_tham_quan} />
            <MRow label="Hướng dẫn viên" tiers={tiers} pick={(l) => l.hdv} />
            <MRow label="Khác (BH, tip)" tiers={tiers} pick={(l) => l.khac} />
            <MRow label="Tổng vốn"       tiers={tiers} pick={(l) => l.tong_von} strong />
            <MRow label="Lợi nhuận"      tiers={tiers} pick={(l) => l.profit_vnd} />
            <tr className="border-t-2 border-blue-200 bg-blue-50/60">
              <td className="py-1.5 px-2 font-bold sticky left-0 bg-blue-50/60 z-10">GIÁ BÁN / khách</td>
              {tiers.map((t, i) => (
                <td
                  key={t.guests}
                  className={`py-1.5 px-2 text-right font-bold text-blue-700 tabular-nums ${i === matchIdx ? "bg-emerald-100" : ""}`}
                >
                  {fmtVnd(t.line.gia_ban_per_pax)}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-1 px-2 text-slate-500 sticky left-0 bg-white z-10">≈ USD / khách</td>
              {tiers.map((t) => (
                <td key={t.guests} className="py-1 px-2 text-right text-slate-600 tabular-nums">
                  {xr > 0 ? Math.round(t.line.gia_ban_per_pax / xr).toLocaleString("vi-VN") : "—"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-1 px-2 text-slate-500 sticky left-0 bg-white z-10">Biên LN %</td>
              {tiers.map((t) => (
                <td key={t.guests} className="py-1 px-2 text-right text-emerald-600 tabular-nums">
                  {t.line.bien_loi_nhuan_pct.toFixed(1)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500">
        Mỗi bậc tính giá thật theo số phòng/FOC/chia khách của bậc đó (nhập mức thấp nhất của khoảng cho an toàn).
        Nhóm đông hơn → giá/khách giảm do chi phí cố định (HDV, xe, tip) chia đều.
      </p>
    </section>
  );
}

function MRow({ label, tiers, pick, strong }: { label: string; tiers: TierLine[]; pick: (l: TierLine["line"]) => number; strong?: boolean }) {
  return (
    <tr className="border-t border-slate-100">
      <td className={`py-1 px-2 sticky left-0 bg-white z-10 ${strong ? "font-semibold" : "text-slate-600"}`}>{label}</td>
      {tiers.map((t) => (
        <td key={t.guests} className={`py-1 px-2 text-right tabular-nums ${strong ? "font-semibold text-blue-700" : "text-slate-700"}`}>
          {fmtVnd(pick(t.line))}
        </td>
      ))}
    </tr>
  );
}
