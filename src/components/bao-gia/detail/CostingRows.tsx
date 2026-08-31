import { Info, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BaoGiaItem } from "@/hooks/use-bao-gia";
import { AddServiceRow } from "@/components/bao-gia/AddServiceRow";
import { fmtVnd, fmtUsd, setSlOverride, type CostingGroup, type CostingRow } from "./helpers";

// Dòng của bảng chi phí — tách khỏi CostingSheetSection cho file khỏi phình.
// GroupBlock = dải tiêu đề nhóm + các dòng + form thêm dòng + cộng nhóm.

export function GroupBlock({
  group, metaIcon, metaTint, nTier, matchIdx, soNgay, onLive, onCommit, onAdd, onRemove,
}: {
  group: CostingGroup;
  metaIcon: React.ReactNode;
  metaTint: string;
  nTier: number;
  matchIdx: number;
  soNgay: number;
  onLive: (idx: number, patch: Partial<BaoGiaItem>) => void;
  onCommit: () => void;
  onAdd: (loai: BaoGiaItem["loai"], ngay_so: number, bua_an?: "trua" | "toi") => void;
  onRemove: (idx: number) => void;
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
      {group.rows.length === 0 && (
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
          onRemove={onRemove}
        />
      ))}
      {/* Thêm dòng vào chính nhóm này */}
      <tr>
        <td colSpan={totalCols} className="border border-slate-200 px-2 py-1">
          <AddServiceRow
            loai={group.key}
            soNgay={soNgay}
            onAdd={(ngay, bua) => onAdd(group.key, ngay, bua)}
          />
        </td>
      </tr>
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
  row, matchIdx, onLive, onCommit, onRemove,
}: {
  row: CostingRow;
  matchIdx: number;
  onLive: (idx: number, patch: Partial<BaoGiaItem>) => void;
  onCommit: () => void;
  onRemove: (idx: number) => void;
}) {
  const idx = row.itemIndex;
  const editable = row.editable && idx >= 0;
  const dayBadge = row.ngay_so > 0
    ? `D${row.ngay_so}${row.bua_an === "trua" ? "·T" : row.bua_an === "toi" ? "·Tối" : ""}`
    : "";

  const numInput = "h-7 w-full text-xs text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <tr className="group border-t border-slate-100 hover:bg-slate-50/50">
      {/* Cột ngày */}
      <td className="sticky left-0 z-10 bg-white border border-slate-200 px-1.5 py-1 text-[10px] text-slate-400 text-center align-top w-12">
        {dayBadge}
      </td>
      {/* Chi tiết: VI + ZH */}
      <td className="border border-slate-200 px-2 py-1 min-w-[180px]">
        <span className="flex items-center gap-1">
          {editable ? (
            <input
              value={row.mo_ta}
              onChange={(e) => onLive(idx, { mo_ta: e.target.value })}
              onBlur={onCommit}
              placeholder="Tên dịch vụ"
              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-700 outline-none focus:bg-blue-50/40 rounded px-1"
            />
          ) : (
            <span className="inline-flex flex-1 items-center gap-1 text-xs font-medium text-slate-700">
              {row.mo_ta} <Info className="h-3 w-3 text-slate-300" />
            </span>
          )}
          {editable && (
            <button
              type="button"
              onClick={() => onRemove(idx)}
              title="Xoá dòng này khỏi báo giá"
              className="shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </span>
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
      {/* Per-tier: SL (sửa được cho đoàn FIT) + Thành tiền */}
      {row.cells.map((cell, ti) => (
        <td key={ti} colSpan={2} className={cn("border border-slate-200 px-2 py-1", ti === matchIdx && "bg-emerald-50")}>
          <span className="flex items-center justify-between gap-2 tabular-nums">
            {row.unit === "lump" ? (
              <span className="w-16 text-center text-slate-400">—</span>
            ) : editable ? (
              <span className="flex w-16 shrink-0 items-center gap-0.5">
                <Input
                  type="number" min={0} step={1}
                  value={cell.manual ? cell.qty : ""}
                  placeholder={String(cell.auto)}
                  title={cell.manual
                    ? `Đang dùng SL nhập tay ${cell.qty} (tự tính: ${cell.auto}). Xoá ô để về tự tính.`
                    : `Tự tính ${cell.auto} ${row.unit === "rooms" ? "phòng" : "suất"} cho ${cell.guests} khách — gõ số để chốt đúng SL (đoàn FIT)`}
                  onChange={(e) => onLive(idx, {
                    sl_override: setSlOverride(row.sl_override, cell.guests, e.target.value),
                  })}
                  onBlur={onCommit}
                  className={cn(
                    numInput, "h-6 w-12 px-1 text-center",
                    cell.manual && "border-amber-300 bg-amber-50 font-medium text-amber-800",
                  )}
                />
                {cell.foc > 0 && (
                  <span className="text-[10px] text-slate-400" title={`Trừ ${cell.foc} miễn`}>−{cell.foc}</span>
                )}
              </span>
            ) : (
              <span className="w-16 text-center text-slate-400" title={cell.foc > 0 ? `${cell.qty} − ${cell.foc} miễn` : undefined}>
                {cell.foc > 0 ? `${cell.qty}−${cell.foc}` : cell.qty}
              </span>
            )}
            <span className="text-slate-700">{fmtVnd(cell.total)}</span>
          </span>
        </td>
      ))}
    </tr>
  );
}
