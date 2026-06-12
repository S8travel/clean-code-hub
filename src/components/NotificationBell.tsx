import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, BellRing, BellOff } from "lucide-react";
import { toast } from "sonner";
import {
  desktopNotifSupported,
  desktopNotifEnabled,
  enableDesktopNotif,
  disableDesktopNotif,
  desktopNotifPermission,
} from "@/lib/desktop-notify";
import { subscribePush, unsubscribePush } from "@/lib/push-notify";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  TAB_FILTER, iconFor, groupByTime, targetUrl,
  fmtThongBaoTime, fmtThongBaoRelative,
} from "@/lib/thong-bao-utils";
import {
  useThongBaoList,
  useThongBaoTotalUnread,
  useMarkAllRead,
  useMarkOneRead,
  useRealtimeThongBao,
  type ThongBaoRow,
} from "@/hooks/use-thong-bao";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  userId: string | null | undefined;
}

export function NotificationBell({ userId }: Props) {
  useTranslate();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState("all");
  const [desktopOn, setDesktopOn] = useState(() => desktopNotifEnabled());

  const { data: unread = 0 } = useThongBaoTotalUnread(userId);
  const { data: list = [] }  = useThongBaoList(userId);

  const markAll = useMarkAllRead();
  const markOne = useMarkOneRead();

  // Realtime subscribe (one-shot per user) + popup desktop khi click thì điều hướng.
  // targetUrl truyền thêm để đường SW (Android) nhúng URL đích vào notification data.
  useRealtimeThongBao(
    userId,
    (tb) => {
      if (!tb.is_read) markOne.mutate(tb.id);
      const url = targetUrl(tb);
      if (url) nav(url);
    },
    targetUrl,
  );

  // Notification bắn qua SW (Android PWA): click → sw-notify.js postMessage về
  // trang đang mở. Ref để listener (đăng ký 1 lần) luôn dùng nav/markOne mới nhất.
  const navRef = useRef(nav);
  const markOneRef = useRef(markOne.mutate);
  useEffect(() => {
    navRef.current = nav;
    markOneRef.current = markOne.mutate;
  });
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; id?: number; url?: string } | null;
      if (!d || d.type !== "THONG_BAO_CLICK") return;
      if (typeof d.id === "number") markOneRef.current(d.id);
      if (d.url && d.url !== "/") navRef.current(d.url);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  const toggleDesktop = async () => {
    if (desktopOn) {
      disableDesktopNotif();
      setDesktopOn(false);
      void unsubscribePush(); // gỡ Web Push cho máy này (best-effort)
      toast.success(t("Đã tắt thông báo desktop"));
      return;
    }
    if (!desktopNotifSupported()) {
      toast.error(t("Trình duyệt không hỗ trợ thông báo desktop"));
      return;
    }
    if (desktopNotifPermission() === "denied") {
      toast.error(t("Trình duyệt đã chặn quyền thông báo — hãy mở lại trong cài đặt trình duyệt cho trang này"));
      return;
    }
    const ok = await enableDesktopNotif();
    setDesktopOn(ok);
    if (ok) {
      toast.success(t("Đã bật thông báo desktop"));
      // Web Push (app đóng vẫn nhận) — optional: fail im lặng thì vẫn còn Tier-1
      if (userId) void subscribePush(userId);
    } else {
      toast.error(t("Chưa cấp quyền thông báo"));
    }
  };

  // Refresh push subscription mỗi lần vào app: push service có thể xoay endpoint,
  // và last_seen_at giúp dọn subscription chết lâu ngày. Chỉ chạy khi toggle đang bật.
  useEffect(() => {
    if (userId && desktopNotifEnabled()) void subscribePush(userId);
  }, [userId]);

  // Filter theo tab + lấy 15 cái mới nhất
  const filtered = useMemo(() => {
    const fn = TAB_FILTER[tab] ?? TAB_FILTER.all;
    return list.filter((tb) => fn(tb.loai)).slice(0, 15);
  }, [list, tab]);

  const grouped = useMemo(() => groupByTime(filtered), [filtered]);

  const handleItemClick = (tb: ThongBaoRow) => {
    const url = targetUrl(tb);
    if (!tb.is_read) markOne.mutate(tb.id);
    if (url) {
      setOpen(false);
      nav(url);
    } else {
      // Không có trang liên kết → báo rõ thay vì im lặng (tránh cảm giác "click hỏng")
      toast(t("Thông báo chỉ để xem — không có trang chi tiết"));
    }
  };

  const handleMarkAll = () => {
    if (!userId || unread === 0) return;
    markAll.mutate(userId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={t("Thông báo")}
          className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted transition-colors"
        >
          <Bell className={cn("h-5 w-5", unread > 0 && "text-foreground")} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 animate-pulse">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[380px] p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">{t("Thông báo")}</h3>
          <div className="flex items-center gap-2">
            {desktopNotifSupported() && (
              <button
                onClick={toggleDesktop}
                title={desktopOn ? t("Tắt thông báo desktop") : t("Bật thông báo desktop")}
                className={cn(
                  "flex items-center justify-center h-6 w-6 rounded transition-colors",
                  desktopOn
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {desktopOn ? <BellRing className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              </button>
            )}
            <button
              onClick={handleMarkAll}
              disabled={unread === 0 || markAll.isPending}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-primary disabled:opacity-50 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {t("Đã đọc tất cả")}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 h-9 mx-2 mt-2">
            <TabsTrigger value="all"       className="text-xs">{t("Tất cả")}</TabsTrigger>
            <TabsTrigger value="deadline"  className="text-xs">{t("Deadline")}</TabsTrigger>
            <TabsTrigger value="cong_viec" className="text-xs">{t("Công việc")}</TabsTrigger>
            <TabsTrigger value="khac"      className="text-xs">{t("Khác")}</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-0">
            <div className="max-h-[400px] overflow-y-auto">
              {grouped.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <Bell className="h-8 w-8 opacity-30 mb-2" />
                  <p className="text-xs">{t("Chưa có thông báo")}</p>
                </div>
              ) : (
                grouped.map((g) => (
                  <div key={g.label}>
                    <div className="px-4 py-1.5 bg-muted/50 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                      {g.label}
                    </div>
                    {g.items.map((tb) => (
                      <button
                        key={tb.id}
                        onClick={() => handleItemClick(tb)}
                        className={cn(
                          "w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left border-b border-border/40",
                          !tb.is_read && "bg-primary/[0.03]"
                        )}
                      >
                        {/* Unread dot */}
                        <span className={cn(
                          "shrink-0 mt-1 h-2 w-2 rounded-full",
                          tb.is_read ? "bg-transparent" : "bg-blue-500"
                        )} />

                        <span className="text-base shrink-0 leading-none mt-0.5">
                          {iconFor(tb.loai)}
                        </span>

                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs leading-snug", !tb.is_read && "font-semibold")}>
                            {tb.tieu_de}
                          </p>
                          {tb.noi_dung && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {tb.noi_dung}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                            {fmtThongBaoTime(tb.created_at)} · {fmtThongBaoRelative(tb.created_at)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="border-t px-2 py-1.5">
          <button
            onClick={() => { setOpen(false); nav("/thong-bao"); }}
            className="w-full text-xs text-center py-1.5 rounded hover:bg-muted text-primary font-medium"
          >
            {t("Xem tất cả thông báo →")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
