import { useState } from "react";
import { MapPin, Utensils, Hotel, Bus, Ticket, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { BaoGiaItem, BaoGiaKetQua } from "@/hooks/use-bao-gia";
import { fmtVnd } from "./helpers";

type Loai = BaoGiaItem["loai"];

const LOAI_META: Record<Loai, { label: string; icon: React.ReactNode; tint: string }> = {
  hotel:     { label: "Khách sạn",      icon: <Hotel className="h-3.5 w-3.5" />,    tint: "text-indigo-600 bg-indigo-50" },
  meal:      { label: "Ăn uống",        icon: <Utensils className="h-3.5 w-3.5" />, tint: "text-orange-600 bg-orange-50" },
  transport: { label: "Xe đưa đón",     icon: <Bus className="h-3.5 w-3.5" />,      tint: "text-cyan-600 bg-cyan-50" },
  ticket:    { label: "Vé tham quan",   icon: <Ticket className="h-3.5 w-3.5" />,   tint: "text-rose-600 bg-rose-50" },
};
const LOAI_ORDER: Loai[] = ["hotel", "meal", "transport", "ticket"];

interface Props {
  dayIdx: number;        // 1-based
  cityLabel?: string;
  ket: BaoGiaKetQua;
  isExpanded: boolean;
  onToggle: () => void;
  // Mỗi item edit → tạo new ket_qua + push lên parent (live). Blur / delete /
  // add → saveKetQua persist DB.
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
}

export function DayPanel({
  dayIdx, cityLabel = "—", ket, isExpanded, onToggle,
  updateDraftKetQua, saveKetQua,
}: Props) {
  const items = ket.items || [];
  // Item indices (theo ket.items[]) thuộc day này — giữ index thật để patch.
  // Item KHÔNG có ngay_so → coi như Day 1 (back-compat). ngay_so=0 = phụ trợ,
  // KHÔNG hiển thị ở day nào — render bởi DichVuPhuTroSection.
  const dayItemIdxs = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.ngay_so !== 0 && (it.ngay_so ?? 1) === dayIdx)
    .sort((a, b) => LOAI_ORDER.indexOf(a.it.loai) - LOAI_ORDER.indexOf(b.it.loai));

  const patchItem = (idx: number, patch: Partial<BaoGiaItem>) => {
    const newItems = items.map((it, i) => i === idx ? { ...it, ...patch } : it);
    updateDraftKetQua({ ...ket, items: newItems });
  };
  const commitItem = (idx: number) => {
    saveKetQua({ ...ket, items: items.map((it, i) => i === idx ? { ...it } : it) });
  };
  const deleteItem = (idx: number) => {
    saveKetQua({ ...ket, items: items.filter((_, i) => i !== idx) });
  };
  const addItem = (loai: Loai) => {
    const newItem: BaoGiaItem = { loai, mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: dayIdx };
    saveKetQua({ ...ket, items: [...items, newItem] });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-blue-700">DAY {dayIdx}</span>
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-slate-700">{cityLabel}</span>
          <span className="text-[11px] text-slate-400">· {dayItemIdxs.length} dịch vụ</span>
        </div>
        {isExpanded
          ? <ChevronDown className="h-4 w-4 text-slate-400" />
          : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {isExpanded && (
        <div className="border-t border-slate-200 px-4 py-3 space-y-1.5">
          {dayItemIdxs.length === 0 && (
            <p className="text-xs text-slate-400 italic px-1">Chưa có dịch vụ cho ngày này.</p>
          )}
          {dayItemIdxs.map(({ it, i }) => (
            <ItemRow
              key={i}
              item={it}
              onChangeField={(field, value) => patchItem(i, { [field]: value })}
              onCommit={() => commitItem(i)}
              onDelete={() => deleteItem(i)}
            />
          ))}
          <div className="pt-2 flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1 border-dashed text-slate-600 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Thêm dịch vụ
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {LOAI_ORDER.map((loai) => {
                  const meta = LOAI_META[loai];
                  return (
                    <DropdownMenuItem key={loai} onClick={() => addItem(loai)} className="gap-2">
                      <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded", meta.tint)}>
                        {meta.icon}
                      </span>
                      {meta.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Item row (editable inline) ────────────────────────────────────── */
function ItemRow({
  item, onChangeField, onCommit, onDelete,
}: {
  item: BaoGiaItem;
  onChangeField: <K extends keyof BaoGiaItem>(field: K, value: BaoGiaItem[K]) => void;
  onCommit: () => void;
  onDelete: () => void;
}) {
  const meta = LOAI_META[item.loai];
  const [donGiaStr, setDonGiaStr] = useState(String(item.don_gia ?? 0));

  return (
    <div className="grid grid-cols-12 gap-2 items-center py-1">
      <div className="col-span-2 flex items-center gap-1.5 text-xs font-medium text-slate-700 min-w-0">
        <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0", meta.tint)}>
          {meta.icon}
        </span>
        <span className="truncate">{meta.label}</span>
      </div>
      <Input
        value={item.mo_ta}
        onChange={(e) => onChangeField("mo_ta", e.target.value)}
        onBlur={onCommit}
        placeholder="Tên dịch vụ / NCC..."
        className="col-span-5 h-9 text-xs"
      />
      <Input
        type="number"
        value={donGiaStr}
        onChange={(e) => {
          setDonGiaStr(e.target.value);
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChangeField("don_gia", v);
        }}
        onBlur={onCommit}
        placeholder="Đơn giá"
        className="col-span-2 h-9 text-xs text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="col-span-2 text-right">
        <div className="text-[10px] text-slate-500 uppercase tracking-wide">Thành tiền</div>
        <div className="text-xs font-semibold text-slate-900 tabular-nums">{fmtVnd(item.don_gia)}</div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="col-span-1 h-8 w-8 text-slate-400 hover:text-destructive"
        title="Xoá dòng"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
