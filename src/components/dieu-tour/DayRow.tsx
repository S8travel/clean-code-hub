import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { SearchableSelect } from "@/components/SearchableSelect";
import type { DayLocal, DayItemLocal, CanhDiemItem, NhaHangItem, KhachSanItem } from "@/hooks/use-dieu-tour";
import { useSetMenus } from "@/hooks/use-nha-hang";

interface Props {
  day: DayLocal;
  onChange: (day: DayLocal) => void;
  onRemove: () => void;
  canhDiemList: CanhDiemItem[];
  nhaHangList: NhaHangItem[];
  khachSanList: KhachSanItem[];
  canhDiemOptions: { value: string; label: string }[];
  nhaHangOptions: { value: string; label: string }[];
  khachSanOptions: { value: string; label: string }[];
  dayLabel?: string;
}

function formatDayDisplay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function DetailLine({ item }: { item: { dia_chi?: string | null; thong_tin_chung?: string | null } }) {
  if (!item.dia_chi && !item.thong_tin_chung) return null;
  return (
    <div className="text-[13px] text-muted-foreground mt-0.5 space-y-0.5">
      {item.dia_chi && <p>{item.dia_chi}</p>}
      {item.thong_tin_chung && <p>{item.thong_tin_chung}</p>}
    </div>
  );
}


function SetMenuSelect({
  nhaHangId,
  value,
  onChange,
}: {
  nhaHangId: number;
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const { data: menus = [] } = useSetMenus(nhaHangId);
  if (menus.length === 0) return null;
  const fmt = (n: number) => n.toLocaleString("vi-VN");
  return (
    <Select
      value={value ? String(value) : "none"}
      onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
    >
      <SelectTrigger className="h-6 text-[11px] border-dashed print-hide">
        <SelectValue placeholder="Chọn set menu" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">-- Không chọn --</SelectItem>
        {menus.map((m) => (
          <SelectItem key={m.id} value={String(m.id)}>
            {m.ten_set}{m.gia ? ` — ${fmt(m.gia)}đ` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function DayRow({ day, onChange, onRemove, canhDiemList, nhaHangList, khachSanList, canhDiemOptions, nhaHangOptions, khachSanOptions, dayLabel }: Props) {
  const update = (partial: Partial<DayLocal>) => onChange({ ...day, ...partial });
  const updateItems = (items: DayItemLocal[]) => onChange({ ...day, items });
  const [noteOpenMap, setNoteOpenMap] = useState<Record<number, boolean>>({});

  const updateGhiChu = (idx: number, val: string) => {
    const newItems = [...day.items];
    newItems[idx] = { ...newItems[idx], ghi_chu: val };
    updateItems(newItems);
  };

  const selectedNhaTrua = nhaHangList.find((n) => n.id === day.an_trua_nha_hang_id);
  const selectedNhaToi = nhaHangList.find((n) => n.id === day.an_toi_nha_hang_id);
  const selectedKS = khachSanList.find((k) => k.id === day.khach_san_id);

  return (
    <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_32px] print:grid-cols-[60px_1fr_1fr_1fr_1fr] gap-0 border-b border-border min-h-[100px] print-avoid-break">
      {/* NGÀY */}
      <div className="p-1.5 bg-muted/40 border-r border-border flex flex-col items-center justify-start pt-3">
        {dayLabel ? (
          <span className="text-[12px] font-bold leading-tight text-center">{dayLabel}</span>
        ) : (
          <>
            <span className="text-[13px] font-bold tabular-nums leading-tight">{formatDayDisplay(day.ngay_date)}</span>
            <span className="text-[11px] text-muted-foreground">{day.thu}</span>
          </>
        )}
      </div>

      {/* CHƯƠNG TRÌNH */}
      <div className="p-1.5 border-r border-border space-y-1 min-w-0" style={{ wordBreak: 'break-word' }}>
        <Input
          className="h-7 text-[13px] font-medium"
          value={day.thanh_pho}
          onChange={(e) => update({ thanh_pho: e.target.value })}
          placeholder="Thành phố..."
        />
        <div className="space-y-0">
        {day.items.map((item, idx) => {
          const noteOpen = noteOpenMap[idx] || !!(item.ghi_chu?.trim());
          return (
            <div key={idx} className="flex items-center gap-0.5">
              <div className="flex-1 min-w-0 space-y-0.5">
                <SearchableSelect
                  options={canhDiemOptions}
                  value={item.canh_diem_id ? String(item.canh_diem_id) : ""}
                  onChange={(v) => {
                    const newItems = [...day.items];
                    newItems[idx] = { ...item, canh_diem_id: v ? Number(v) : 0 };
                    updateItems(newItems);
                  }}
                  placeholder="Chọn cảnh điểm"
                  className="h-auto py-0.5 px-2 text-[13px] [&_span]:!whitespace-normal [&_span]:!overflow-visible [&>svg]:h-3 [&>svg]:w-3"
                />
                {noteOpen && (
                  <textarea
                    className="w-full text-[12px] border border-border/40 rounded px-2 py-0.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    rows={1}
                    autoFocus={!item.ghi_chu?.trim()}
                    placeholder="Chú thích..."
                    value={item.ghi_chu || ""}
                    onChange={(e) => updateGhiChu(idx, e.target.value)}
                    onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
                    onBlur={() => {
                      if (!item.ghi_chu?.trim()) {
                        setNoteOpenMap((m) => ({ ...m, [idx]: false }));
                      }
                    }}
                  />
                )}
              </div>
              <div className="flex flex-col items-center gap-0 shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 print-hide" onClick={() => updateItems(day.items.filter((_, i) => i !== idx))}>
                  <X className="h-3 w-3" />
                </Button>
                <button
                  type="button"
                  className="h-6 w-6 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground rounded print-hide"
                  onClick={() => {
                    if (noteOpen) {
                      updateGhiChu(idx, "");
                      setNoteOpenMap((m) => ({ ...m, [idx]: false }));
                    } else {
                      setNoteOpenMap((m) => ({ ...m, [idx]: true }));
                    }
                  }}
                  title={noteOpen ? "Hủy chú thích" : "Thêm chú thích"}
                >
                  {noteOpen ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                </button>
              </div>
            </div>
          );
        })}
        </div>
        <button
          type="button"
          onClick={() => updateItems([...day.items, { canh_diem_id: 0, thu_tu: day.items.length + 1, ghi_chu: "" }])}
          className="w-full py-1.5 border border-dashed border-border rounded-md text-xs text-muted-foreground hover:border-foreground transition-colors print-hide"
        >
          <Plus className="inline h-3 w-3 mr-1" /> Thêm cảnh điểm / dịch vụ
        </button>
      </div>

      {/* ĂN TRƯA */}
      <div className="p-2 border-r border-border space-y-1 min-w-0 break-words">
        <span className="text-[11px] text-muted-foreground">🍽 Ăn trưa</span>
        {selectedNhaTrua ? (
          <>
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0 px-2 py-1 rounded-md bg-green-50 text-xs font-semibold text-green-800 break-words">
                {selectedNhaTrua.ten}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 print-hide" onClick={() => update({ an_trua_nha_hang_id: null, an_trua_set_menu_id: null })}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <DetailLine item={selectedNhaTrua} />
            <SetMenuSelect
              nhaHangId={selectedNhaTrua.id}
              value={day.an_trua_set_menu_id ?? null}
              onChange={(id) => update({ an_trua_set_menu_id: id })}
            />
          </>
        ) : (
          <SearchableSelect
            options={nhaHangOptions}
            value=""
            onChange={(v) => update({ an_trua_nha_hang_id: v ? Number(v) : null })}
            placeholder="Chọn"
            className="h-7 text-xs"
          />
        )}
      </div>

      {/* ĂN TỐI */}
      <div className="p-2 border-r border-border space-y-1 min-w-0 break-words">
        <span className="text-[11px] text-muted-foreground">🍽 Ăn tối</span>
        {selectedNhaToi ? (
          <>
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0 px-2 py-1 rounded-md bg-green-50 text-xs font-semibold text-green-800 break-words">
                {selectedNhaToi.ten}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 print-hide" onClick={() => update({ an_toi_nha_hang_id: null, an_toi_set_menu_id: null })}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <DetailLine item={selectedNhaToi} />
            <SetMenuSelect
              nhaHangId={selectedNhaToi.id}
              value={day.an_toi_set_menu_id ?? null}
              onChange={(id) => update({ an_toi_set_menu_id: id })}
            />
          </>
        ) : (
          <SearchableSelect
            options={nhaHangOptions}
            value=""
            onChange={(v) => update({ an_toi_nha_hang_id: v ? Number(v) : null })}
            placeholder="Chọn"
            className="h-7 text-xs"
          />
        )}
      </div>

      {/* KHÁCH SẠN */}
      <div className="p-2 border-r border-border space-y-1 min-w-0 break-words">
        <span className="text-[11px] text-muted-foreground">🏨 Khách sạn</span>
        {selectedKS ? (
          <>
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0 px-2 py-1 rounded-md bg-green-50 text-xs font-semibold text-green-800 break-words">
                {selectedKS.ten}
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 print-hide" onClick={() => update({ khach_san_id: null })}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <DetailLine item={selectedKS} />
          </>
        ) : (
          <SearchableSelect
            options={khachSanOptions}
            value=""
            onChange={(v) => update({ khach_san_id: v ? Number(v) : null })}
            placeholder="Chọn"
            className="h-7 text-xs"
          />
        )}
        <textarea
          className="w-full min-h-[24px] text-[13px] border border-border rounded-md px-2 py-1 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          value={day.ks_ma_code}
          onChange={(e) => update({ ks_ma_code: e.target.value })}
          placeholder="Mã code đặt phòng"
          rows={1}
          onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
        />
        <textarea
          className="w-full min-h-[24px] text-[13px] border border-border rounded-md px-2 py-1 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          value={day.ks_loai_phong}
          onChange={(e) => update({ ks_loai_phong: e.target.value })}
          placeholder="Loại phòng: 2 TWN, 1 DBL..."
          rows={1}
          onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
        />
      </div>

      {/* XÓA */}
      <div className="flex items-start justify-center pt-3 print-hide">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
