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
import { SearchableSelect } from "@/components/SearchableSelect";
import { useLockPhongList, useLockPhongDeadlineAlerts, type LockPhongDisplay } from "@/hooks/use-lock-phong";
import { useKhachSanList } from "@/hooks/use-khach-san";
import { useCurrentSession } from "@/hooks/use-current-user";
import LockPhongTheoKSView from "@/components/lock-phong/LockPhongTheoKSView";
import LockPhongFormDialog from "@/components/lock-phong/LockPhongFormDialog";
import { format, parseISO, differenceInDays, addDays } from "date-fns";

type DeadlineFilter = "all" | "qua_han" | "sap_den" | "con_xa" | "da_book";
type EmailFilter = "all" | "chua_gui" | "cho_xac_nhan" | "da_xac_nhan" | "da_huy";

export default function LockPhongPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LockPhongDisplay | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterKsId, setFilterKsId] = useState<string>("all");
  const [checkInFrom, setCheckInFrom] = useState<Date | undefined>();
  const [checkInTo, setCheckInTo] = useState<Date | undefined>();
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");

  const { session } = useCurrentSession();
  const { data = [], isLoading } = useLockPhongList();
  const { data: ksList = [] } = useKhachSanList();
  const deadlineAlerts = useLockPhongDeadlineAlerts(session?.user?.id ?? null);

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
      // Email status
      if (emailFilter !== "all" && !lp.hotels?.some((h) => h.email_status === emailFilter)) {
        return false;
      }
      return true;
    });
  }, [data, search, filterKsId, checkInFrom, checkInTo, deadlineFilter, emailFilter]);

  const hasActiveFilter =
    !!search ||
    filterKsId !== "all" ||
    !!checkInFrom ||
    !!checkInTo ||
    deadlineFilter !== "all" ||
    emailFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setFilterKsId("all");
    setCheckInFrom(undefined);
    setCheckInTo(undefined);
    setDeadlineFilter("all");
    setEmailFilter("all");
  };

  const handleAddNew = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 space-y-4">
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
              <SelectValue placeholder="Deadline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">⏰ Mọi deadline</SelectItem>
              <SelectItem value="qua_han">🔴 Quá hạn</SelectItem>
              <SelectItem value="sap_den">🟠 Sắp đến (≤3 ngày)</SelectItem>
              <SelectItem value="con_xa">🟢 Còn xa</SelectItem>
              <SelectItem value="da_book">✅ Đã book xong</SelectItem>
            </SelectContent>
          </Select>

          <Select value={emailFilter} onValueChange={(v) => setEmailFilter(v as EmailFilter)}>
            <SelectTrigger className="h-8 text-sm w-[170px]">
              <SelectValue placeholder="Trạng thái email" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">✉️ Mọi trạng thái</SelectItem>
              <SelectItem value="chua_gui">Chưa gửi</SelectItem>
              <SelectItem value="cho_xac_nhan">Chờ KS xác nhận</SelectItem>
              <SelectItem value="da_xac_nhan">KS đã xác nhận</SelectItem>
              <SelectItem value="da_huy">Đã hủy</SelectItem>
            </SelectContent>
          </Select>

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

      {/* Active filter summary */}
      {hasActiveFilter && (
        <p className="text-xs text-muted-foreground -mt-1">
          Hiển thị {filtered.length}/{data.length} lock · nhóm theo Khách sạn
        </p>
      )}

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
