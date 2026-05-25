import { Plus, Trash2, Sparkles, Hotel, Utensils, Bus, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { BaoGiaItem, BaoGiaKetQua, BaoGiaRow } from "@/hooks/use-bao-gia";
import { useBangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";
import { ServiceTypeahead } from "./ServiceTypeahead";

type Loai = BaoGiaItem["loai"];

// Re-use icon meta — match với DayPanel để user nhận dạng category nhanh.
const LOAI_META: Record<Loai, { label: string; icon: React.ReactNode; tint: string }> = {
  hotel:     { label: "Khách sạn",      icon: <Hotel className="h-3.5 w-3.5" />,    tint: "text-indigo-600 bg-indigo-50" },
  meal:      { label: "Ăn uống",        icon: <Utensils className="h-3.5 w-3.5" />, tint: "text-orange-600 bg-orange-50" },
  transport: { label: "Xe đưa đón",     icon: <Bus className="h-3.5 w-3.5" />,      tint: "text-cyan-600 bg-cyan-50" },
  ticket:    { label: "Cảnh điểm",      icon: <Ticket className="h-3.5 w-3.5" />,   tint: "text-rose-600 bg-rose-50" },
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
  const { data: bangGia = [] } = useBangGiaDichVu();
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
            bangGia={bangGia}
            onChangeField={(field, value) => patchItem(i, { [field]: value })}
            onPick={(ten, gia, foc) => {
              const newItems = items.map((x, j) =>
                j === i ? { ...x, mo_ta: ten, don_gia: gia, foc } : x,
              );
              saveKetQua({ ...ket, items: newItems });
            }}
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
  item, bangGia, onChangeField, onPick, onCommit, onDelete,
}: {
  item: BaoGiaItem;
  bangGia: ReturnType<typeof useBangGiaDichVu>["data"];
  onChangeField: <K extends keyof BaoGiaItem>(field: K, value: BaoGiaItem[K]) => void;
  onPick: (ten: string, gia: number, foc: number) => void;
  onCommit: () => void;
  onDelete: () => void;
}) {
  const meta = LOAI_META[item.loai];

  return (
    <div className="grid grid-cols-12 gap-2 items-center py-1">
      <div className="col-span-2 flex items-center gap-1.5 text-xs font-medium text-slate-700 min-w-0">
        <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0", meta.tint)}>
          {meta.icon}
        </span>
        <span className="truncate">{meta.label}</span>
      </div>
      <ServiceTypeahead
        value={item.mo_ta}
        onChangeText={(t) => onChangeField("mo_ta", t)}
        onPick={onPick}
        onCommit={onCommit}
        loai={item.loai}
        items={bangGia ?? []}
        placeholder="Tìm hoặc gõ tên dịch vụ phụ trợ..."
        className="col-span-6"
      />
      <Input
        type="number"
        step="0.5"
        min={0}
        value={item.foc ?? 0}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v) && v >= 0) onChangeField("foc", v);
          else if (e.target.value === "") onChangeField("foc", 0);
        }}
        onBlur={onCommit}
        placeholder="FOC"
        title="FOC: số suất miễn phí (trừ khỏi multiplier khi tính tiền)"
        className="col-span-1 h-9 text-xs text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <Input
        type="text"
        inputMode="numeric"
        value={(item.don_gia ?? 0) > 0 ? (item.don_gia ?? 0).toLocaleString("vi-VN") : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "");
          onChangeField("don_gia", digits ? parseInt(digits, 10) : 0);
        }}
        onBlur={onCommit}
        placeholder="Đơn giá"
        className="col-span-2 h-9 text-xs text-right"
      />
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
