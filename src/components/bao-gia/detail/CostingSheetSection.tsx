import { useState } from "react";
import { Hotel, Utensils, Bus, Ticket, Info, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import {
  costingSheet, fmtVnd, fmtUsd, tierGuestsOf,
  type CostingGroup, type CostingRow,
} from "./helpers";

interface Props {
  draft: BaoGiaRow;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
  /** Pax dự kiến của lead → tô đậm cột bậc áp dụng. */
  leadPax?: number;
}

const GROUP_META: Record<CostingGroup["key"], { icon: React.ReactNode; tint: string }> = {
  transport: { icon: <Bus className="h-3.5 w-3.5" />,      tint: "text-cyan-700 bg-cyan-50" },
  hotel:     { icon: <Hotel className="h-3.5 w-3.5" />,    tint: "text-indigo-700 bg-indigo-50" },
  meal:      { icon: <Utensils className="h-3.5 w-3.5" />, tint: "text-orange-700 bg-orange-50" },
  ticket:    { icon: <Ticket className="h-3.5 w-3.5" />,   tint: "text-rose-700 bg-rose-50" },
};

// Bảng chi phí bố cục Excel: gom theo nhóm Xe/KS/Ăn/Vé, song ngữ ZH+VI, đơn giá
// USD+VND, N (số đêm/lần), và NHIỀU cột số khách song song (mỗi cột: SL phòng/khách
// + thành tiền). Sửa inline đơn giá / N / FOC (thêm-xoá dòng vẫn ở "Chương trình tour").
export function CostingSheetSection({ draft, updateDraftKetQua, saveKetQua, leadPax }: Props) {
  const [newG, setNewG] = useState("");
  const ket = draft.ket_qua;
  const sheet = costingSheet(draft);
  if (!ket || !sheet) return null;

  const items = ket.items ?? [];
  const nTier = sheet.configs.length;
  const guests = tierGuestsOf(ket);

  const setGuests = (next: number[]) => {
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
  // Bậc áp dụng cho lead = ngưỡng cao nhất ≤ leadPax.
  const matchIdx = leadPax && leadPax > 0
    ? sheet.configs.reduce((acc, c, i) => (leadPax >= c.guests ? i : acc), -1)
    : -1;

  // Live edit (onChange) → updateDraftKetQua; blur → saveKetQua persist.
  const liveItem = (idx: number, patch: Partial<BaoGiaItem>) => {
    updateDraftKetQua({ ...ket, items: items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });
  };
  const commit = () => saveKetQua({ ...ket, items });

  const tierBg = (i: number) => (i === matchIdx ? "bg-emerald-50" : "");

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500">
          Bảng chi phí (theo nhóm · nhiều cỡ đoàn)
        </h2>
        <span className="text-[11px] text-slate-400">Tỷ giá {fmtVnd(sheet.xr)} ₫/USD</span>
      </div>

      {leadPax && leadPax > 0 && matchIdx >= 0 && (
        <p className="text-[11px] text-emerald-700">
          Đoàn ~<b>{leadPax}</b> khách (lead) → cột <b>{sheet.configs[matchIdx].guests} khách</b> được tô đậm.
        </p>
      )}

      {/* Editor cỡ đoàn (mỗi bậc = 1 cột số khách) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-slate-500 mr-1">Cỡ đoàn:</span>
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
            type="number" min={1} value={newG}
            onChange={(e) => setNewG(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTier()}
            placeholder="Số khách"
            className="h-7 w-24 text-xs"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addTier}>
            <Plus className="h-3 w-3" /> Thêm cỡ
          </Button>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full min-w-[860px]">
          <thead>
            {/* Hàng 1: gộp cột theo bậc số khách */}
            <tr className="bg-[#E6F1FB]">
              <th className="sticky left-0 z-20 bg-[#E6F1FB] text-left py-1.5 px-2 font-semibold border border-slate-200" colSpan={2}>
                Hạng mục
              </th>
              <th className="py-1.5 px-2 font-semibold text-right border border-slate-200" title="Đơn giá USD">ĐG USD</th>
              <th className="py-1.5 px-2 font-semibold text-right border border-slate-200" title="Đơn giá VND">ĐG VND</th>
              <th className="py-1.5 px-2 font-semibold text-center border border-slate-200" title="Số đêm / số lần (次/N数)">N</th>
              <th className="py-1.5 px-2 font-semibold text-center border border-slate-200" title="FOC: số phòng/suất miễn phí">FOC</th>
              {sheet.configs.map((c, i) => (
                <th key={c.guests} colSpan={2} className={cn("py-1 px-2 font-semibold text-center border border-slate-200", tierBg(i))}>
                  <div className="text-blue-800">{c.guests} khách</div>
                  <div className="text-[10px] font-normal text-slate-500">{c.rooms} phòng · {c.pax} pax</div>
                </th>
              ))}
            </tr>
            {/* Hàng 2: nhãn cột con */}
            <tr className="bg-[#F2F7FC] text-[10px] text-slate-500">
              <th className="sticky left-0 z-20 bg-[#F2F7FC] border border-slate-200" colSpan={6}></th>
              {sheet.configs.map((c, i) => (
                <th key={c.guests} className={cn("py-0.5 px-2 text-center border border-slate-200", tierBg(i))} colSpan={2}>
                  <span className="inline-flex gap-3">
                    <span className="w-10 text-center">SL</span>
                    <span>Thành tiền</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.groups.map((g) => {
              const meta = GROUP_META[g.key];
              const hasRows = g.rows.length > 0;
              return (
                <GroupBlock
                  key={g.key}
                  group={g}
                  metaIcon={meta.icon}
                  metaTint={meta.tint}
                  nTier={nTier}
                  matchIdx={matchIdx}
                  hasRows={hasRows}
                  onLive={liveItem}
                  onCommit={commit}
                />
              );
            })}

            {/* Footer tổng hợp */}
            {sheet.footer.map((f) => {
              const isTotal = f.kind === "total";
              const isPrice = f.kind === "price";
              return (
                <tr
                  key={f.key}
                  className={cn(
                    "border-t",
                    isTotal && "border-t-2 border-slate-300 bg-slate-50",
                    isPrice && "bg-blue-50/60",
                  )}
                >
                  <td
                    colSpan={6}
                    className={cn(
                      "sticky left-0 z-10 py-1 px-2 text-right border border-slate-200",
                      isTotal && "bg-slate-50 font-bold",
                      isPrice && "bg-blue-50/60 font-bold text-blue-800",
                      !isTotal && !isPrice && "bg-white text-slate-600",
                    )}
                  >
                    {f.label}
                  </td>
                  {f.values.map((v, ti) => (
                    <td
                      key={ti}
                      colSpan={2}
                      className={cn(
                        "py-1 px-2 text-right tabular-nums border border-slate-200",
                        tierBg(ti),
                        isTotal && "font-bold",
                        isPrice && "font-bold text-blue-800",
                        f.kind === "usd" && "text-slate-500",
                        f.kind === "pct" && "text-emerald-600",
                      )}
                    >
                      {f.kind === "usd" ? fmtUsd(v) : f.kind === "pct" ? `${v.toFixed(1)}%` : fmtVnd(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500">
        Cột <b>N</b> = số đêm (KS) / số lần (ăn, vé). <b>FOC</b> nhà hàng <b>tự tính</b> theo chính sách (vd 16免1)
        cho từng cỡ đoàn — để trống ô FOC = auto, nhập số = ghi đè. Mỗi cột hiện <b>SL−miễn</b> (số đã trừ FOC).
        Xe & phụ thu lấy từ phần thông tin tour ở trên (sửa tại đó). Thêm/xoá dịch vụ ở mục “Chương trình tour”.
      </p>
    </section>
  );
}

function GroupBlock({
  group, metaIcon, metaTint, nTier, matchIdx, hasRows, onLive, onCommit,
}: {
  group: CostingGroup;
  metaIcon: React.ReactNode;
  metaTint: string;
  nTier: number;
  matchIdx: number;
  hasRows: boolean;
  onLive: (idx: number, patch: Partial<BaoGiaItem>) => void;
  onCommit: () => void;
}) {
  const totalCols = 6 + nTier * 2;
  return (
    <>
      <tr>
        <td colSpan={totalCols} className="border border-slate-200 px-2 py-1 bg-slate-100/70">
          <span className={cn("inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold", metaTint)}>
            {metaIcon} {group.label}
          </span>
        </td>
      </tr>
      {!hasRows && (
        <tr>
          <td colSpan={totalCols} className="border border-slate-200 px-2 py-1 text-[11px] text-slate-400 italic">
            (chưa có)
          </td>
        </tr>
      )}
      {group.rows.map((r, ri) => (
        <ItemRow
          key={r.itemIndex >= 0 ? `i${r.itemIndex}` : `s${group.key}-${ri}`}
          row={r}
          matchIdx={matchIdx}
          onLive={onLive}
          onCommit={onCommit}
        />
      ))}
      {/* Subtotal nhóm */}
      <tr className="bg-slate-50/70 text-[11px]">
        <td colSpan={6} className="sticky left-0 z-10 bg-slate-50/70 border border-slate-200 px-2 py-0.5 text-right font-medium text-slate-600">
          Cộng {group.label.toLowerCase()}
        </td>
        {group.subtotals.map((s, ti) => (
          <td key={ti} colSpan={2} className={cn("border border-slate-200 px-2 py-0.5 text-right font-semibold tabular-nums", ti === matchIdx && "bg-emerald-50")}>
            {fmtVnd(s)}
          </td>
        ))}
      </tr>
    </>
  );
}

function ItemRow({
  row, matchIdx, onLive, onCommit,
}: {
  row: CostingRow;
  matchIdx: number;
  onLive: (idx: number, patch: Partial<BaoGiaItem>) => void;
  onCommit: () => void;
}) {
  const idx = row.itemIndex;
  const editable = row.editable && idx >= 0;
  const dayBadge = row.ngay_so > 0
    ? `D${row.ngay_so}${row.bua_an === "trua" ? "·T" : row.bua_an === "toi" ? "·Tối" : ""}`
    : "";

  const numInput = "h-7 w-full text-xs text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/50">
      {/* Cột ngày */}
      <td className="sticky left-0 z-10 bg-white border border-slate-200 px-1.5 py-1 text-[10px] text-slate-400 text-center align-top w-12">
        {dayBadge}
      </td>
      {/* Chi tiết: VI + ZH */}
      <td className="border border-slate-200 px-2 py-1 min-w-[180px]">
        {editable ? (
          <input
            value={row.mo_ta}
            onChange={(e) => onLive(idx, { mo_ta: e.target.value })}
            onBlur={onCommit}
            placeholder="Tên dịch vụ"
            className="w-full bg-transparent text-xs font-medium text-slate-700 outline-none focus:bg-blue-50/40 rounded px-1"
          />
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
            {row.mo_ta} <Info className="h-3 w-3 text-slate-300" />
          </span>
        )}
        {row.ten_zh && <div className="text-[10px] text-slate-400 px-1">{row.ten_zh}</div>}
      </td>
      {/* ĐG USD (auto) */}
      <td className="border border-slate-200 px-2 py-1 text-right text-slate-500 tabular-nums">{fmtUsd(row.don_gia_usd)}</td>
      {/* ĐG VND */}
      <td className="border border-slate-200 px-1 py-1 text-right">
        {editable ? (
          <Input
            type="text"
            inputMode="numeric"
            value={row.don_gia > 0 ? row.don_gia.toLocaleString("vi-VN") : ""}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              onLive(idx, { don_gia: digits ? parseInt(digits, 10) : 0 });
            }}
            onBlur={onCommit}
            placeholder="0"
            className={numInput}
          />
        ) : (
          <span className="tabular-nums text-slate-700">{fmtVnd(row.don_gia)}</span>
        )}
      </td>
      {/* N */}
      <td className="border border-slate-200 px-1 py-1 text-center">
        {editable ? (
          <Input
            type="number" min={1} step={1}
            value={row.so_luong}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onLive(idx, { so_luong: !isNaN(v) && v > 0 ? v : 1 });
            }}
            onBlur={onCommit}
            className={cn(numInput, "text-center w-12 mx-auto")}
          />
        ) : (
          <span className="text-slate-400">1</span>
        )}
      </td>
      {/* FOC — trống = auto theo chính sách (placeholder), nhập số = ghi đè */}
      <td className="border border-slate-200 px-1 py-1 text-center">
        {editable && row.unit !== "lump" ? (
          <Input
            type="number" min={0} step={0.5}
            value={row.foc_manual ?? ""}
            placeholder={row.foc_khach ? `${row.foc_khach}免${row.foc_mien ?? 0}` : "0"}
            title={row.foc_khach
              ? `Tự tính ${row.foc_khach} miễn ${row.foc_mien ?? 0} mỗi cỡ đoàn — nhập số để ghi đè`
              : "Số suất/phòng miễn (để trống = 0)"}
            onChange={(e) => {
              const s = e.target.value.trim();
              if (s === "") { onLive(idx, { foc: undefined }); return; }
              const v = parseFloat(s);
              onLive(idx, { foc: !isNaN(v) && v >= 0 ? v : 0 });
            }}
            onBlur={onCommit}
            className={cn(numInput, "text-center w-14 mx-auto")}
          />
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </td>
      {/* Per-tier: SL + Thành tiền */}
      {row.cells.map((cell, ti) => (
        <td key={ti} colSpan={2} className={cn("border border-slate-200 px-2 py-1", ti === matchIdx && "bg-emerald-50")}>
          <span className="flex items-center justify-between gap-2 tabular-nums">
            <span className="w-12 text-center text-slate-400" title={cell.foc > 0 ? `${cell.qty} − ${cell.foc} miễn` : undefined}>
              {row.unit === "lump" ? "—" : cell.foc > 0 ? `${cell.qty}−${cell.foc}` : cell.qty}
            </span>
            <span className="text-slate-700">{fmtVnd(cell.total)}</span>
          </span>
        </td>
      ))}
    </tr>
  );
}
