import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Printer, Trash2 } from "lucide-react";
import { exportMenuOverviewWord, exportMenuXihongWord, type MenuWordMeal } from "@/lib/export-menu-word";
import { externalSupabase } from "@/lib/supabase-external";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  useUpsertBookingNH,
  useUpdateBookingNH,
  type MenuDayData,
  type BookingNHRow,
} from "@/hooks/use-booking-nh";
import { cn } from "@/lib/utils";

function fmtDay(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM (EEE)", { locale: vi }); } catch { return d; }
}

interface MonListEditorProps {
  doanId: number;
  doanNgayId: number;
  buaAn: "trua" | "toi";
  nhaHangId: number | null;
  booking: BookingNHRow | null;
  onUpdated: () => void;
}

function MonListEditor({ doanId, doanNgayId, buaAn, nhaHangId, booking, onUpdated }: MonListEditorProps) {
  const upsertMut = useUpsertBookingNH();
  const updateMut = useUpdateBookingNH();
  const [monList, setMonList] = useState<string[]>(booking?.mon_an_snapshot ?? []);
  const [newMon, setNewMon] = useState("");

  // Fallback: snapshot rỗng nhưng đã có set menu → lấy món từ catalog để hiển thị.
  // Pattern khớp với MealColumn — user có thể edit, save sẽ persist lại snapshot.
  useEffect(() => {
    if (!booking?.set_menu_id) return;
    if ((booking?.mon_an_snapshot?.length ?? 0) > 0) return;
    externalSupabase
      .from("nha_hang_set_menu_mon")
      .select("ten_mon")
      .eq("set_menu_id", booking.set_menu_id)
      .order("thu_tu", { ascending: true })
      .then(({ data }) => {
        const mons = (data ?? []).map((m: any) => m.ten_mon as string);
        if (mons.length > 0) setMonList(mons);
      });
  }, [booking?.set_menu_id]);

  if (!nhaHangId) {
    return <span className="text-xs text-muted-foreground/40 italic">Không có nhà hàng</span>;
  }

  const save = (next: string[], extras: Partial<BookingNHRow> = {}) => {
    const payload = {
      doan_id: doanId,
      doan_ngay_id: doanNgayId,
      bua_an: buaAn,
      nha_hang_id: nhaHangId,
      mon_an_snapshot: next,
      booking_status: booking?.booking_status ?? "chua_gui",
      ...extras,
    };
    if (booking?.id) {
      updateMut.mutate({ id: booking.id, doan_id: doanId, mon_an_snapshot: next, ...extras }, { onSuccess: onUpdated });
    } else {
      upsertMut.mutate(payload as any, { onSuccess: onUpdated });
    }
  };

  const handleAdd = () => {
    if (!newMon.trim()) return;
    const next = [...monList, newMon.trim()];
    setMonList(next);
    setNewMon("");
    save(next);
  };

  const handleRemove = (i: number) => {
    const next = monList.filter((_, idx) => idx !== i);
    setMonList(next);
    save(next);
  };

  const handleBlur = () => save(monList);

  return (
    <div className="space-y-1 min-w-[160px]">
      {/* Set menu name — locked from điều tour, display only */}
      {booking?.ten_set_snapshot && (
        <div className="pb-1.5 border-b border-border/50">
          <span className="text-xs font-medium text-foreground">{booking.ten_set_snapshot}</span>
        </div>
      )}
      {monList.length === 0 ? (
        <p className="text-xs text-muted-foreground/50 italic">Chưa có món</p>
      ) : (
        <ul className="space-y-0.5">
          {monList.map((mon, i) => (
            <li key={i} className="flex items-center gap-1 group">
              <span className="text-muted-foreground text-xs w-4 shrink-0">{i + 1}.</span>
              <input
                className="flex-1 text-xs bg-transparent border-none outline-none hover:bg-muted/50 focus:bg-muted/50 px-1 rounded min-w-0"
                value={mon}
                onChange={(e) => {
                  const next = [...monList];
                  next[i] = e.target.value;
                  setMonList(next);
                }}
                onBlur={handleBlur}
              />
              <button
                onClick={() => handleRemove(i)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1 pt-1">
        <input
          className="flex-1 text-xs border border-input rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring min-w-0"
          placeholder="Thêm món..."
          value={newMon}
          onChange={(e) => setNewMon(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button
          onClick={handleAdd}
          className="text-muted-foreground hover:text-foreground shrink-0 p-0.5"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  chua_gui:    "bg-muted-foreground/30",
  da_gui:      "bg-amber-400",
  nh_xac_nhan: "bg-emerald-500",
  da_huy:      "bg-red-400",
};

interface Props {
  open: boolean;
  onClose: () => void;
  doanId: number;
  days: MenuDayData[];
  onUpdated: () => void;
  tenDoan?: string;
  soKhach?: number;
  hdvTen?: string;
}

export default function MenuOverviewModal({ open, onClose, doanId, days, onUpdated, tenDoan, soKhach, hdvTen }: Props) {
  const daysWithNH = days.filter(
    (d) => d.an_trua_nha_hang_id || d.an_toi_nha_hang_id
  );

  // Fallback: bookings có set_menu_id nhưng mon_an_snapshot rỗng → fetch catalog
  // (giống MonListEditor) để tránh in ra "Chưa có món" khi user chưa edit thủ công.
  const fetchMonsFallback = async (): Promise<Record<number, string[]>> => {
    const ids = new Set<number>();
    for (const day of daysWithNH) {
      if (day.booking_trua?.set_menu_id && (day.booking_trua.mon_an_snapshot?.length ?? 0) === 0) {
        ids.add(day.booking_trua.set_menu_id);
      }
      if (day.booking_toi?.set_menu_id && (day.booking_toi.mon_an_snapshot?.length ?? 0) === 0) {
        ids.add(day.booking_toi.set_menu_id);
      }
    }
    if (ids.size === 0) return {};
    const { data } = await externalSupabase
      .from("nha_hang_set_menu_mon")
      .select("set_menu_id, ten_mon, thu_tu")
      .in("set_menu_id", [...ids])
      .order("thu_tu", { ascending: true });
    const map: Record<number, string[]> = {};
    for (const row of data ?? []) {
      if (!map[row.set_menu_id]) map[row.set_menu_id] = [];
      map[row.set_menu_id].push(row.ten_mon as string);
    }
    return map;
  };

  const resolveMonList = (b: BookingNHRow | null, fallbackMap: Record<number, string[]>) => {
    const snap = b?.mon_an_snapshot ?? [];
    if (snap.length > 0) return snap;
    if (b?.set_menu_id && fallbackMap[b.set_menu_id]) return fallbackMap[b.set_menu_id];
    return [];
  };

  const handlePrint = async () => {
    const fallbackMap = await fetchMonsFallback();
    const wordDays = daysWithNH.map((day) => ({
      ngay_so: day.ngay_so,
      ngay_date: day.ngay_date,
      trua: day.an_trua_nha_hang_id
        ? { ten_nh: day.an_trua_nha_hang_ten ?? "", mon_list: resolveMonList(day.booking_trua, fallbackMap), mon_list_zh: [] }
        : null,
      toi: day.an_toi_nha_hang_id
        ? { ten_nh: day.an_toi_nha_hang_ten ?? "", mon_list: resolveMonList(day.booking_toi, fallbackMap), mon_list_zh: [] }
        : null,
    }));
    await exportMenuOverviewWord({ tenDoan: tenDoan ?? "", hdvTen: hdvTen ?? "", soKhach: soKhach ?? 0, days: wordDays });
  };

  const handlePrintXihong = async () => {
    // Collect set_menu_ids to fetch Chinese dish names
    const setMenuIds = new Set<number>();
    for (const day of daysWithNH) {
      if (day.booking_trua?.set_menu_id) setMenuIds.add(day.booking_trua.set_menu_id);
      if (day.booking_toi?.set_menu_id) setMenuIds.add(day.booking_toi.set_menu_id);
    }

    // Fetch Chinese dish names + VN fallback (theo thu_tu) từ nha_hang_set_menu_mon
    const zhMap: Record<number, Record<string, string>> = {};
    const monsFallback: Record<number, string[]> = {};
    const ghiChuMap: Record<number, string | null> = {};
    if (setMenuIds.size > 0) {
      const ids = [...setMenuIds];
      const [{ data: monRows }, { data: smRows }] = await Promise.all([
        externalSupabase
          .from("nha_hang_set_menu_mon")
          .select("set_menu_id, ten_mon, ten_mon_trung, thu_tu")
          .in("set_menu_id", ids)
          .order("thu_tu", { ascending: true }),
        externalSupabase
          .from("nha_hang_set_menu")
          .select("id, ghi_chu")
          .in("id", ids),
      ]);
      for (const row of monRows ?? []) {
        if (!zhMap[row.set_menu_id]) zhMap[row.set_menu_id] = {};
        zhMap[row.set_menu_id][row.ten_mon] = row.ten_mon_trung ?? "";
        if (!monsFallback[row.set_menu_id]) monsFallback[row.set_menu_id] = [];
        monsFallback[row.set_menu_id].push(row.ten_mon as string);
      }
      for (const sm of smRows ?? []) {
        ghiChuMap[sm.id] = sm.ghi_chu ?? null;
      }
    }

    const buildMeal = (nhId: number | null, nhTen: string | null, booking: BookingNHRow | null): MenuWordMeal | null => {
      if (!nhId) return null;
      const lookup = booking?.set_menu_id ? (zhMap[booking.set_menu_id] ?? {}) : {};
      let monList = booking?.mon_an_snapshot ?? [];
      if (monList.length === 0 && booking?.set_menu_id && monsFallback[booking.set_menu_id]) {
        monList = monsFallback[booking.set_menu_id];
      }
      return {
        ten_nh: nhTen ?? "",
        ten_set: booking?.ten_set_snapshot ?? null,
        gia: booking?.gia_snapshot ?? null,
        don_vi: booking?.don_vi_snapshot ?? null,
        ghi_chu_set: booking?.set_menu_id ? (ghiChuMap[booking.set_menu_id] ?? null) : null,
        mon_list: monList,
        mon_list_zh: monList.map((m) => lookup[m] ?? ""),
      };
    };

    const wordDays = daysWithNH.map((day) => ({
      ngay_so: day.ngay_so,
      ngay_date: day.ngay_date,
      trua: buildMeal(day.an_trua_nha_hang_id, day.an_trua_nha_hang_ten, day.booking_trua),
      toi:  buildMeal(day.an_toi_nha_hang_id,  day.an_toi_nha_hang_ten,  day.booking_toi),
    }));

    await exportMenuXihongWord({ tenDoan: tenDoan ?? "", hdvTen: hdvTen ?? "", soKhach: soKhach ?? 0, days: wordDays });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Menu tổng quan cả đoàn</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={daysWithNH.length === 0}>
            <Printer className="h-4 w-4 mr-1.5" /> In menu
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrintXihong} disabled={daysWithNH.length === 0}>
            <Printer className="h-4 w-4 mr-1.5" /> In kiểu Xihong
          </Button>
        </div>

        {daysWithNH.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Chưa có nhà hàng nào được chỉ định trong điều tour.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium border border-border w-[100px]">Ngày</th>
                  <th className="text-left px-3 py-2 font-medium border border-border">
                    🍱 Bữa trưa
                  </th>
                  <th className="text-left px-3 py-2 font-medium border border-border">
                    🍽 Bữa tối
                  </th>
                </tr>
              </thead>
              <tbody>
                {daysWithNH.map((day) => (
                  <tr key={day.doan_ngay_id} className="border-b border-border align-top hover:bg-muted/20 transition-colors">
                    {/* Ngày */}
                    <td className="px-3 py-3 border border-border">
                      <p className="font-medium text-xs">Ngày {day.ngay_so}</p>
                      <p className="text-muted-foreground text-xs">{fmtDay(day.ngay_date)}</p>
                    </td>

                    {/* Trưa */}
                    <td className="px-3 py-3 border border-border">
                      {day.an_trua_nha_hang_id ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <div className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              STATUS_DOT[day.booking_trua?.booking_status ?? "chua_gui"]
                            )} />
                            <span className="text-xs font-medium">{day.an_trua_nha_hang_ten}</span>
                          </div>
                          <MonListEditor
                            doanId={doanId}
                            doanNgayId={day.doan_ngay_id}
                            buaAn="trua"
                            nhaHangId={day.an_trua_nha_hang_id}
                            booking={day.booking_trua}
                            onUpdated={onUpdated}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40 italic">—</span>
                      )}
                    </td>

                    {/* Tối */}
                    <td className="px-3 py-3 border border-border">
                      {day.an_toi_nha_hang_id ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <div className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              STATUS_DOT[day.booking_toi?.booking_status ?? "chua_gui"]
                            )} />
                            <span className="text-xs font-medium">{day.an_toi_nha_hang_ten}</span>
                          </div>
                          <MonListEditor
                            doanId={doanId}
                            doanNgayId={day.doan_ngay_id}
                            buaAn="toi"
                            nhaHangId={day.an_toi_nha_hang_id}
                            booking={day.booking_toi}
                            onUpdated={onUpdated}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40 italic">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="font-medium">Trạng thái:</span>
              {[
                { cls: "bg-muted-foreground/30", label: "Chưa gửi" },
                { cls: "bg-amber-400",           label: "Đã gửi" },
                { cls: "bg-emerald-500",          label: "Xác nhận" },
                { cls: "bg-red-400",              label: "Đã hủy" },
              ].map(({ cls, label }) => (
                <span key={label} className="flex items-center gap-1">
                  <span className={cn("w-2 h-2 rounded-full", cls)} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
