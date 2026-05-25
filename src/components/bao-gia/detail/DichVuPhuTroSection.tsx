import { useState } from "react";
import { Plus, Trash2, Sparkles, Hotel, Utensils, Bus, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { fmtVnd } from "./helpers";

type Loai = BaoGiaItem["loai"];

// Re-use icon meta — match với DayPanel để user nhận dạng category nhanh.
const LOAI_META: Record<Loai, { label: string; icon: React.ReactNode; tint: string }> = {
  hotel:     { label: "Khách sạn",      icon: <Hotel className="h-3.5 w-3.5" />,    tint: "text-indigo-600 bg-indigo-50" },
  meal:      { label: "Ăn uống",        icon: <Utensils className="h-3.5 w-3.5" />, tint: "text-orange-600 bg-orange-50" },
  transport: { label: "Xe đưa đón",     icon: <Bus className="h-3.5 w-3.5" />,      tint: "text-cyan-600 bg-cyan-50" },
  ticket:    { label: "Vé tham quan",   icon: <Ticket className="h-3.5 w-3.5" />,   tint: "text-rose-600 bg-rose-50" },
};
const LOAI_ORDER: Loai[] = ["hotel", "meal", "transport", "ticket"];

interface Props {
  draft: BaoGiaRow;
  updateDraftKetQua: (next: BaoGiaKetQua) => void;
  saveKetQua: (next: BaoGiaKetQua) => void;
}

// Dịch vụ phụ trợ — items có ngay_so = 0 (không thuộc ngày nào trong tour).
// Vd: SIM card, xe trung chuyển ngoài, nước dừa, phí visa... Lưu cùng items[]
// nhưng filter bằng ngay_so=0 marker.
export function DichVuPhuTroSection({ draft, updateDraftKetQua, saveKetQua }: Props) {
  const ket = draft.ket_qua;
  if (!ket) return null;
  const items = ket.items || [];
  const extraIdxs = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.ngay_so === 0);

  const patchItem = (idx: number, patch: Partial<BaoGiaItem>) => {
    updateDraftKetQua({
      ...ket,
      items: items.map((it, i) => i === idx ? { ...it, ...patch } : it),
    });
  };
  const commitItem = (idx: number) => {
    saveKetQua({ ...ket, items: items.map((it, i) => i === idx ? { ...it } : it) });
  };
  const deleteItem = (idx: number) => {
    saveKetQua({ ...ket, items: items.filter((_, i) => i !== idx) });
  };
  const addItem = (loai: Loai) => {
    const newItem: BaoGiaItem = { loai, mo_ta: "", don_gia: 0, ghi_chu: "", ngay_so: 0 };
    saveKetQua({ ...ket, items: [...items, newItem] });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 inline-flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          Dịch vụ phụ trợ
          <span className="text-[10px] text-slate-400 normal-case font-normal">— không nằm trong ngày cụ thể (SIM, xe trung chuyển ngoài, nước dừa...)</span>
        </h2>
      </div>

      <div className="space-y-1.5">
        {extraIdxs.length === 0 && (
          <p className="text-xs text-slate-400 italic px-1 py-1">Chưa có dịch vụ phụ trợ.</p>
        )}
        {extraIdxs.map(({ it, i }) => (
          <ExtraRow
            key={i}
            item={it}
            onChangeField={(field, value) => patchItem(i, { [field]: value })}
            onCommit={() => commitItem(i)}
            onDelete={() => deleteItem(i)}
          />
        ))}
        <div className="pt-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1 border-dashed text-slate-600 hover:bg-slate-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm dịch vụ phụ trợ
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
    </section>
  );
}

/* ── Extra item row (identical UX với DayPanel ItemRow) ───────────────── */
function ExtraRow({
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
        placeholder="Tên dịch vụ phụ trợ..."
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
