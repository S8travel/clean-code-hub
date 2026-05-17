import { useState, useMemo } from "react";
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
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  useThongBaoList,
  useThongBaoTotalUnread,
  useMarkAllRead,
  useMarkOneRead,
  useRealtimeThongBao,
  type ThongBaoRow,
} from "@/hooks/use-thong-bao";

interface Props {
  userId: string | null | undefined;
}

const ICON_BY_LOAI: Record<string, string> = {
  // Deadline
  deadline:                  "🔥",
  deadline_lock_phong:       "🔥",
  deadline_booking:          "🔥",
  // Công việc
  giao_viec:                 "💼",
  dntt_can_duyet:            "✅",
  // Tiền / Invoice
  gia:                       "💰",
  // Sự cố
  su_co:                     "⚠️",
  // Lead
  lead_moi:                  "🆕",
  lead_chuyen_giao:          "👥",
  lead_qua_han:              "🔥",
  lead_follow_up_today:      "⏰",
  lead_lanh:                 "🥶",
};

const TAB_FILTER: Record<string, (loai: string) => boolean> = {
  all:       () => true,
  deadline:  (l) => l.startsWith("deadline") || l === "lead_qua_han" || l === "lead_follow_up_today",
  cong_viec: (l) => l === "giao_viec" || l === "dntt_can_duyet",
  khac:      (l) => !l.startsWith("deadline") && l !== "giao_viec" && l !== "dntt_can_duyet" && l !== "lead_qua_han" && l !== "lead_follow_up_today",
};

function iconFor(loai: string) {
  return ICON_BY_LOAI[loai] ?? "🔔";
}

function groupByTime(items: ThongBaoRow[]) {
  const groups: { label: string; items: ThongBaoRow[] }[] = [
    { label: "Hôm nay",   items: [] },
    { label: "Hôm qua",   items: [] },
    { label: "Tuần này",  items: [] },
    { label: "Cũ hơn",    items: [] },
  ];
  for (const it of items) {
    const d = new Date(it.created_at);
    if (isToday(d))           groups[0].items.push(it);
    else if (isYesterday(d))  groups[1].items.push(it);
    else if (isThisWeek(d))   groups[2].items.push(it);
    else                      groups[3].items.push(it);
  }
  return groups.filter((g) => g.items.length > 0);
}

function targetUrl(tb: ThongBaoRow): string | null {
  const { loai, doan_id, cong_viec_id } = tb;
  if (loai.startsWith("deadline") && doan_id) return `/doan/${doan_id}`;
  if (loai === "giao_viec" && cong_viec_id)   return `/my-job?cong_viec=${cong_viec_id}`;
  if (loai === "dntt_can_duyet")              return `/de-nghi-thanh-toan`;
  if (loai === "su_co" && doan_id)            return `/doan/${doan_id}?tab=log`;
  if (loai.startsWith("lead_"))               return `/leads`;
  if (loai === "gia" && doan_id)              return `/doan/${doan_id}`;
  return null;
}

export function NotificationBell({ userId }: Props) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState("all");
  const [desktopOn, setDesktopOn] = useState(() => desktopNotifEnabled());

  const { data: unread = 0 } = useThongBaoTotalUnread(userId);
  const { data: list = [] }  = useThongBaoList(userId);

  const markAll = useMarkAllRead();
  const markOne = useMarkOneRead();

  // Realtime subscribe (one-shot per user) + popup desktop khi click thì điều hướng
  useRealtimeThongBao(userId, (tb) => {
    if (!tb.is_read) markOne.mutate(tb.id);
    const url = targetUrl(tb);
    if (url) nav(url);
  });

  const toggleDesktop = async () => {
    if (desktopOn) {
      disableDesktopNotif();
      setDesktopOn(false);
      toast.success("Đã tắt thông báo desktop");
      return;
    }
    if (!desktopNotifSupported()) {
      toast.error("Trình duyệt không hỗ trợ thông báo desktop");
      return;
    }
    if (desktopNotifPermission() === "denied") {
      toast.error("Trình duyệt đã chặn quyền thông báo — hãy mở lại trong cài đặt trình duyệt cho trang này");
      return;
    }
    const ok = await enableDesktopNotif();
    setDesktopOn(ok);
    if (ok) toast.success("Đã bật thông báo desktop");
    else toast.error("Chưa cấp quyền thông báo");
  };

  // Filter theo tab + lấy 15 cái mới nhất
  const filtered = useMemo(() => {
    const fn = TAB_FILTER[tab] ?? TAB_FILTER.all;
    return list.filter((tb) => fn(tb.loai)).slice(0, 15);
  }, [list, tab]);

  const grouped = useMemo(() => groupByTime(filtered), [filtered]);

  const handleItemClick = (tb: ThongBaoRow) => {
    if (!tb.is_read) markOne.mutate(tb.id);
    const url = targetUrl(tb);
    if (url) {
      setOpen(false);
      nav(url);
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
          aria-label="Thông báo"
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
          <h3 className="text-sm font-semibold">Thông báo</h3>
          <div className="flex items-center gap-2">
            {desktopNotifSupported() && (
              <button
                onClick={toggleDesktop}
                title={desktopOn ? "Tắt thông báo desktop" : "Bật thông báo desktop"}
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
              Đã đọc tất cả
            </button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 h-9 mx-2 mt-2">
            <TabsTrigger value="all"       className="text-xs">Tất cả</TabsTrigger>
            <TabsTrigger value="deadline"  className="text-xs">Deadline</TabsTrigger>
            <TabsTrigger value="cong_viec" className="text-xs">Công việc</TabsTrigger>
            <TabsTrigger value="khac"      className="text-xs">Khác</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-0">
            <div className="max-h-[400px] overflow-y-auto">
              {grouped.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-muted-foreground">
                  <Bell className="h-8 w-8 opacity-30 mb-2" />
                  <p className="text-xs">Chưa có thông báo</p>
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
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(tb.created_at), { addSuffix: true, locale: vi })}
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
            Xem tất cả thông báo →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
