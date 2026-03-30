import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Send, Check, X, RotateCcw, ChevronDown, ChevronUp, Plus, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  useUpsertBookingNH,
  useUpdateBookingNH,
  useDeleteBookingNH,
  useSetMenuOptions,
  useSetMenuMons,
  type BookingNHRow,
} from "@/hooks/use-booking-nh";
import { cn } from "@/lib/utils";

const STATUS_CFG = {
  chua_gui:    { label: "Chưa gửi",      cls: "bg-muted text-muted-foreground" },
  da_gui:      { label: "Đã gửi",         cls: "bg-amber-100 text-amber-700" },
  nh_xac_nhan: { label: "Đã xác nhận",   cls: "bg-emerald-100 text-emerald-700" },
  da_huy:      { label: "Đã hủy",         cls: "bg-red-100 text-red-700" },
};

function fmtDatetime(d: string | null | undefined) {
  if (!d) return "";
  try { return format(new Date(d), "dd/MM HH:mm", { locale: vi }); } catch { return ""; }
}

function TrackingDot({ label, time, active, by }: { label: string; time?: string | null; active: boolean; by?: string | null }) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5 min-w-[60px]", active ? "text-foreground" : "text-muted-foreground/40")}>
      <div className={cn("w-2.5 h-2.5 rounded-full border-2 transition-colors", active ? "bg-primary border-primary" : "border-muted-foreground/30 bg-background")} />
      <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
      {time && <span className="text-[10px] text-muted-foreground">{fmtDatetime(time)}</span>}
      {by && <span className="text-[10px] text-muted-foreground/60">{by}</span>}
    </div>
  );
}

function TrackingLine({ active }: { active: boolean }) {
  return <div className={cn("flex-1 h-0.5 mb-4 transition-colors", active ? "bg-primary" : "bg-muted-foreground/20")} />;
}

interface Props {
  doanId: number;
  doanNgayId: number;
  buaAn: "trua" | "toi";
  nhaHangId: number | null;
  nhaHangTen: string | null;
  nhaHangEmail: string | null;
  booking: BookingNHRow | null;
  currentUserName: string;
  conTrongDieuTour?: boolean;
  setMenuIdFromDieuTour?: number | null;
}

export default function MealCard({
  doanId, doanNgayId, buaAn, nhaHangId, nhaHangTen, nhaHangEmail, booking, currentUserName,
  conTrongDieuTour = true, setMenuIdFromDieuTour,
}: Props) {
  const upsertMut = useUpsertBookingNH();
  const updateMut = useUpdateBookingNH();
  const deleteMut = useDeleteBookingNH();
  const { data: setMenuOptions = [] } = useSetMenuOptions(nhaHangId);

  // Set menu đang chọn: ưu tiên booking đã lưu, fallback về điều tour
  const [selectedSetMenuId, setSelectedSetMenuId] = useState<number | null>(
    booking?.set_menu_id ?? setMenuIdFromDieuTour ?? null,
  );
  const { data: setMenuMons = [] } = useSetMenuMons(selectedSetMenuId);

  const [expanded, setExpanded] = useState(true);
  const [monList, setMonList] = useState<string[]>(booking?.mon_an_snapshot ?? []);
  const [ghiChu, setGhiChu] = useState(booking?.ghi_chu ?? "");
  const [newMon, setNewMon] = useState("");

  // Sync khi booking thay đổi từ bên ngoài (overview modal)
  useEffect(() => {
    setMonList(booking?.mon_an_snapshot ?? []);
    setGhiChu(booking?.ghi_chu ?? "");
    setSelectedSetMenuId(booking?.set_menu_id ?? setMenuIdFromDieuTour ?? null);
  }, [booking?.id, JSON.stringify(booking?.mon_an_snapshot)]);

  // Khi set menu thay đổi và món load xong → tự fill danh sách món (nếu booking chưa gửi)
  useEffect(() => {
    if (setMenuMons.length === 0) return;
    const canOverwrite = !booking || booking.booking_status === "chua_gui";
    if (!canOverwrite) return;
    setMonList(setMenuMons);
    // Lưu món mới xuống DB ngay
    const menu = setMenuOptions.find((m) => m.id === selectedSetMenuId) ?? null;
    const payload = {
      doan_id: doanId,
      doan_ngay_id: doanNgayId,
      bua_an: buaAn,
      nha_hang_id: nhaHangId,
      mon_an_snapshot: setMenuMons,
      ghi_chu: ghiChu,
      booking_status: booking?.booking_status ?? "chua_gui",
      set_menu_id: selectedSetMenuId,
      ten_set_snapshot: menu?.ten_set ?? null,
      gia_snapshot: menu?.gia ?? null,
      don_vi_snapshot: menu?.don_vi ?? null,
    };
    if (booking?.id) {
      updateMut.mutate({ id: booking.id, doan_id: doanId, mon_an_snapshot: setMenuMons });
    } else if (selectedSetMenuId) {
      upsertMut.mutate(payload as any);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(setMenuMons), selectedSetMenuId]);

  if (!nhaHangId) return null;

  const status = booking?.booking_status as keyof typeof STATUS_CFG | undefined;
  const statusCfg = STATUS_CFG[status ?? "chua_gui"];
  const isCancelled = booking?.booking_status === "da_huy";

  const selectedMenu = setMenuOptions.find((m) => m.id === selectedSetMenuId) ?? null;

  const saveBooking = (overrides: Partial<BookingNHRow> = {}) => {
    const setMenuPayload = selectedSetMenuId
      ? {
          set_menu_id: selectedSetMenuId,
          ten_set_snapshot: selectedMenu?.ten_set ?? null,
          gia_snapshot: selectedMenu?.gia ?? null,
          don_vi_snapshot: selectedMenu?.don_vi ?? null,
        }
      : { set_menu_id: null, ten_set_snapshot: null, gia_snapshot: null, don_vi_snapshot: null };

    const payload = {
      doan_id: doanId,
      doan_ngay_id: doanNgayId,
      bua_an: buaAn,
      nha_hang_id: nhaHangId,
      mon_an_snapshot: monList,
      ghi_chu: ghiChu,
      booking_status: booking?.booking_status ?? "chua_gui",
      ...setMenuPayload,
      ...overrides,
    };
    if (booking?.id) {
      updateMut.mutate({ id: booking.id, doan_id: doanId, ...setMenuPayload, ...overrides });
    } else {
      upsertMut.mutate(payload as any);
    }
  };

  const handleSetMenuChange = (id: number | null) => {
    setSelectedSetMenuId(id);
    const menu = setMenuOptions.find((m) => m.id === id) ?? null;
    const setMenuPayload = {
      set_menu_id: id,
      ten_set_snapshot: menu?.ten_set ?? null,
      gia_snapshot: menu?.gia ?? null,
      don_vi_snapshot: menu?.don_vi ?? null,
    };
    if (booking?.id) {
      updateMut.mutate({ id: booking.id, doan_id: doanId, ...setMenuPayload });
    } else {
      upsertMut.mutate({
        doan_id: doanId,
        doan_ngay_id: doanNgayId,
        bua_an: buaAn,
        nha_hang_id: nhaHangId,
        mon_an_snapshot: monList,
        ghi_chu: ghiChu,
        booking_status: "chua_gui",
        ...setMenuPayload,
      } as any);
    }
  };

  const handleAddMon = () => {
    if (!newMon.trim()) return;
    const next = [...monList, newMon.trim()];
    setMonList(next);
    setNewMon("");
    saveBooking({ mon_an_snapshot: next });
  };

  const handleRemoveMon = (i: number) => {
    const next = monList.filter((_, idx) => idx !== i);
    setMonList(next);
    saveBooking({ mon_an_snapshot: next });
  };

  const handleMonBlur = () => saveBooking({ mon_an_snapshot: monList });

  // Status actions — chưa gửi email thật, chỉ cập nhật trạng thái
  const handleSend = () => {
    saveBooking({ booking_status: "da_gui", sent_at: new Date().toISOString(), sent_by: currentUserName });
    toast.success("Đã gửi booking");
  };
  const handleConfirm = () => {
    saveBooking({ booking_status: "nh_xac_nhan" });
    toast.success("Đã xác nhận");
  };
  const handleCancel = () => {
    if (booking?.id) {
      deleteMut.mutate({ id: booking.id, doan_id: doanId });
    }
    toast("Đã hủy");
  };
  const handleReset = () => {
    saveBooking({ booking_status: "chua_gui", sent_at: null, sent_by: null });
    toast("Đã đặt lại");
  };

  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden", isCancelled && "opacity-60", !conTrongDieuTour ? "border-amber-300" : "border-border")}>
      {/* Orphaned warning */}
      {!conTrongDieuTour && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5 text-xs text-amber-700">
          <X className="h-3 w-3 shrink-0" />
          Nhà hàng này đã bị xóa khỏi điều tour — booking vẫn được giữ lại
        </div>
      )}
      {/* Header */}
      <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase w-14 shrink-0">
          {buaAn === "trua" ? "🍱 Trưa" : "🍽 Tối"}
        </span>
        <span className="text-sm font-medium truncate">{nhaHangTen || "—"}</span>
        {booking?.ten_set_snapshot && (
          <span className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full shrink-0 max-w-[180px] truncate">
            {booking.ten_set_snapshot}
            {booking.gia_snapshot != null && (
              <span className="opacity-70">· {booking.gia_snapshot.toLocaleString("vi-VN")}{booking.don_vi_snapshot ? `/${booking.don_vi_snapshot}` : ""}</span>
            )}
          </span>
        )}
        {nhaHangEmail && (
          <span className="text-xs text-muted-foreground truncate max-w-[160px] hidden sm:block">{nhaHangEmail}</span>
        )}
        <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0", statusCfg.cls)}>
          {statusCfg.label}
        </span>
        <button onClick={() => setExpanded((v) => !v)} className="text-muted-foreground hover:text-foreground p-0.5">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <>
          {/* Set menu */}
          {setMenuOptions.length > 0 && (
            <div className="px-4 pt-3 pb-1">
              <p className="text-xs text-muted-foreground mb-1.5">Set menu</p>
              <select
                className="w-full text-sm border border-input rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedSetMenuId ?? ""}
                disabled={isCancelled}
                onChange={(e) => handleSetMenuChange(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">-- Không chọn --</option>
                {setMenuOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ten_set}{m.gia != null ? ` — ${m.gia.toLocaleString("vi-VN")}/${m.don_vi}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Danh sách món */}
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground mb-2">Danh sách món</p>
            {monList.length === 0 ? (
              <p className="text-xs text-muted-foreground/50 italic">Chưa có món nào</p>
            ) : (
              <ul className="space-y-1 mb-2">
                {monList.map((mon, i) => (
                  <li key={i} className="flex items-center gap-1.5 group">
                    <span className="text-muted-foreground text-xs w-4 shrink-0">{i + 1}.</span>
                    <input
                      className="flex-1 text-sm bg-transparent border-none outline-none hover:bg-muted/50 focus:bg-muted/50 px-1 rounded"
                      value={mon}
                      disabled={isCancelled}
                      onChange={(e) => {
                        const next = [...monList];
                        next[i] = e.target.value;
                        setMonList(next);
                      }}
                      onBlur={handleMonBlur}
                    />
                    {!isCancelled && (
                      <button
                        onClick={() => handleRemoveMon(i)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!isCancelled && (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  className="flex-1 text-sm border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Thêm món..."
                  value={newMon}
                  onChange={(e) => setNewMon(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMon()}
                />
                <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={handleAddMon}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Tracking + actions */}
          <div className="px-4 py-2.5 bg-muted/10 border-t border-border">
            <div className="flex items-center mb-3">
              <TrackingDot label="Tạo" time={null} active={true} />
              <TrackingLine active={!!booking?.sent_at} />
              <TrackingDot label="Gửi" time={booking?.sent_at} active={!!booking?.sent_at} by={booking?.sent_by} />
              <TrackingLine active={booking?.booking_status === "nh_xac_nhan"} />
              <TrackingDot label="Xác nhận" time={null} active={booking?.booking_status === "nh_xac_nhan"} />
            </div>

            <div className="flex items-start gap-3">
              <Textarea
                placeholder="Ghi chú..."
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                onBlur={() => saveBooking({ ghi_chu: ghiChu })}
                disabled={isCancelled}
                className="text-xs min-h-[40px] resize-none flex-1"
                rows={1}
              />
              <div className="flex flex-wrap gap-1 shrink-0">
                {(!booking || booking.booking_status === "chua_gui") && (
                  <Button size="sm" className="h-7 text-xs" onClick={handleSend}>
                    <Send className="h-3 w-3 mr-1" /> Gửi
                  </Button>
                )}
                {booking?.booking_status === "da_gui" && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleConfirm}>
                      <Check className="h-3 w-3 mr-1" /> Xác nhận
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSend}>
                      <Send className="h-3 w-3 mr-1" /> Gửi lại
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={handleCancel}>
                      <X className="h-3 w-3 mr-1" /> Hủy
                    </Button>
                  </>
                )}
                {booking?.booking_status === "nh_xac_nhan" && (
                  <>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSend}>
                      <Send className="h-3 w-3 mr-1" /> Gửi lại
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={handleCancel}>
                      <X className="h-3 w-3 mr-1" /> Hủy
                    </Button>
                  </>
                )}
                {isCancelled && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReset}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Đặt lại
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
