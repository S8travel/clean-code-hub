// Trang "Tất cả thông báo" — đích của nút "Xem tất cả thông báo →" trong
// NotificationBell. Phân trang server-side (useThongBaoInfinite), filter tab
// giống chuông, click item → đánh dấu đã đọc + điều hướng.
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCurrentSession } from "@/hooks/use-current-user";
import {
  useThongBaoInfinite,
  useThongBaoTotalUnread,
  useMarkAllRead,
  useMarkOneRead,
  type ThongBaoRow,
} from "@/hooks/use-thong-bao";
import {
  iconFor, groupByTime, targetUrl, fmtThongBaoTime, fmtThongBaoRelative,
} from "@/lib/thong-bao-utils";
import { t, useTranslate } from "@/lib/i18n";

export default function ThongBaoPage() {
  useTranslate();
  const nav = useNavigate();
  const { session } = useCurrentSession();
  const userId = session?.user?.id ?? null;
  const [tab, setTab] = useState("all");

  const { data: unread = 0 } = useThongBaoTotalUnread(userId);
  const {
    data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage,
  } = useThongBaoInfinite(userId, tab);

  const markAll = useMarkAllRead();
  const markOne = useMarkOneRead();

  const rows = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.rows),
    [data],
  );
  const total = data?.pages[0]?.total ?? 0;
  const grouped = useMemo(() => groupByTime(rows), [rows]);

  const handleItemClick = (tb: ThongBaoRow) => {
    const url = targetUrl(tb);
    if (!tb.is_read) markOne.mutate(tb.id);
    if (url) nav(url);
    else toast(t("Thông báo chỉ để xem — không có trang chi tiết"));
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("Tất cả thông báo")}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total.toLocaleString("vi-VN")} {t("thông báo")} · {unread.toLocaleString("vi-VN")} {t("chưa đọc")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => userId && markAll.mutate(userId)}
        >
          <CheckCheck className="h-3.5 w-3.5 mr-1" />
          {t("Đã đọc tất cả")}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 h-9 w-full">
          <TabsTrigger value="all"       className="text-xs">{t("Tất cả")}</TabsTrigger>
          <TabsTrigger value="deadline"  className="text-xs">{t("Deadline")}</TabsTrigger>
          <TabsTrigger value="cong_viec" className="text-xs">{t("Công việc")}</TabsTrigger>
          <TabsTrigger value="khac"      className="text-xs">{t("Khác")}</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-3">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : grouped.length === 0 ? (
              <div className="flex flex-col items-center py-14 text-muted-foreground">
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
                        "w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left border-b border-border/40",
                        !tb.is_read && "bg-primary/[0.03]",
                      )}
                    >
                      <span className={cn(
                        "shrink-0 mt-1.5 h-2 w-2 rounded-full",
                        tb.is_read ? "bg-transparent" : "bg-blue-500",
                      )} />
                      <span className="text-lg shrink-0 leading-none mt-0.5">
                        {iconFor(tb.loai)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm leading-snug", !tb.is_read && "font-semibold")}>
                          {tb.tieu_de}
                        </p>
                        {tb.noi_dung && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {tb.noi_dung}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                          {fmtThongBaoTime(tb.created_at)} · {fmtThongBaoRelative(tb.created_at)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}

            {/* Tải thêm */}
            {!isLoading && hasNextPage && (
              <div className="p-3 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  {t("Tải thêm")}
                </Button>
              </div>
            )}
            {!isLoading && !hasNextPage && rows.length > 0 && (
              <p className="p-3 text-center text-[11px] text-muted-foreground">
                {t("Đã hiển thị tất cả thông báo")}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
