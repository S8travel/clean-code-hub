import { useMemo, useState } from "react";
import { Plus, Lock, AlertTriangle, Search, X, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/SearchableSelect";
import { useLockPhongList, useLockPhongDeadlineAlerts, type LockPhongDisplay } from "@/hooks/use-lock-phong";
import { useKhachSanList } from "@/hooks/use-khach-san";
import { useCurrentSession } from "@/hooks/use-current-user";
import { useAuth } from "@/hooks/use-auth";
import LockPhongTheoKSView from "@/components/lock-phong/LockPhongTheoKSView";
import LockPhongTheoDeadlineView from "@/components/lock-phong/LockPhongTheoDeadlineView";
import LockPhongFormDialog from "@/components/lock-phong/LockPhongFormDialog";
import { format, parseISO, differenceInDays, addDays } from "date-fns";

type DeadlineFilter = "all" | "qua_han" | "sap_den" | "con_xa" | "da_book";
type OutcomeStatus = "cho_xu_ly" | "thanh_doan" | "da_huy";
type ViewMode = "theo_ks" | "theo_deadline";

const OUTCOME_OPTIONS: { value: OutcomeStatus; label: string }[] = [
  { value: "cho_xu_ly",  label: "Chờ xử lý" },
  { value: "thanh_doan", label: "Thành đoàn" },
  { value: "da_huy",     label: "Đã hủy" },
];

export default function LockPhongPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LockPhongDisplay | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("theo_ks");

  // Filters
  const [search, setSearch] = useState("");
  const [filterKsId, setFilterKsId] = useState<string>("all");
  const [checkInFrom, setCheckInFrom] = useState<Date | undefined>();
  const [checkInTo, setCheckInTo] = useState<Date | undefined>();
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  // Outcome status: default chỉ "Chờ xử lý" + "Thành đoàn" — ẩn "Đã hủy"
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
  // Điều hành / admin: thấy alert deadline của TẤT CẢ lock phòng (không chỉ do mình tạo).
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

  const filtered = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const today3 = format(addDays(new Date(), 3), "yyyy-MM-dd");
    const ciFrom = checkInFrom ? format(checkInFrom, "yyyy-MM-dd") : null;
    const ciTo = checkInTo ? format(checkInTo, "yyyy-MM-dd") : null;

    return data.filter((lp) => {
      // Search
      if (search) {
        const q = search.toLowerCase();
        const m = lp.ten_doan?.toLowerCase().includes(q) || lp.ten_seri?.toLowerCase().includes(q);
        if (!m) return false;
      }
      // KS
      if (filterKsId !== "all" && !lp.hotels?.some((h) => String(h.khach_san_id) === filterKsId)) {
        return false;
      }
      // Check-in range
      if (ciFrom || ciTo) {
        const matchCi = lp.hotels?.some((h) => {
          if (!h.check_in) return false;
          if (ciFrom && h.check_in < ciFrom) return false;
          if (ciTo && h.check_in > ciTo) return false;
          return true;
        });
        if (!matchCi) return false;
      }
      // Deadline
      if (deadlineFilter !== "all") {
        if (deadlineFilter === "da_book") {
          const allConfirmed =
            (lp.hotels?.length ?? 0) > 0 &&
            lp.hotels!.every((h) => h.email_status === "da_xac_nhan");
          if (!allConfirmed) return false;
        } else if (lp.deadline) {
          const dl = lp.deadline;
          if (deadlineFilter === "qua_han" && dl >= today) return false;
          if (deadlineFilter === "sap_den" && (dl < today || dl > today3)) return false;
          if (deadlineFilter === "con_xa" && dl <= today3) return false;
        } else {
          // Không có deadline → bỏ qua khi user filter theo deadline
          return false;
        }
      }
      // Outcome status (cột Trạng thái) — match nếu BẤT KỲ ks row nào có outcome_status nằm trong set.
      // null trong DB = "cho_xu_ly".
      if (outcomeFilter.size === 0) return false; // user uncheck hết → ẩn
      if (outcomeFilter.size < 3) {
        const matched = lp.hotels?.some((h) => {
          const status: OutcomeStatus = (h.outcome_status as OutcomeStatus | null) ?? "cho_xu_ly";
          return outcomeFilter.has(status);
        });
        if (!matched) return false;
      }
      return true;
    });
  }, [data, search, filterKsId, checkInFrom, checkInTo, deadlineFilter, outcomeFilter]);

  // Default outcome filter = ["cho_xu_ly", "thanh_doan"] (ẩn da_huy)
  const isOutcomeDefault =
    outcomeFilter.size === 2 && outcomeFilter.has("cho_xu_ly") && outcomeFilter.has("thanh_doan");
  const hasActiveFilter =
    !!search ||
    filterKsId !== "all" ||
    !!checkInFrom ||
    !!checkInTo ||
    deadlineFilter !== "all" ||
    !isOutcomeDefault;

  const clearFilters = () => {
    setSearch("");
    setFilterKsId("all");
    setCheckInFrom(undefined);
    setCheckInTo(undefined);
    setDeadlineFilter("all");
    setOutcomeFilter(new Set<OutcomeStatus>(["cho_xu_ly", "thanh_doan"]));
  };

  const handleAddNew = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto px-4 sm:px-6 py-6 space-y-4 max-w-[1500px]">
      {/* Deadline alerts */}
      {deadlineAlerts.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-orange-700">
              {deadlineAlerts.length} lock phòng sắp đến deadline
            </p>
            <ul className="mt-1 space-y-0.5">
              {deadlineAlerts.map((lp) => {
                const dl = parseISO(lp.deadline!);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diff = differenceInDays(dl, today);
                return (
                  <li key={lp.id} className="text-xs text-orange-600">
                    <span className="font-medium">{lp.ten_doan}</span>
                    {" — deadline "}
                    <span className="font-medium">{format(dl, "dd/MM/yyyy")}</span>
                    {diff === 0 ? " (hôm nay)" : diff < 0 ? ` (quá hạn ${Math.abs(diff)} ngày)` : ` (còn ${diff} ngày)`}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Lock Phòng</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Đặt phòng trước theo seri, trước khi booking chính thức
        </p>
      </div>

      {/* Toolbar — filter bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1">
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

          {hasActiveFilter && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
              <X className="h-3 w-3" /> Xóa lọc
            </Button>
          )}
        </div>

        <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={handleAddNew}>
          <Plus className="h-3.5 w-3.5" />
          Thêm Lock Phòng
        </Button>
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-between gap-3 -mt-1">
        <div className="inline-flex rounded-md border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode("theo_ks")}
            className={`px-3 py-1 text-xs transition-colors ${
              viewMode === "theo_ks" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
            }`}
          >
            Theo khách sạn
          </button>
          <button
            type="button"
            onClick={() => setViewMode("theo_deadline")}
            className={`px-3 py-1 text-xs border-l border-border transition-colors ${
              viewMode === "theo_deadline" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
            }`}
          >
            Theo deadline
          </button>
        </div>
        {hasActiveFilter && (
          <p className="text-xs text-muted-foreground">
            Hiển thị {filtered.length}/{data.length} lock
          </p>
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
