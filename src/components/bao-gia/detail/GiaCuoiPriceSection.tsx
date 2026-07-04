import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { BaoGiaKetQua, BaoGiaRow, GiaCuoiTier } from "@/hooks/use-bao-gia";
import { giaCuoiBrackets, findBracketIndexForPax } from "@/lib/bao-gia-calc";
import { fmtVnd } from "./helpers";

interface Props {
  draft: BaoGiaRow;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
  /** Số khách dự kiến của lead gắn báo giá → tô đậm bậc áp dụng. 0/undefined = bỏ qua. */
  leadPax?: number;
}

// Bảng giá cuối (land tour — giá đã chốt). OP nhập thẳng giá bán/khách theo từng
// bậc số khách; KHÔNG tính từ dịch vụ. USD = VND / tỷ giá (chỉ quy đổi).
// Mô hình "ngưỡng": mỗi bậc nhập 1 số = số khách TỐI THIỂU; khoảng tự suy ra.
export function GiaCuoiPriceSection({ draft, updateDraftKetQua, saveKetQua, leadPax }: Props) {
  const ket = draft.ket_qua;
  const xr = draft.exchange_rate ?? 26000;
  if (!ket) return null;

  const tiers: GiaCuoiTier[] = ket.gia_cuoi_tiers ?? [];

  const setTiers = (next: GiaCuoiTier[], persist: boolean) => {
    const nextKet = { ...ket, gia_cuoi_tiers: next };
    if (persist) saveKetQua(nextKet);
    else updateDraftKetQua(nextKet);
  };

  const updateTier = (idx: number, patch: Partial<GiaCuoiTier>, persist: boolean) => {
    setTiers(tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)), persist);
  };
  const addTier = () => {
    const lastG = tiers.length ? tiers[tiers.length - 1].guests : 0;
    setTiers([...tiers, { guests: lastG > 0 ? lastG + 5 : 10, gia_ban_vnd: 0 }], true);
  };
  const removeTier = (idx: number) => {
    setTiers(tiers.filter((_, i) => i !== idx), true);
  };

  // Bậc đã suy KHOẢNG khách (sort + USD + label) — bản "chính thức" để hiển thị/xuất.
  const brackets = giaCuoiBrackets(tiers, xr);
  const matchIdx = leadPax ? findBracketIndexForPax(brackets, leadPax) : -1;

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500">
          Bảng giá cuối theo số khách
        </h2>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addTier}>
          <Plus className="h-3 w-3" /> Thêm bậc
        </Button>
      </div>

      <p className="text-[11px] text-slate-500">
        Giá đã chốt (land tour lấy của bên khác) — mỗi bậc nhập <b>số khách tối thiểu</b> ("từ X khách")
        + giá bán/khách. Khoảng (10–15, 16–25, từ 26...) tự suy ra theo ngưỡng bậc kế. USD quy đổi theo tỷ giá.
      </p>

      {/* Editor bậc giá */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-[#E6F1FB]">
              <th className="text-left py-1.5 px-2 font-semibold w-[30%]">Từ (số khách)</th>
              <th className="text-right py-1.5 px-2 font-semibold">Giá bán / khách (VND)</th>
              <th className="text-right py-1.5 px-2 font-semibold w-[22%]">≈ USD / khách</th>
              <th className="w-[44px]" />
            </tr>
          </thead>
          <tbody>
            {tiers.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-3 px-2 text-center text-slate-400">
                  Chưa có bậc giá. Nhấn "Thêm bậc" để thêm.
                </td>
              </tr>
            ) : (
              tiers.map((t, idx) => {
                const usd = xr > 0 ? Math.round((t.gia_ban_vnd || 0)) / xr : 0;
                return (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="py-1 px-2">
                      <Input
                        type="number"
                        min={1}
                        value={t.guests || ""}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          updateTier(idx, { guests: isNaN(v) ? 0 : v }, false);
                        }}
                        onBlur={() => saveKetQua({ ...ket, gia_cuoi_tiers: tiers })}
                        className="h-8 w-24 text-xs"
                        placeholder="Từ..."
                      />
                    </td>
                    <td className="py-1 px-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={(t.gia_ban_vnd ?? 0) > 0 ? (t.gia_ban_vnd ?? 0).toLocaleString("vi-VN") : ""}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, "");
                          updateTier(idx, { gia_ban_vnd: digits ? parseInt(digits, 10) : 0 }, false);
                        }}
                        onBlur={() => saveKetQua({ ...ket, gia_cuoi_tiers: tiers })}
                        className="h-8 text-right text-xs"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-2 text-right text-slate-600 tabular-nums">
                      {xr > 0 ? "≈ " + usd.toFixed(2) : "—"}
                    </td>
                    <td className="py-1 px-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeTier(idx)}
                        className="text-slate-400 hover:text-red-500"
                        title="Xóa bậc"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bản chính thức (đã suy khoảng theo số khách) */}
      {brackets.length > 0 && (
        <div className="rounded-md border border-blue-100 bg-blue-50/40 p-2.5">
          <p className="text-[11px] font-semibold text-slate-600 mb-1.5">Bảng giá theo khoảng khách</p>
          {leadPax ? (
            matchIdx >= 0 ? (
              <p className="text-[11px] text-emerald-700 mb-2">
                Đoàn ~<b>{leadPax}</b> khách (lead) → giá áp dụng:{" "}
                <b className="tabular-nums">{fmtVnd(brackets[matchIdx].gia_ban_vnd)} ₫</b>/khách{" "}
                <span className="text-slate-500">({brackets[matchIdx].label})</span>
              </p>
            ) : (
              <p className="text-[11px] text-amber-700 mb-2">
                Đoàn ~<b>{leadPax}</b> khách (lead) — chưa có bậc nào phủ số khách này.
              </p>
            )
          ) : null}
          <div className="flex flex-wrap gap-2">
            {brackets.map((b, i) => {
              const active = i === matchIdx;
              return (
                <span
                  key={b.guests_from}
                  className={`inline-flex flex-col rounded-md border px-2.5 py-1 text-xs ${
                    active ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400" : "bg-white"
                  }`}
                >
                  <span className={active ? "font-medium text-emerald-700" : "text-slate-500"}>{b.label}</span>
                  <span className="font-semibold text-blue-700 tabular-nums">{fmtVnd(b.gia_ban_vnd)} ₫</span>
                  <span className="text-[10px] text-slate-500 tabular-nums">≈ {b.gia_ban_usd.toFixed(2)} USD</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
