import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { exportMenuOverviewWord, exportMenuXihongWord, type MenuWordMeal } from "@/lib/export-menu-word";
import { externalSupabase } from "@/lib/supabase-external";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  type MenuDayData,
  type BookingNHRow,
} from "@/hooks/use-booking-nh";
import { cn } from "@/lib/utils";

function fmtDay(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM (EEE)", { locale: vi }); } catch { return d; }
}

interface MonListViewProps {
  nhaHangId: number | null;
  booking: BookingNHRow | null;
}

// READ-ONLY: chỉ hiển thị danh sách món. Edit phải làm ở tab Booking NH
// (MealCard). Tổng quan menu chỉ để xem nhanh + in.
function MonListView({ nhaHangId, booking }: MonListViewProps) {
  const [monList, setMonList] = useState<string[]>(booking?.mon_an_snapshot ?? []);

  // Đồng bộ khi booking thay đổi từ ngoài (cascade từ điều tour hoặc edit ở MealCard).
  // mon_an_snapshot là array từ react-query — ref đổi khi nội dung đổi → bắt được
  // thay đổi nội dung mà không cần JSON.stringify. View-only nên không sợ đè edit.
  useEffect(() => {
    setMonList(booking?.mon_an_snapshot ?? []);
  }, [booking?.id, booking?.mon_an_snapshot]);

  // Fallback: snapshot rỗng nhưng đã có set menu → lấy từ catalog để hiển thị
  // (không persist — đây là view-only).
  useEffect(() => {
    if (!booking?.set_menu_id) return;
    if ((booking?.mon_an_snapshot?.length ?? 0) > 0) return;
    externalSupabase
      .from("nha_hang_set_menu_mon")
      .select("ten_mon")
      .eq("set_menu_id", booking.set_menu_id)
      .order("thu_tu", { ascending: true })
      .then(({ data }) => {
        const mons = (data ?? []).map((m) => m.ten_mon as string);
        if (mons.length > 0) setMonList(mons);
      });
  }, [booking?.set_menu_id, booking?.mon_an_snapshot]);

  if (!nhaHangId) {
    return <span className="text-xs text-muted-foreground/40 italic">Không có nhà hàng</span>;
  }

  return (
    <div className="space-y-1 min-w-[160px]">
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
            <li key={i} className="flex items-start gap-1 text-xs">
              <span className="text-muted-foreground w-4 shrink-0">{i + 1}.</span>
              <span className="flex-1 break-words">{mon}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[10px] text-muted-foreground/60 italic pt-1">
        Sửa món ở tab Booking NH
      </p>
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
                          <MonListView
                            nhaHangId={day.an_trua_nha_hang_id}
                            booking={day.booking_trua}
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
                          <MonListView
                            nhaHangId={day.an_toi_nha_hang_id}
                            booking={day.booking_toi}
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
