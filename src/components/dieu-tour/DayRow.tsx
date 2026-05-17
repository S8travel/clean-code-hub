import { useState } from "react";
import { Lock, Plus, X, MessageSquarePlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { SearchableSelect } from "@/components/SearchableSelect";
import type { DayLocal, DayItemLocal, CanhDiemItem, NhaHangItem, KhachSanItem } from "@/hooks/use-dieu-tour";
import { checkCanhDiemDeletable, checkNhaHangDeletable, checkKhachSanDeletable } from "@/hooks/use-dieu-tour";
import { useSetMenus } from "@/hooks/use-nha-hang";
import { toast } from "sonner";

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
  doanId?: number; // optional: SeriPage không có doanId, các check NH/KS sẽ skip
  lockKhachSan?: boolean; // mẫu seri: khoá cột khách sạn
}

function formatDayDisplay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function DetailLine({ item }: { item: { dia_chi?: string | null; thong_tin_chung?: string | null; so_dien_thoai?: string | null } }) {
  if (!item.dia_chi && !item.thong_tin_chung && !item.so_dien_thoai) return null;
  return (
    <div className="text-[13px] text-muted-foreground mt-0.5 space-y-0.5">
      {item.dia_chi && <p>{item.dia_chi}</p>}
      {item.thong_tin_chung && <p>{item.thong_tin_chung}</p>}
      {item.so_dien_thoai && <p>{item.so_dien_thoai}</p>}
    </div>
  );
}


function MealNote({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(() => !!value);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-0.5 print-hide"
      >
        <MessageSquarePlus className="h-3 w-3" />
        Thêm chú thích
      </button>
    );
  }

  return (
    <div className="relative mt-1">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Chú thích bữa ăn..."
        rows={2}
        className="text-xs resize-none pr-6 min-h-[40px]"
        autoFocus={!value}
      />
      {!value && (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-1 right-1 text-muted-foreground hover:text-foreground print-hide"
        >
          <X className="h-3 w-3" />
        </button>
      )}
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
      <SelectTrigger className={`h-6 text-[11px] border-dashed print-hide${value ? " bg-amber-50 text-amber-800 font-medium border-amber-200" : ""}`}>
        <span>
          {(() => {
            const m = value ? menus.find((x) => x.id === value) : null;
            return m ? `${m.ten_set}${m.gia ? ` — ${fmt(m.gia)}đ` : ""}` : "Chọn set menu";
          })()}
        </span>
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

export default function DayRow({ day, onChange, onRemove, canhDiemList, nhaHangList, khachSanList, canhDiemOptions, nhaHangOptions, khachSanOptions, dayLabel, doanId, lockKhachSan }: Props) {
  const update = (partial: Partial<DayLocal>) => onChange({ ...day, ...partial });
  const updateItems = (items: DayItemLocal[]) => onChange({ ...day, items });
  const [noteOpenMap, setNoteOpenMap] = useState<Record<number, boolean>>({});
  // Google Sheets-like: sau khi chọn cảnh điểm ở dòng cuối → tự thêm dòng mới + auto-open dropdown của nó.
  const [autoOpenIdx, setAutoOpenIdx] = useState<number | null>(null);
  // Ô đang ở chế độ đổi NH/KS (sau khi đã qua guard check)
  const [editSel, setEditSel] = useState<null | "trua" | "toi" | "ks">(null);

  const updateGhiChu = (idx: number, val: string) => {
    const newItems = [...day.items];
    newItems[idx] = { ...newItems[idx], ghi_chu: val };
    updateItems(newItems);
  };

  const selectedNhaTrua = nhaHangList.find((n) => n.id === day.an_trua_nha_hang_id);
  const selectedNhaToi = nhaHangList.find((n) => n.id === day.an_toi_nha_hang_id);
  const selectedKS = khachSanList.find((k) => k.id === day.khach_san_id);

  return (
    <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_32px] print:grid-cols-[60px_1fr_1fr_1fr_1fr] gap-0 border-b border-gray-300 min-h-[100px] print-avoid-break">
      {/* NGÀY */}
      <div className="p-1.5 bg-white border-r border-gray-300 flex flex-col items-center justify-start pt-3">
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
      <div className="p-1.5 border-r border-gray-300 space-y-1 min-w-0" style={{ wordBreak: 'break-word' }}>
        <Input
          className={`h-7 text-[13px] font-medium text-center ${day.thanh_pho?.trim() ? "bg-rose-50 text-rose-800 border-rose-200" : ""}`}
          value={day.thanh_pho}
          onChange={(e) => update({ thanh_pho: e.target.value })}
          placeholder="Thành phố..."
        />
        <div className="space-y-0">
        {day.items.map((item, idx) => {
          const noteOpen = noteOpenMap[idx] || !!(item.ghi_chu?.trim());
          const selectedCanhDiem = canhDiemList.find((c) => c.id === item.canh_diem_id);
          return (
            <div key={idx} className="group flex items-center gap-0.5">
              <div className="flex-1 min-w-0 space-y-0.5">
                <SearchableSelect
                  options={canhDiemOptions}
                  value={item.canh_diem_id ? String(item.canh_diem_id) : ""}
                  autoOpen={autoOpenIdx === idx}
                  onChange={(v) => {
                    const newItems = [...day.items];
                    newItems[idx] = { ...item, canh_diem_id: v ? Number(v) : 0 };
                    // Google Sheets-like: chọn ở dòng cuối + có value → thêm dòng mới rỗng + auto-open dòng đó
                    const isLast = idx === day.items.length - 1;
                    if (v && isLast) {
                      newItems.push({ canh_diem_id: 0, thu_tu: newItems.length + 1, ghi_chu: "" });
                      setAutoOpenIdx(idx + 1);
                      // KHÔNG clear: effect trong SearchableSelect chỉ fire 1 lần khi autoOpen
                      // chuyển false→true. Lần select tiếp theo sẽ overwrite autoOpenIdx.
                    } else {
                      setAutoOpenIdx(null);
                    }
                    updateItems(newItems);
                  }}
                  placeholder="Chọn cảnh điểm"
                  className={`h-auto py-0.5 px-2 text-[13px] [&_span]:!whitespace-normal [&_span]:!overflow-visible [&>svg]:h-3 [&>svg]:w-3${item.canh_diem_id ? " bg-blue-50 text-blue-900 font-medium" : ""}`}
                />
                {selectedCanhDiem && (
                  <>
                    {selectedCanhDiem.khach_san_id && (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 mt-0.5">
                        🏨 Day Use
                      </span>
                    )}
                    {selectedCanhDiem.ghi_chu && (
                      <p className="text-[13px] text-muted-foreground mt-0.5 whitespace-pre-wrap">
                        {selectedCanhDiem.ghi_chu}
                      </p>
                    )}
                  </>
                )}
                {noteOpen && (
                  <textarea
                    className="w-full text-[12px] border border-border/40 rounded px-2 py-0.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring overflow-hidden"
                    rows={1}
                    autoFocus={!item.ghi_chu?.trim()}
                    placeholder="Chú thích..."
                    value={item.ghi_chu || ""}
                    ref={(el) => {
                      if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
                    }}
                    onChange={(e) => {
                      const t = e.currentTarget;
                      t.style.height = "auto";
                      t.style.height = t.scrollHeight + "px";
                      updateGhiChu(idx, e.target.value);
                    }}
                    onBlur={() => {
                      if (!item.ghi_chu?.trim()) {
                        setNoteOpenMap((m) => ({ ...m, [idx]: false }));
                      }
                    }}
                  />
                )}
              </div>
              <div className="flex flex-col items-center gap-0 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-6 print-hide"
                  onClick={async () => {
                    // Pre-check: cảnh điểm đã save (id exists) → check DNTT + booking_dv.
                    // Item mới chưa save (id=undefined) thì gỡ thẳng, không cần query DB.
                    const target = day.items[idx];
                    if (target.id) {
                      const cd = canhDiemList.find((c) => c.id === target.canh_diem_id);
                      const options = (doanId && cd) ? { doanId, canhDiem: cd } : undefined;
                      const result = await checkCanhDiemDeletable(target.id, options);
                      if (!result.ok) {
                        toast.error(result.reason ?? "Không thể xóa");
                        return;
                      }
                    }
                    updateItems(day.items.filter((_, i) => i !== idx));
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
                <button
                  type="button"
                  className={`h-5 w-6 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground rounded print-hide${noteOpen ? "" : " hidden group-hover:flex"}`}
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
          onClick={() => {
            const newIdx = day.items.length;
            updateItems([...day.items, { canh_diem_id: 0, thu_tu: newIdx + 1, ghi_chu: "" }]);
            setAutoOpenIdx(newIdx);  // auto-mở SearchableSelect của row mới
          }}
          className="w-full py-1.5 border border-dashed border-border rounded-md text-xs text-muted-foreground hover:border-foreground transition-colors print-hide"
        >
          <Plus className="inline h-3 w-3 mr-1" /> Thêm cảnh điểm / dịch vụ
        </button>
      </div>

      {/* ĂN TRƯA */}
      <div className="p-1.5 border-r border-gray-300 space-y-1 min-w-0 break-words">
        {selectedNhaTrua ? (
          editSel === "trua" ? (
            <div className="flex items-center gap-1">
              <SearchableSelect
                options={nhaHangOptions}
                value={String(selectedNhaTrua.id)}
                autoOpen
                onChange={(v) => {
                  const nid = v ? Number(v) : null;
                  if (nid !== selectedNhaTrua.id) update({ an_trua_nha_hang_id: nid, an_trua_set_menu_id: null });
                  setEditSel(null);
                }}
                placeholder="Chọn nhà hàng khác"
                className="h-7 text-xs flex-1"
              />
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Giữ nguyên" onClick={() => setEditSel(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
          <>
            <div className="flex items-center gap-1">
              <button type="button" title="Bấm để đổi nhà hàng"
                className="flex-1 min-w-0 px-2 py-1 rounded-md border border-green-200 bg-green-50 text-xs font-semibold text-green-800 break-words text-center hover:bg-green-100 hover:border-green-400 cursor-pointer transition-colors"
                onClick={async () => {
                  if (doanId && day.id && selectedNhaTrua) {
                    const result = await checkNhaHangDeletable(day.id, selectedNhaTrua.id, "trua", selectedNhaTrua.ten);
                    if (!result.ok) { toast.error(result.reason ?? "Không thể đổi"); return; }
                  }
                  setEditSel("trua");
                }}>
                {selectedNhaTrua.ten}
              </button>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 print-hide" onClick={async () => {
                // Pre-check: nếu đã save (day.id) và có doanId → check DNTT + booking_nh
                if (doanId && day.id && selectedNhaTrua) {
                  const result = await checkNhaHangDeletable(day.id, selectedNhaTrua.id, "trua", selectedNhaTrua.ten);
                  if (!result.ok) { toast.error(result.reason ?? "Không thể xóa"); return; }
                }
                update({ an_trua_nha_hang_id: null, an_trua_set_menu_id: null });
              }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <DetailLine item={selectedNhaTrua} />
            <SetMenuSelect
              nhaHangId={selectedNhaTrua.id}
              value={day.an_trua_set_menu_id ?? null}
              onChange={(id) => update({ an_trua_set_menu_id: id })}
            />
            <MealNote
              value={day.an_trua_ghi_chu}
              onChange={(v) => update({ an_trua_ghi_chu: v })}
            />
          </>
          )
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
      <div className="p-1.5 border-r border-gray-300 space-y-1 min-w-0 break-words">
        {selectedNhaToi ? (
          editSel === "toi" ? (
            <div className="flex items-center gap-1">
              <SearchableSelect
                options={nhaHangOptions}
                value={String(selectedNhaToi.id)}
                autoOpen
                onChange={(v) => {
                  const nid = v ? Number(v) : null;
                  if (nid !== selectedNhaToi.id) update({ an_toi_nha_hang_id: nid, an_toi_set_menu_id: null });
                  setEditSel(null);
                }}
                placeholder="Chọn nhà hàng khác"
                className="h-7 text-xs flex-1"
              />
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Giữ nguyên" onClick={() => setEditSel(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
          <>
            <div className="flex items-center gap-1">
              <button type="button" title="Bấm để đổi nhà hàng"
                className="flex-1 min-w-0 px-2 py-1 rounded-md border border-green-200 bg-green-50 text-xs font-semibold text-green-800 break-words text-center hover:bg-green-100 hover:border-green-400 cursor-pointer transition-colors"
                onClick={async () => {
                  if (doanId && day.id && selectedNhaToi) {
                    const result = await checkNhaHangDeletable(day.id, selectedNhaToi.id, "toi", selectedNhaToi.ten);
                    if (!result.ok) { toast.error(result.reason ?? "Không thể đổi"); return; }
                  }
                  setEditSel("toi");
                }}>
                {selectedNhaToi.ten}
              </button>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 print-hide" onClick={async () => {
                if (doanId && day.id && selectedNhaToi) {
                  const result = await checkNhaHangDeletable(day.id, selectedNhaToi.id, "toi", selectedNhaToi.ten);
                  if (!result.ok) { toast.error(result.reason ?? "Không thể xóa"); return; }
                }
                update({ an_toi_nha_hang_id: null, an_toi_set_menu_id: null });
              }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <DetailLine item={selectedNhaToi} />
            <SetMenuSelect
              nhaHangId={selectedNhaToi.id}
              value={day.an_toi_set_menu_id ?? null}
              onChange={(id) => update({ an_toi_set_menu_id: id })}
            />
            <MealNote
              value={day.an_toi_ghi_chu}
              onChange={(v) => update({ an_toi_ghi_chu: v })}
            />
          </>
          )
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
      <div className="p-1.5 border-r border-gray-300 space-y-1 min-w-0 break-words">
        {lockKhachSan ? (
          <div className="flex items-center gap-1.5 px-2 py-2 rounded-md bg-muted/40 text-[12px] text-muted-foreground italic">
            <Lock className="h-3 w-3" />
            Đã khoá ở mẫu seri
          </div>
        ) : selectedKS ? (
          editSel === "ks" ? (
            <div className="flex items-center gap-1">
              <SearchableSelect
                options={khachSanOptions}
                value={String(selectedKS.id)}
                autoOpen
                onChange={(v) => {
                  const nid = v ? Number(v) : null;
                  if (nid !== selectedKS.id) update({ khach_san_id: nid });
                  setEditSel(null);
                }}
                placeholder="Chọn khách sạn khác"
                className="h-7 text-xs flex-1"
              />
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" title="Giữ nguyên" onClick={() => setEditSel(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
          <>
            <div className="flex items-center gap-1">
              <button type="button" title="Bấm để đổi khách sạn"
                className="flex-1 min-w-0 px-2 py-1 rounded-md border border-green-200 bg-green-50 text-xs font-semibold text-green-800 break-words text-center hover:bg-green-100 hover:border-green-400 cursor-pointer transition-colors"
                onClick={async () => {
                  if (doanId && selectedKS) {
                    const result = await checkKhachSanDeletable(doanId, selectedKS.id, selectedKS.ten);
                    if (!result.ok) { toast.error(result.reason ?? "Không thể đổi"); return; }
                  }
                  setEditSel("ks");
                }}>
                {selectedKS.ten}
              </button>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 print-hide" onClick={async () => {
                if (doanId && selectedKS) {
                  const result = await checkKhachSanDeletable(doanId, selectedKS.id, selectedKS.ten);
                  if (!result.ok) { toast.error(result.reason ?? "Không thể xóa"); return; }
                }
                update({ khach_san_id: null });
              }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <DetailLine item={selectedKS} />
          </>
          )
        ) : (
          <SearchableSelect
            options={khachSanOptions}
            value=""
            onChange={(v) => update({ khach_san_id: v ? Number(v) : null })}
            placeholder="Chọn"
            className="h-7 text-xs"
          />
        )}
        {!lockKhachSan && (
          <>
            <textarea
              className={`w-full min-h-[24px] text-[13px] border rounded-md px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-ring ${day.ks_ma_code?.trim() ? "bg-violet-50 text-violet-800 border-violet-200" : "bg-background border-border"}`}
              value={day.ks_ma_code}
              onChange={(e) => update({ ks_ma_code: e.target.value })}
              placeholder="Mã code đặt phòng"
              rows={1}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
            />
            <textarea
              className={`w-full min-h-[24px] text-[13px] border rounded-md px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-ring ${day.ks_loai_phong?.trim() ? "bg-violet-50 text-violet-800 border-violet-200" : "bg-background border-border"}`}
              value={day.ks_loai_phong}
              onChange={(e) => update({ ks_loai_phong: e.target.value })}
              placeholder="Loại phòng: 2 TWN, 1 DBL..."
              rows={1}
              onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }}
            />
          </>
        )}
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
