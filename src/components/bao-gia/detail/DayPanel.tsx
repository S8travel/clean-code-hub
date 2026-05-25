import { MapPin, Utensils, Hotel, Bus, Ticket, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { BaoGiaItem, BaoGiaKetQua } from "@/hooks/use-bao-gia";
import { useBangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";
import { ServiceTypeahead } from "./ServiceTypeahead";

type Loai = BaoGiaItem["loai"];
type BuaAn = "trua" | "toi";

// Meta cho icon/tint theo loai. Label động riêng (meal trua/toi khác nhau).
const LOAI_META: Record<Loai, { icon: React.ReactNode; tint: string }> = {
  hotel:     { icon: <Hotel className="h-3.5 w-3.5" />,    tint: "text-indigo-600 bg-indigo-50" },
  meal:      { icon: <Utensils className="h-3.5 w-3.5" />, tint: "text-orange-600 bg-orange-50" },
  transport: { icon: <Bus className="h-3.5 w-3.5" />,      tint: "text-cyan-600 bg-cyan-50" },
  ticket:    { icon: <Ticket className="h-3.5 w-3.5" />,   tint: "text-rose-600 bg-rose-50" },
};

function labelFor(item: Pick<BaoGiaItem, "loai" | "bua_an">): string {
  if (item.loai === "meal") {
    if (item.bua_an === "trua") return "Ăn trưa";
    if (item.bua_an === "toi") return "Ăn tối";
    return "Ăn uống";
  }
  if (item.loai === "ticket") return "Cảnh điểm";
  if (item.loai === "hotel") return "Khách sạn";
  return "Xe đưa đón";
}

// Add menu cho day items: Cảnh điểm → Ăn trưa → Ăn tối → Khách sạn.
// Transport đã có VehicleSelector cấp tour → KHÔNG còn trong day menu.
type AddOpt = { key: string; loai: Loai; bua_an?: BuaAn; label: string };
const ADD_OPTIONS: AddOpt[] = [
  { key: "ticket",    loai: "ticket", label: "Cảnh điểm" },
  { key: "meal_trua", loai: "meal",   bua_an: "trua", label: "Ăn trưa" },
  { key: "meal_toi",  loai: "meal",   bua_an: "toi",  label: "Ăn tối" },
  { key: "hotel",     loai: "hotel",  label: "Khách sạn" },
];

// Sort key cho dayItemIdxs: cùng order với ADD_OPTIONS.
function sortKey(item: Pick<BaoGiaItem, "loai" | "bua_an">): number {
  if (item.loai === "ticket") return 0;
  if (item.loai === "meal" && item.bua_an === "trua") return 1;
  if (item.loai === "meal" && item.bua_an === "toi") return 2;
  if (item.loai === "meal") return 3; // generic meal (back-compat)
  if (item.loai === "hotel") return 4;
  return 5; // transport (legacy) đẩy xuống cuối
}

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
  const { data: bangGia = [] } = useBangGiaDichVu();
  const items = ket.items || [];
  // Item indices (theo ket.items[]) thuộc day này — giữ index thật để patch.
  // Item KHÔNG có ngay_so → coi như Day 1 (back-compat). ngay_so=0 = phụ trợ,
  // KHÔNG hiển thị ở day nào — render bởi DichVuPhuTroSection.
  const dayItemIdxs = items
    .map((it, i) => ({ it, i }))
    .filter(({ it }) => it.ngay_so !== 0 && (it.ngay_so ?? 1) === dayIdx)
    .sort((a, b) => sortKey(a.it) - sortKey(b.it));

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
  const addItem = (opt: AddOpt) => {
    const newItem: BaoGiaItem = {
      loai: opt.loai,
      mo_ta: "",
      don_gia: 0,
      ghi_chu: "",
      ngay_so: dayIdx,
      ...(opt.bua_an ? { bua_an: opt.bua_an } : {}),
    };
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
              bangGia={bangGia}
              onChangeField={(field, value) => patchItem(i, { [field]: value })}
              onPick={(ten, gia, foc) => {
                // Patch mo_ta + don_gia + foc atomically — tránh 3 setState race
                const newItems = items.map((x, j) =>
                  j === i ? { ...x, mo_ta: ten, don_gia: gia, foc } : x,
                );
                saveKetQua({ ...ket, items: newItems });
              }}
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
                {ADD_OPTIONS.map((opt) => {
                  const meta = LOAI_META[opt.loai];
                  return (
                    <DropdownMenuItem key={opt.key} onClick={() => addItem(opt)} className="gap-2">
                      <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded", meta.tint)}>
                        {meta.icon}
                      </span>
                      {opt.label}
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
  const label = labelFor(item);

  return (
    <div className="grid grid-cols-12 gap-2 items-center py-1">
      <div className="col-span-2 flex items-center gap-1.5 text-xs font-medium text-slate-700 min-w-0">
        <span className={cn("inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0", meta.tint)}>
          {meta.icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <ServiceTypeahead
        value={item.mo_ta}
        onChangeText={(t) => onChangeField("mo_ta", t)}
        onPick={onPick}
        onCommit={onCommit}
        loai={item.loai}
        items={bangGia ?? []}
        placeholder="Tìm hoặc gõ tên dịch vụ..."
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
