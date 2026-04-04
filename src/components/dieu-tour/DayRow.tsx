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
    <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
      {item.dia_chi && <p>{item.dia_chi}</p>}
      {item.thong_tin_chung && <p>{item.thong_tin_chung}</p>}
    </div>
  );
}

function ItemNote({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const hasValue = value.trim().length > 0;

  if (!editing && !hasValue) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors print-hide"
      >
        + Chú thích
      </button>
    );
  }

  return (
    <textarea
      className="w-full min-h-[24px] text-[13px] border border-border/50 rounded-md px-2 py-1 mt-0.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => { if (!value.trim()) setEditing(false); }}
      autoFocus={editing && !hasValue}
      placeholder="VD: buổi sáng, 15h, tự túc..."
      rows={1}
      onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
    />
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
      <div className="p-2 border-r border-border space-y-2 min-w-0" style={{ wordBreak: 'break-word' }}>
        <Input
          className="h-8 text-[13px] font-medium"
          value={day.thanh_pho}
          onChange={(e) => update({ thanh_pho: e.target.value })}
          placeholder="Thành phố..."
        />
        {day.items.map((item, idx) => {
          return (
            <div key={idx} className="space-y-0.5">
              <div className="flex items-start gap-1 rounded-md p-1 bg-muted/60">
                <div className="flex-1 min-w-0">
                  <SearchableSelect
                    options={canhDiemOptions}
                    value={item.canh_diem_id ? String(item.canh_diem_id) : ""}
                    onChange={(v) => {
                      const newItems = [...day.items];
                      newItems[idx] = { ...item, canh_diem_id: v ? Number(v) : 0 };
                      updateItems(newItems);
                    }}
                    placeholder="Chọn cảnh điểm"
                    className="h-auto min-h-[28px] text-[13px] [&_span]:!whitespace-normal [&_span]:!overflow-visible [&_span]:!text-ellipsis-none [&_span]:!truncate-none"
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 print-hide" onClick={() => updateItems(day.items.filter((_, i) => i !== idx))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                <ItemNote
                  value={item.ghi_chu || ""}
                  onChange={(v) => {
                    const newItems = [...day.items];
                    newItems[idx] = { ...item, ghi_chu: v };
                    updateItems(newItems);
                  }}
                />
              </div>
            </div>
          );
        })}
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
