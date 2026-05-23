import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errMsg } from "@/lib/error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Mail, Check, X, RotateCcw, Plus, Trash2, Loader2 } from "lucide-react";
import { externalSupabase } from "@/lib/supabase-external";
import {
  useSetMenuOptions,
  useSetMenuMons,
  useUpsertBookingNH,
  useUpdateBookingNH,
  type BookingNHRow,
} from "@/hooks/use-booking-nh";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  doanId: number;
  doanNgayId: number;
  buaAn: "trua" | "toi";
  nhaHangId: number | null;
  nhaHangTen: string | null;
  nhaHangEmail: string | null;
  booking: BookingNHRow | null;
  tenDoan: string;
  soKhach: number;
  ngayDate: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  chua_gui: { label: "Chưa gửi", className: "bg-muted text-muted-foreground" },
  da_gui: { label: "Đã gửi · chờ NH xác nhận", className: "bg-blue-100 text-blue-700" },
  nh_xac_nhan: { label: "NH xác nhận", className: "bg-teal-100 text-teal-700" },
  da_huy: { label: "Đã hủy", className: "bg-red-100 text-red-700" },
};

export default function MealColumn({
  doanId, doanNgayId, buaAn, nhaHangId, nhaHangTen, nhaHangEmail,
  booking, tenDoan, soKhach, ngayDate,
}: Props) {
  useTranslate();
  const { data: setMenuList = [] } = useSetMenuOptions(nhaHangId);
  const upsertMut = useUpsertBookingNH();
  const updateMut = useUpdateBookingNH();
  const queryClient = useQueryClient();

  // Local state
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null);
  const [monList, setMonList] = useState<string[]>([]);
  const [ghiChu, setGhiChu] = useState("");
  const [hasManualEdits, setHasManualEdits] = useState(false);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [pendingSetId, setPendingSetId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const status = booking?.booking_status || "chua_gui";
  const isDisabled = status === "da_huy";

  // Fetch mons for a new set menu selection
  const loadMonsForSet = useCallback(async (setId: number) => {
    const { data } = await externalSupabase
      .from("nha_hang_set_menu_mon")
      .select("ten_mon")
      .eq("set_menu_id", setId)
      .order("thu_tu", { ascending: true });
    return (data || []).map((m) => m.ten_mon);
  }, []);

  // Initialize from booking snapshot
  useEffect(() => {
    if (booking) {
      setSelectedSetId(booking.set_menu_id);
      const snapshot = Array.isArray(booking.mon_an_snapshot) ? booking.mon_an_snapshot : [];
      setMonList(snapshot);
      setGhiChu(booking.ghi_chu || "");
      setHasManualEdits(false);
      // If snapshot is empty but set_menu_id exists, load mons from catalog
      if (snapshot.length === 0 && booking.set_menu_id) {
        loadMonsForSet(booking.set_menu_id).then(mons => {
          if (mons.length > 0) {
            setMonList(mons);
          }
        });
      }
    } else {
      setSelectedSetId(null);
      setMonList([]);
      setGhiChu("");
      setHasManualEdits(false);
    }
  }, [booking, loadMonsForSet]);

  // Auto-save snapshot (debounce 800ms). Định nghĩa trước applySetMenu vì
  // applySetMenu phụ thuộc vào nó (tránh TDZ khi đưa vào dep array).
  const autoSaveSnapshot = useCallback((setId: number | null, mons: string[], note: string) => {
    if (!nhaHangId) return;
    const setMenu = setMenuList.find(s => s.id === setId);
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      upsertMut.mutate({
        doan_id: doanId,
        doan_ngay_id: doanNgayId,
        bua_an: buaAn,
        nha_hang_id: nhaHangId,
        set_menu_id: setId,
        ten_set_snapshot: setMenu?.ten_set || null,
        gia_snapshot: setMenu?.gia || null,
        don_vi_snapshot: setMenu?.don_vi || "VND",
        mon_an_snapshot: mons,
        ghi_chu: note || null,
      });
    }, 800);
  }, [doanId, doanNgayId, buaAn, nhaHangId, setMenuList, upsertMut]);

  const applySetMenu = useCallback(async (setId: number) => {
    setSelectedSetId(setId);
    const mons = await loadMonsForSet(setId);
    setMonList(mons);
    setHasManualEdits(false);
    // Auto-save snapshot
    autoSaveSnapshot(setId, mons, ghiChu);
  }, [loadMonsForSet, ghiChu, autoSaveSnapshot]);

  const handleSetMenuChange = useCallback(async (val: string) => {
    const setId = Number(val);
    if (hasManualEdits && monList.length > 0) {
      setPendingSetId(setId);
      setShowReplaceConfirm(true);
    } else {
      applySetMenu(setId);
    }
  }, [hasManualEdits, monList, applySetMenu]);

  const confirmReplace = useCallback(() => {
    if (pendingSetId) applySetMenu(pendingSetId);
    setShowReplaceConfirm(false);
    setPendingSetId(null);
  }, [pendingSetId, applySetMenu]);

  // Mon list handlers
  const updateMon = (idx: number, val: string) => {
    const next = [...monList];
    next[idx] = val;
    setMonList(next);
    setHasManualEdits(true);
    autoSaveSnapshot(selectedSetId, next, ghiChu);
  };

  const removeMon = (idx: number) => {
    const next = monList.filter((_, i) => i !== idx);
    setMonList(next);
    setHasManualEdits(true);
    autoSaveSnapshot(selectedSetId, next, ghiChu);
  };

  const addMon = () => {
    const next = [...monList, ""];
    setMonList(next);
    setHasManualEdits(true);
  };

  const handleGhiChuBlur = () => {
    autoSaveSnapshot(selectedSetId, monList, ghiChu);
  };

  // Send mail
  const handleSendMail = useCallback(async () => {
    if (!nhaHangEmail) {
      toast.error(t("Nhà hàng chưa có email"));
      return;
    }
    if (!selectedSetId || monList.length === 0) {
      toast.error(t("Vui lòng chọn set menu và danh sách món"));
      return;
    }
    setSending(true);
    try {
      const setMenu = setMenuList.find(s => s.id === selectedSetId);
      // Upsert with status da_gui
      const { error: upsertErr } = await externalSupabase
        .from("doan_booking_nh")
        .upsert({
          doan_id: doanId,
          doan_ngay_id: doanNgayId,
          bua_an: buaAn,
          nha_hang_id: nhaHangId,
          set_menu_id: selectedSetId,
          ten_set_snapshot: setMenu?.ten_set || null,
          gia_snapshot: setMenu?.gia || null,
          don_vi_snapshot: setMenu?.don_vi || "VND",
          mon_an_snapshot: monList,
          ghi_chu: ghiChu || null,
          booking_status: "da_gui",
          sent_at: new Date().toISOString(),
          sent_by: null,
        }, { onConflict: "doan_ngay_id,bua_an" });
      if (upsertErr) throw upsertErr;

      // Send email via edge function
      const dateStr = ngayDate ? new Date(ngayDate).toLocaleDateString("vi-VN") : "";
      const buaLabel = buaAn === "trua" ? "Ăn trưa" : "Ăn tối";

      await fetch("https://lflsbwoqzmbknzdpaequ.supabase.co/functions/v1/send-booking-nh-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: nhaHangEmail,
          ten_doan: tenDoan,
          ngay: dateStr,
          bua_an: buaLabel,
          ten_set: setMenu?.ten_set,
          gia: setMenu?.gia,
          don_vi: setMenu?.don_vi,
          mon_an: monList,
          ghi_chu: ghiChu,
          so_khach: soKhach,
        }),
      }).catch(() => {/* email send failure is non-blocking */});

      toast.success(t("✓ Đã gửi mail đặt bữa ăn"));
      // Invalidate to refetch fresh booking data
      queryClient.invalidateQueries({ queryKey: ["doan_booking_nh", doanId] });
    } catch (err: unknown) {
      toast.error(errMsg(err) || t("Lỗi gửi mail"));
    } finally {
      setSending(false);
    }
  }, [nhaHangEmail, selectedSetId, monList, ghiChu, doanId, doanNgayId, buaAn, nhaHangId, setMenuList, tenDoan, ngayDate, soKhach, queryClient]);

  // Status actions
  const handleConfirm = async () => {
    if (!booking?.id) return;
    await updateMut.mutateAsync({ id: booking.id, doan_id: doanId, booking_status: "nh_xac_nhan" });
    toast.success(t("✓ NH đã xác nhận"));
  };

  const handleCancel = async () => {
    if (!booking?.id) return;
    await updateMut.mutateAsync({ id: booking.id, doan_id: doanId, booking_status: "da_huy" });
    toast.success(t("Đã hủy booking"));
  };

  const handleReset = async () => {
    if (!booking?.id) return;
    await updateMut.mutateAsync({
      id: booking.id,
      doan_id: doanId,
      booking_status: "chua_gui",
      sent_at: null,
      sent_by: null,
    });
    toast.success(t("Đã đặt lại booking"));
  };

  const handleResend = async () => {
    await handleSendMail();
  };

  if (!nhaHangId) {
    return (
      <div className="text-sm text-muted-foreground italic p-3 bg-muted/30 rounded-lg">
        {t("Chưa chọn nhà hàng trong Điều tour")}
      </div>
    );
  }

  return (
    <div className={`space-y-3 p-3 rounded-lg border ${isDisabled ? "bg-red-50 opacity-70" : "bg-card"}`}>
      {/* Restaurant name */}
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{nhaHangTen}</span>
        <Badge variant="outline" className="text-xs">{t("Điều tour")}</Badge>
      </div>

      {/* Set menu dropdown */}
      <Select
        value={selectedSetId ? String(selectedSetId) : ""}
        onValueChange={handleSetMenuChange}
        disabled={isDisabled}
      >
        <SelectTrigger className="h-8 text-sm">
          <span>
            {(() => {
              const s = selectedSetId ? setMenuList.find((x) => x.id === selectedSetId) : null;
              return s ? `${s.ten_set} · ${s.gia ? `${s.gia.toLocaleString()} ${s.don_vi}` : ""}` : t("-- Chọn set menu --");
            })()}
          </span>
        </SelectTrigger>
        <SelectContent>
          {setMenuList.map(s => (
            <SelectItem key={s.id} value={String(s.id)}>
              {s.ten_set} · {s.gia ? `${s.gia.toLocaleString()} ${s.don_vi}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Mon list */}
      {monList.length > 0 && (
        <div className="space-y-1">
          {monList.map((mon, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{idx + 1}.</span>
              <Input
                value={mon}
                onChange={e => updateMon(idx, e.target.value)}
                className="h-7 text-sm flex-1"
                disabled={isDisabled}
              />
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => removeMon(idx)}
                disabled={isDisabled}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {!isDisabled && (
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={addMon}>
              <Plus className="h-3 w-3 mr-1" /> {t("Thêm món")}
            </Button>
          )}
        </div>
      )}

      {/* Ghi chu */}
      <Textarea
        value={ghiChu}
        onChange={e => setGhiChu(e.target.value)}
        onBlur={handleGhiChuBlur}
        placeholder={t("Ghi chú...")}
        rows={2}
        className="text-sm resize-none"
        disabled={isDisabled}
      />

      {/* Status + Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={STATUS_CONFIG[status]?.className || ""}>
          {t(STATUS_CONFIG[status]?.label || status)}
        </Badge>

        {booking?.sent_at && status !== "chua_gui" && (
          <span className="text-xs text-muted-foreground">
            {new Date(booking.sent_at).toLocaleString("vi-VN", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
            })}
          </span>
        )}

        <div className="flex gap-1 ml-auto">
          {status === "chua_gui" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSendMail} disabled={sending}>
              {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Mail className="h-3 w-3 mr-1" />}
              {t("Gửi mail")}
            </Button>
          )}

          {status === "da_gui" && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs text-teal-600" onClick={handleConfirm}>
                <Check className="h-3 w-3 mr-1" /> {t("NH đã xác nhận")}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleResend} disabled={sending}>
                <Mail className="h-3 w-3 mr-1" /> {t("Gửi lại")}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={handleCancel}>
                <X className="h-3 w-3 mr-1" /> {t("Hủy")}
              </Button>
            </>
          )}

          {status === "nh_xac_nhan" && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleResend} disabled={sending}>
                <Mail className="h-3 w-3 mr-1" /> {t("Gửi lại")}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={handleCancel}>
                <X className="h-3 w-3 mr-1" /> {t("Hủy")}
              </Button>
            </>
          )}

          {status === "da_huy" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleReset}>
              <RotateCcw className="h-3 w-3 mr-1" /> {t("Đặt lại")}
            </Button>
          )}
        </div>
      </div>

      {/* Replace confirm dialog */}
      <AlertDialog open={showReplaceConfirm} onOpenChange={setShowReplaceConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Thay đổi set menu?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Thay set menu sẽ mất các chỉnh sửa thủ công. Tiếp tục?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Hủy")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReplace}>{t("Tiếp tục")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
