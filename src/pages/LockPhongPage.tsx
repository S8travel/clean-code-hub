import { useMemo, useState } from "react";
import {
  Plus, Lock, AlertTriangle, Search, X, CalendarIcon,
  Clock, Mail, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useLockPhongList, useLockPhongDeadlineAlerts, type LockPhongDisplay } from "@/hooks/use-lock-phong";
import { useKhachSanList } from "@/hooks/use-khach-san";
import { useCurrentSession } from "@/hooks/use-current-user";
import { useAuth } from "@/hooks/use-auth";
import LockPhongTheoKSView from "@/components/lock-phong/LockPhongTheoKSView";
import LockPhongTheoDeadlineView from "@/components/lock-phong/LockPhongTheoDeadlineView";
import LockPhongFormDialog from "@/components/lock-phong/LockPhongFormDialog";
import { format, addDays } from "date-fns";

type DeadlineFilter = "all" | "qua_han" | "sap_den" | "con_xa" | "da_book";
type OutcomeStatus = "cho_xu_ly" | "thanh_doan" | "da_huy";
type ViewMode = "theo_ks" | "theo_deadline";
type Tab = "all" | "can_xu_ly" | "qua_han" | "sap_den" | "chua_gui" | "cho_xu_ly" | "da_xac_nhan";

const OUTCOME_OPTIONS: { value: OutcomeStatus; label: string }[] = [
  { value: "cho_xu_ly",  label: "Chờ xử lý" },
  { value: "thanh_doan", label: "Thành đoàn" },
  { value: "da_huy",     label: "Đã hủy" },
];

// Phân loại 1 lock_phong theo trạng thái booking/deadline
function lpCat(lp: LockPhongDisplay, today: string, today3: string) {
  const hotels = lp.hotels ?? [];
  const confirmed = hotels.length > 0 && hotels.every((h) => h.email_status === "da_xac_nhan");
  const hasChuaGui = hotels.some((h) => h.email_status === "chua_gui");
  const dl = lp.deadline;
  const quaHan = !!dl && dl < today && !confirmed;
  const sapDen = !!dl && dl >= today && dl <= today3 && !confirmed;
  const choXuLy =
    !confirmed &&
    hotels.some((h) => (h.outcome_status ?? null) === null && h.email_status !== "da_xac_nhan");
  return { confirmed, hasChuaGui, quaHan, sapDen, choXuLy };
}

// (Đã bỏ "Tổng quan Lock Phòng" / donut theo yêu cầu)

export default function LockPhongPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LockPhongDisplay | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("theo_ks");
  const [tab, setTab] = useState<Tab>("all");

  // Filters
  const [search, setSearch] = useState("");
  const [filterKsId, setFilterKsId] = useState<string>("all");
  const [checkInFrom, setCheckInFrom] = useState<Date | undefined>();
  const [checkInTo, setCheckInTo] = useState<Date | undefined>();
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<Set<OutcomeStatus>>(
    () => new Set<OutcomeStatus>(["cho_xu_ly", "thanh_doan"]),
  );
  const toggleOutcome = (v: OutcomeStatus) =>
    setOutcomeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v); else next.add(v);
      return next;
    });

  const { session } = useCurrentSession();
  const { user } = useAuth();
  const includeAll = user?.bo_phan === "dieu_hanh" || user?.role === "admin";
  const { data = [], isLoading } = useLockPhongList();
  const { data: ksList = [] } = useKhachSanList();
  const deadlineAlerts = useLockPhongDeadlineAlerts(session?.user?.id ?? null, { includeAll });

  const ksOptions = useMemo(
    () => [
      { value: "all", label: "Tất cả khách sạn" },
      ...ksList.map((k) => ({ value: String(k.id), label: k.ten ?? "" })),
    ],
    [ksList],
  );

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const today3Str = format(addDays(new Date(), 3), "yyyy-MM-dd");

  // Thống kê tổng (theo toàn bộ data, không phụ thuộc tab/filter)
  const stats = useMemo(() => {
    let total = data.length, quaHan = 0, sapDen = 0, chuaGui = 0, daXN = 0, choXuLy = 0;
    for (const lp of data) {
      const c = lpCat(lp, todayStr, today3Str);
      if (c.quaHan) quaHan++;
      if (c.sapDen) sapDen++;
      if (c.hasChuaGui) chuaGui++;
      if (c.confirmed) daXN++;
      if (c.choXuLy) choXuLy++;
    }
    return {
      total, quaHan, sapDen, chuaGui, daXN, choXuLy,
      canXuLy: deadlineAlerts.length,
    };
  }, [data, todayStr, today3Str, deadlineAlerts.length]);

  const filtered = useMemo(() => {
    const ciFrom = checkInFrom ? format(checkInFrom, "yyyy-MM-dd") : null;
    const ciTo = checkInTo ? format(checkInTo, "yyyy-MM-dd") : null;

    return data.filter((lp) => {
      if (search) {
        const q = search.toLowerCase();
        const m = lp.ten_doan?.toLowerCase().includes(q) || lp.ten_seri?.toLowerCase().includes(q);
        if (!m) return false;
      }
      if (filterKsId !== "all" && !lp.hotels?.some((h) => String(h.khach_san_id) === filterKsId)) {
        return false;
      }
      if (ciFrom || ciTo) {
        const matchCi = lp.hotels?.some((h) => {
          if (!h.check_in) return false;
          if (ciFrom && h.check_in < ciFrom) return false;
          if (ciTo && h.check_in > ciTo) return false;
          return true;
        });
        if (!matchCi) return false;
      }
      if (deadlineFilter !== "all") {
        if (deadlineFilter === "da_book") {
          const allConfirmed =
            (lp.hotels?.length ?? 0) > 0 &&
            lp.hotels!.every((h) => h.email_status === "da_xac_nhan");
          if (!allConfirmed) return false;
        } else if (lp.deadline) {
          const dl = lp.deadline;
          if (deadlineFilter === "qua_han" && dl >= todayStr) return false;
          if (deadlineFilter === "sap_den" && (dl < todayStr || dl > today3Str)) return false;
          if (deadlineFilter === "con_xa" && dl <= today3Str) return false;
        } else {
          return false;
        }
      }
      if (outcomeFilter.size === 0) return false;
      if (outcomeFilter.size < 3) {
        const matched = lp.hotels?.some((h) => {
          const status: OutcomeStatus = (h.outcome_status as OutcomeStatus | null) ?? "cho_xu_ly";
          return outcomeFilter.has(status);
        });
        if (!matched) return false;
      }
      // Tab nhanh (5 thẻ / hàng tab)
      if (tab !== "all") {
        const c = lpCat(lp, todayStr, today3Str);
        if (tab === "can_xu_ly" && !(c.quaHan || c.sapDen)) return false;
        if (tab === "qua_han" && !c.quaHan) return false;
        if (tab === "sap_den" && !c.sapDen) return false;
        if (tab === "chua_gui" && !c.hasChuaGui) return false;
        if (tab === "cho_xu_ly" && !c.choXuLy) return false;
        if (tab === "da_xac_nhan" && !c.confirmed) return false;
      }
      return true;
    });
  }, [data, search, filterKsId, checkInFrom, checkInTo, deadlineFilter, outcomeFilter, tab, todayStr, today3Str]);

  const isOutcomeDefault =
    outcomeFilter.size === 2 && outcomeFilter.has("cho_xu_ly") && outcomeFilter.has("thanh_doan");
  const hasActiveFilter =
    !!search || filterKsId !== "all" || !!checkInFrom || !!checkInTo ||
    deadlineFilter !== "all" || !isOutcomeDefault || tab !== "all";

  const clearFilters = () => {
    setSearch("");
    setFilterKsId("all");
    setCheckInFrom(undefined);
    setCheckInTo(undefined);
    setDeadlineFilter("all");
    setOutcomeFilter(new Set<OutcomeStatus>(["cho_xu_ly", "thanh_doan"]));
    setTab("all");
  };

  const handleAddNew = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const statCards = [
    {
      key: "can_xu_ly" as Tab, label: "Lock phòng cần xử lý", count: stats.canXuLy,
      sub: "sắp đến deadline / quá hạn", icon: AlertTriangle,
      tile: "bg-orange-500", wrap: "bg-orange-50 border-orange-200", alert: true,
    },
    {
      key: "qua_han" as Tab, label: "Quá hạn", count: stats.quaHan, sub: "đoàn",
      icon: AlertTriangle, tile: "bg-red-500", wrap: "bg-card border-border", alert: false,
    },
    {
      key: "sap_den" as Tab, label: "Sắp đến hạn", count: stats.sapDen, sub: "đoàn (≤3 ngày)",
      icon: Clock, tile: "bg-amber-500", wrap: "bg-card border-border", alert: false,
    },
    {
      key: "chua_gui" as Tab, label: "Chưa gửi mail", count: stats.chuaGui, sub: "đoàn",
      icon: Mail, tile: "bg-blue-500", wrap: "bg-card border-border", alert: false,
    },
    {
      key: "da_xac_nhan" as Tab, label: "Đã xác nhận", count: stats.daXN, sub: "đoàn",
      icon: CheckCircle2, tile: "bg-emerald-500", wrap: "bg-card border-border", alert: false,
    },
  ];

  const tabs: { key: Tab; label: string; count: number; cls: string }[] = [
    { key: "all", label: "Tất cả", count: stats.total, cls: "text-foreground" },
    { key: "qua_han", label: "Quá hạn", count: stats.quaHan, cls: "text-red-600" },
    { key: "sap_den", label: "Sắp đến hạn", count: stats.sapDen, cls: "text-amber-600" },
    { key: "chua_gui", label: "Chưa gửi mail", count: stats.chuaGui, cls: "text-blue-600" },
    { key: "cho_xu_ly", label: "Chờ xử lý", count: stats.choXuLy, cls: "text-orange-600" },
    { key: "da_xac_nhan", label: "Đã xác nhận", count: stats.daXN, cls: "text-emerald-600" },
  ];

  return (
    <div className="mx-auto px-4 sm:px-6 py-6 space-y-4 max-w-[1600px]">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Lock Phòng</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Quản lý giữ phòng khách sạn theo seri, theo deadline
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map((s) => (
          <button
            key={s.key}
            onClick={() => setTab((t) => (t === s.key ? "all" : s.key))}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-shadow hover:shadow-md",
              s.wrap,
              tab === s.key && "ring-2 ring-primary/50",
            )}
          >
            <div className={cn("h-10 w-10 rounded-xl grid place-items-center text-white shrink-0", s.tile)}>
              <s.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground leading-snug">{s.label}</p>
              <p className="text-xl font-bold leading-tight">
                {s.count}{" "}
                <span className="text-[11px] font-normal text-muted-foreground">{s.sub}</span>
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Tabs + add */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5",
                tab === t.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card hover:bg-muted/50 border-border",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold",
                  tab === t.key ? "bg-white/25" : cn("bg-muted", t.cls),
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={handleAddNew}>
          <Plus className="h-3.5 w-3.5" />
          Thêm Lock Phòng
        </Button>
      </div>

      {/* Body (full width) */}
      <div className="space-y-4">
          {/* Toolbar — bộ lọc chi tiết */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Code đoàn / seri..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm pl-7 w-48"
              />
            </div>
            <SearchableSelect
              options={ksOptions}
              value={filterKsId}
              onChange={setFilterKsId}
              placeholder="Tất cả khách sạn"
              className="w-56 h-8 text-sm"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {checkInFrom ? format(checkInFrom, "dd/MM/yyyy") : "C/I từ"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={checkInFrom} onSelect={setCheckInFrom} initialFocus />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {checkInTo ? format(checkInTo, "dd/MM/yyyy") : "C/I đến"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={checkInTo} onSelect={setCheckInTo} initialFocus />
              </PopoverContent>
            </Popover>
            <Select value={deadlineFilter} onValueChange={(v) => setDeadlineFilter(v as DeadlineFilter)}>
              <SelectTrigger className="h-8 text-sm w-[160px]">
                <span>
                  {deadlineFilter === "all" ? "⏰ Mọi deadline"
                    : deadlineFilter === "qua_han" ? "🔴 Quá hạn"
                    : deadlineFilter === "sap_den" ? "🟠 Sắp đến (≤3 ngày)"
                    : deadlineFilter === "con_xa" ? "🟢 Còn xa"
                    : "✅ Đã book xong"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">⏰ Mọi deadline</SelectItem>
                <SelectItem value="qua_han">🔴 Quá hạn</SelectItem>
                <SelectItem value="sap_den">🟠 Sắp đến (≤3 ngày)</SelectItem>
                <SelectItem value="con_xa">🟢 Còn xa</SelectItem>
                <SelectItem value="da_book">✅ Đã book xong</SelectItem>
              </SelectContent>
            </Select>
            <div className="inline-flex items-center gap-3 h-8 px-2.5 rounded-md border border-border bg-background">
              {OUTCOME_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                >
                  <Checkbox
                    checked={outcomeFilter.has(opt.value)}
                    onCheckedChange={() => toggleOutcome(opt.value)}
                    className="h-3.5 w-3.5"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <div className="inline-flex rounded-md border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("theo_ks")}
                className={`px-3 py-1 text-xs h-8 transition-colors ${
                  viewMode === "theo_ks" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                }`}
              >
                Theo khách sạn
              </button>
              <button
                type="button"
                onClick={() => setViewMode("theo_deadline")}
                className={`px-3 py-1 text-xs h-8 border-l border-border transition-colors ${
                  viewMode === "theo_deadline" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                }`}
              >
                Theo deadline
              </button>
            </div>
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
                <X className="h-3 w-3" /> Xóa lọc ({filtered.length}/{data.length})
              </Button>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <Lock className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Chưa có lock phòng nào</p>
              <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={handleAddNew}>
                <Plus className="h-3.5 w-3.5" />
                Tạo lock phòng đầu tiên
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Không có lock phòng nào khớp bộ lọc</p>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Xóa lọc
              </Button>
            </div>
          ) : viewMode === "theo_deadline" ? (
            <LockPhongTheoDeadlineView data={filtered} />
          ) : (
            <LockPhongTheoKSView data={filtered} />
          )}
      </div>

      <LockPhongFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditTarget(null);
        }}
        initialData={editTarget}
      />
    </div>
  );
}
