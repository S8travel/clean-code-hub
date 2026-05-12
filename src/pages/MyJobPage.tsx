import { useMemo, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays, startOfMonth, endOfMonth, parseISO, isToday, isBefore } from "date-fns";
import { vi } from "date-fns/locale";
import {
  BriefcaseBusiness, CalendarClock, Users, ClipboardList,
  AlertCircle, AlertTriangle, Info, ArrowRight, Hotel, Utensils, Package, EyeOff,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDoanList } from "@/hooks/use-doan";
import { useTheodoi, type KSItem, type NHItem, type DVItem, type DNTTItem } from "@/hooks/use-theo-doi";
import { useAuth } from "@/hooks/use-auth";
import { useMyDeadlines, useMarkDeadlineDone, type DeadlineItem } from "@/hooks/use-my-job";
import { useMyTeamAssignments, useAllTeamAgents } from "@/hooks/use-teams";
import { useDoanLogGhiChu, useToggleResolved } from "@/hooks/use-doan-log";
import { useCongViecList } from "@/hooks/use-cong-viec";
import GiaoViecTab from "@/components/my-job/GiaoViecTab";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, StickyNote, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yy", { locale: vi }); } catch { return d; }
}

// ── KS overall status ─────────────────────────────────────────────────────────
function ksOverallStatus(dt: string, fn: string) {
  if (fn === "ks_xac_nhan_huy")     return { label: "✗ Đã hủy",           cls: "text-red-600" };
  if (fn === "cho_ks_xac_nhan_huy") return { label: "⏳ Chờ XN hủy",      cls: "text-orange-600" };
  if (fn === "ks_xac_nhan_final")   return { label: "✓ Final",             cls: "text-purple-600" };
  if (fn === "cho_ks_xac_nhan")     return { label: "⏳ Chờ XN Final",     cls: "text-green-600" };
  if (dt === "ks_xac_nhan")         return { label: "✓ Đặt trước XN",      cls: "text-teal-600" };
  if (dt === "cho_ks_xac_nhan")     return { label: "⏳ Chờ XN đặt trước", cls: "text-blue-600" };
  return { label: "○ Chưa gửi", cls: "text-muted-foreground" };
}

function nhStatusLabel(status: string) {
  if (status === "da_gui") return { label: "✓ Đã gửi", cls: "text-green-600" };
  return { label: "○ Chưa gửi", cls: "text-muted-foreground" };
}

function dvStatusLabel(status: string) {
  if (status === "da_xac_nhan")  return { label: "✓ Đã XN",   cls: "text-green-600" };
  if (status === "cho_xac_nhan") return { label: "⏳ Chờ XN", cls: "text-amber-600" };
  if (status === "da_huy")       return { label: "✗ Đã hủy",  cls: "text-red-600" };
  return { label: "○ Chưa gửi", cls: "text-muted-foreground" };
}

function dnttDuyetLabel(status: string) {
  if (status === "da_duyet") return { label: "✓ Đã duyệt",  cls: "text-green-600" };
  if (status === "cho_duyet") return { label: "⏳ Chờ duyệt", cls: "text-amber-600" };
  if (status === "tu_choi")   return { label: "✗ Từ chối",   cls: "text-red-600" };
  return { label: status, cls: "text-muted-foreground" };
}

function ttLabel(status: string) {
  if (status === "paid")    return { label: "✓ Đã TT",   cls: "text-green-600" };
  if (status === "partial") return { label: "Một phần",  cls: "text-amber-600" };
  return { label: "○ Chưa TT", cls: "text-muted-foreground" };
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function StatusBadge({ done, total, colorMode, children }: {
  done: number; total: number; colorMode?: "traffic"; children: React.ReactNode;
}) {
  if (total === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
  const pct = done / total;
  let cls = "bg-muted text-muted-foreground";
  if (colorMode === "traffic") {
    cls = pct === 0 ? "bg-red-100 text-red-700" : pct < 1 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700";
  } else {
    cls = pct === 1 ? "bg-green-100 text-green-700" : pct > 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground";
  }
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium cursor-default", cls)}>
      {children}
    </span>
  );
}

// ── InfoTooltip ───────────────────────────────────────────────────────────────
function InfoTooltip({ trigger, items }: {
  trigger: React.ReactNode;
  items: { label: string; sub?: string; statusLabel: string; statusCls: string }[];
}) {
  if (items.length === 0) return <>{trigger}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{trigger}</span>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs p-2 text-xs space-y-1">
        {items.map((it, i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <span className="text-left leading-tight">
              {it.label}
              {it.sub && <span className="text-muted-foreground ml-1">({it.sub})</span>}
            </span>
            <span className={cn("shrink-0 font-medium", it.statusCls)}>{it.statusLabel}</span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, cls }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; cls?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
      <div className={cn("p-2 rounded-lg shrink-0", cls ?? "bg-primary/10")}>
        <Icon className={cn("h-5 w-5", cls ? "text-white" : "text-primary")} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Role label ────────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  admin: "Quản trị viên",
  giam_doc: "Giám đốc",
  truong_phong: "Trưởng phòng",
  nhan_vien_cao_cap: "Nhân viên cao cấp",
  nhan_vien: "Nhân viên",
};

const BO_PHAN_LABELS: Record<string, string> = {
  dieu_hanh: "Điều hành",
  ke_toan: "Kế toán",
  sales: "Sales",
};

// ── Todo item type ────────────────────────────────────────────────────────────
type TodoItem = {
  priority: "high" | "medium" | "low";
  label: string;
  doanName: string;
  doanId: number;
};

// ── Deadline helpers ──────────────────────────────────────────────────────────
const TYPE_CFG = {
  ks: { icon: Hotel,    label: "KS",  cls: "bg-blue-100 text-blue-700" },
  nh: { icon: Utensils, label: "NH",  cls: "bg-orange-100 text-orange-700" },
  dv: { icon: Package,  label: "DV",  cls: "bg-purple-100 text-purple-700" },
};

function deadlineGroup(deadline: string): "overdue" | "today" | "week" | "later" {
  const d = parseISO(deadline);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  if (isBefore(d, now)) return "overdue";
  if (isToday(d)) return "today";
  if (differenceInDays(d, now) <= 7) return "week";
  return "later";
}

const GROUP_CFG = {
  overdue: { label: "Quá hạn",     cls: "text-red-600",   bg: "bg-red-50 border-red-200" },
  today:   { label: "Hôm nay",     cls: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  week:    { label: "7 ngày tới",  cls: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  later:   { label: "Sau đó",      cls: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

// ── Scope helpers ─────────────────────────────────────────────────────────────
const SCOPE_TO_LOAI: Record<string, string[]> = {
  ks:   ["khach_san"],
  nh:   ["nha_hang"],
  dv:   ["dich_vu"],
  xe:   ["xe"],
  visa: ["visa"],
};

function filterDNTTByScope(items: DNTTItem[], scope: Set<string>): DNTTItem[] {
  if (scope.has("all")) return items;
  return items.filter((item) => {
    const loai = item.ref_loai || item.loai;
    return [...scope].some((s) => SCOPE_TO_LOAI[s]?.includes(loai));
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MyJobPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const vanPhongId = user?.role !== "admin" ? (user?.van_phong_id ?? null) : null;
  const { data: allDoan = [], isLoading: loadingDoan } = useDoanList(vanPhongId);
  const { data: td, isLoading: loadingTD } = useTheodoi();

  const [search, setSearch] = useState("");
  const [trangThai, setTrangThai] = useState("dang_chay");

  const uid = user?.user_id;

  // ── Hủy theo dõi (localStorage, chỉ ảnh hưởng MyJobPage) ──────────────────
  const hiddenKey = uid ? `myjob_hidden_${uid}` : null;
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => {
    if (!uid) return new Set();
    try {
      const raw = localStorage.getItem(`myjob_hidden_${uid}`);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });

  // Đồng bộ localStorage khi uid load xong (trường hợp uid chưa có lúc init)
  useEffect(() => {
    if (!hiddenKey) return;
    try {
      const raw = localStorage.getItem(hiddenKey);
      if (raw) setHiddenIds(new Set(JSON.parse(raw)));
    } catch { /* ignore */ }
  }, [hiddenKey]);

  const hidesDoan = useCallback((doanId: number) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(doanId);
      if (hiddenKey) localStorage.setItem(hiddenKey, JSON.stringify([...next]));
      return next;
    });
  }, [hiddenKey]);

  // Team-based scope data
  const { data: myAssignments = [], isLoading: loadingAssignments } = useMyTeamAssignments(uid);
  const { data: allTeamAgents = [], isLoading: loadingTeamAgents } = useAllTeamAgents();

  const isLoading = loadingDoan || loadingTD || loadingAssignments || loadingTeamAgents;

  // agentId → Set<task_type> for current user
  const myAgentTaskMap = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const a of myAssignments) {
      for (const ta of allTeamAgents.filter((t) => t.team_id === a.team_id)) {
        if (!map.has(ta.agent_id)) map.set(ta.agent_id, new Set());
        map.get(ta.agent_id)!.add(a.task_type);
      }
    }
    return map;
  }, [myAssignments, allTeamAgents]);

  // Đoàn của tôi: thuộc team tôi phụ trách HOẶC mình là OP được gắn tên trên đoàn
  const myDoan = useMemo(
    () =>
      (allDoan as any[]).filter(
        (d) =>
          (d.agent_id && myAgentTaskMap.has(d.agent_id)) ||
          d.assigned_to === uid,
      ),
    [allDoan, myAgentTaskMap, uid],
  );

  // doanId → scope: gộp từ team assignment + scope OP (nh, dv)
  const myDoanScopeMap = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const d of myDoan) {
      const scope = new Set<string>();
      // Scope từ team assignment
      if (d.agent_id && myAgentTaskMap.has(d.agent_id)) {
        for (const s of myAgentTaskMap.get(d.agent_id)!) scope.add(s);
      }
      // Scope từ OP: thêm nh + dv nếu mình là OP của đoàn
      if (d.assigned_to === uid) {
        scope.add("nh");
        scope.add("dv");
      }
      map.set(d.id, scope);
    }
    return map;
  }, [myDoan, myAgentTaskMap, uid]);

  const myDoanIds = useMemo(() => myDoan.map((d: any) => d.id as number), [myDoan]);
  const { data: deadlines = [], isLoading: loadingDeadlines } = useMyDeadlines(myDoanIds);
  const markDone = useMarkDeadlineDone();

  // Lọc deadline theo scope của từng đoàn
  const filteredDeadlines = useMemo(
    () =>
      deadlines.filter((item) => {
        const scope = myDoanScopeMap.get(item.doanId);
        if (!scope || scope.size === 0) return false;
        if (scope.has("all")) return true;
        return scope.has(item.type); // "ks" | "nh" | "dv"
      }),
    [deadlines, myDoanScopeMap],
  );

  const { data: ghiChuLogs = [] } = useDoanLogGhiChu(user?.user_id);
  const toggleResolved = useToggleResolved();

  const { data: congViecTasks = [] } = useCongViecList(uid);
  const giaoViecPending = congViecTasks.filter(
    (t) => t.nguoi_nhan === uid && (t.trang_thai === "cho_nhan" || t.trang_thai === "dang_lam"),
  ).length;

  // Rows cho bảng (với booking status)
  const rows = useMemo(() => {
    if (!myDoan || !td) return [];
    return myDoan
      .filter((g) => {
        if (hiddenIds.has(g.id)) return false;
        if (trangThai !== "all" && g.trang_thai !== trangThai) return false;
        if (search && !g.ten_doan.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .map((g) => {
        const id: number = g.id;
        const scope = myDoanScopeMap.get(id) ?? new Set<string>();
        const showKS = scope.has("all") || scope.has("ks");
        const showNH = scope.has("all") || scope.has("nh");
        const showDV = scope.has("all") || scope.has("dv");

        const ks: KSItem[]   = showKS ? td.ksList.filter((r) => r.doan_id === id) : [];
        const ksFinal        = ks.filter((r) => r.ks_final_status === "ks_xac_nhan_final").length;
        const nh: NHItem[]   = showNH ? td.nhList.filter((r) => r.doan_id === id) : [];
        const nhSent         = nh.filter((r) => r.booking_status === "da_gui" || r.booking_status === "khong_dat").length;
        const dv: DVItem[]   = showDV ? td.dvList.filter((r) => r.doan_id === id) : [];
        const dvXN           = dv.filter((r) => r.booking_status === "da_xac_nhan" || r.booking_status === "khong_dat").length;
        const dntt: DNTTItem[] = filterDNTTByScope(td.dnttList.filter((r) => r.doan_id === id), scope);
        const dnttDuyet      = dntt.filter((r) => r.trang_thai_duyet === "da_duyet").length;
        const dnttDaTT       = dntt.filter((r) => r.payment_status === "paid").length;
        return { g, ks, ksFinal, nh, nhSent, dv, dvXN, dntt, dnttDuyet, dnttDaTT };
      });
  }, [myDoan, td, search, trangThai]);

  // KPI stats
  const stats = useMemo(() => {
    const now = new Date();
    const in7 = new Date(now); in7.setDate(in7.getDate() + 7);
    const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
    const monthEnd   = format(endOfMonth(now), "yyyy-MM-dd");

    const dangChay = myDoan.filter((d) => d.trang_thai === "dang_chay").length;
    const sapKhoiHanh = myDoan.filter((d) => {
      if (!d.ngay_di) return false;
      const di = new Date(d.ngay_di + "T00:00:00");
      return di >= now && di <= in7;
    }).length;
    const tongKhachThang = myDoan
      .filter((d) => d.ngay_di && d.ngay_di >= monthStart && d.ngay_di <= monthEnd)
      .reduce((s: number, d: any) => s + (d.so_khach ?? 0), 0);

    // Đoàn đang chạy có booking chưa hoàn tất (trong phạm vi scope)
    const choBooking = myDoan.filter((d) => {
      if (d.trang_thai !== "dang_chay") return false;
      if (!td) return false;
      const id = d.id;
      const scope = myDoanScopeMap.get(id) ?? new Set<string>();
      const showKS = scope.has("all") || scope.has("ks");
      const showNH = scope.has("all") || scope.has("nh");
      const showDV = scope.has("all") || scope.has("dv");
      const ks = showKS ? td.ksList.filter((r) => r.doan_id === id) : [];
      const nh = showNH ? td.nhList.filter((r) => r.doan_id === id) : [];
      const dv = showDV ? td.dvList.filter((r) => r.doan_id === id) : [];
      const ksOk = ks.every((r) => r.ks_final_status === "ks_xac_nhan_final");
      const nhOk = nh.every((r) => r.booking_status === "da_gui" || r.booking_status === "khong_dat");
      const dvOk = dv.every((r) => r.booking_status === "da_xac_nhan" || r.booking_status === "khong_dat");
      return !ksOk || !nhOk || !dvOk;
    }).length;

    return { dangChay, sapKhoiHanh, choBooking, tongKhachThang };
  }, [myDoan, td, myDoanScopeMap]);

  // Việc cần xử lý
  const todos = useMemo((): TodoItem[] => {
    if (!td) return [];
    const now = new Date();
    const items: TodoItem[] = [];

    for (const d of myDoan) {
      if (d.trang_thai === "huy" || d.trang_thai === "hoan_thanh") continue;
      const id = d.id;
      const name = d.ten_doan;
      const daysLeft = d.ngay_di ? differenceInDays(new Date(d.ngay_di + "T00:00:00"), now) : null;

      const scope = myDoanScopeMap.get(id) ?? new Set<string>();
      const showKS = scope.has("all") || scope.has("ks");
      const showNH = scope.has("all") || scope.has("nh");
      const showDV = scope.has("all") || scope.has("dv");

      const ks   = showKS ? td.ksList.filter((r) => r.doan_id === id) : [];
      const nh   = showNH ? td.nhList.filter((r) => r.doan_id === id) : [];
      const dv   = showDV ? td.dvList.filter((r) => r.doan_id === id) : [];
      const dntt = filterDNTTByScope(td.dnttList.filter((r) => r.doan_id === id), scope);

      const ksNotFinal = ks.filter((r) => r.ks_final_status !== "ks_xac_nhan_final").length;
      const nhNotSent  = nh.filter((r) => r.booking_status !== "da_gui" && r.booking_status !== "khong_dat").length;
      const dvNotXN    = dv.filter((r) => r.booking_status !== "da_xac_nhan" && r.booking_status !== "khong_dat").length;
      const dnttPending = dntt.filter((r) => r.trang_thai_duyet === "cho_duyet").length;
      const hasBookingIssue = ksNotFinal > 0 || nhNotSent > 0 || dvNotXN > 0;

      // HIGH: sắp đi trong 3 ngày mà còn việc
      if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && hasBookingIssue) {
        items.push({ priority: "high", label: `Ngày đi còn ${daysLeft} ngày — còn booking chưa xong`, doanName: name, doanId: id });
      } else {
        // MEDIUM: booking cụ thể chưa xong
        if (ksNotFinal > 0) items.push({ priority: "medium", label: `Booking KS: ${ksNotFinal} chỗ chưa final`, doanName: name, doanId: id });
        if (nhNotSent > 0)  items.push({ priority: "medium", label: `Booking NH: ${nhNotSent} bữa chưa gửi`, doanName: name, doanId: id });
        if (dvNotXN > 0)    items.push({ priority: "medium", label: `Booking DV: ${dvNotXN} dịch vụ chưa xác nhận`, doanName: name, doanId: id });
        // MEDIUM: ĐNTT chờ duyệt
        if (dnttPending > 0) items.push({ priority: "medium", label: `${dnttPending} phiếu ĐNTT đang chờ duyệt`, doanName: name, doanId: id });
        // LOW: sắp đi trong 7 ngày
        if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && !hasBookingIssue) {
          items.push({ priority: "low", label: `Ngày khởi hành còn ${daysLeft} ngày`, doanName: name, doanId: id });
        }
      }
    }

    // Sắp xếp: high → medium → low
    const order = { high: 0, medium: 1, low: 2 };
    return items.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 10);
  }, [myDoan, td, myDoanScopeMap]);

  const priorityConfig = {
    high:   { icon: AlertCircle,   cls: "text-red-600",    bg: "bg-red-50 border-red-100" },
    medium: { icon: AlertTriangle, cls: "text-amber-600",  bg: "bg-amber-50 border-amber-100" },
    low:    { icon: Info,          cls: "text-blue-500",   bg: "bg-blue-50 border-blue-100" },
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <BriefcaseBusiness className="h-5 w-5 text-primary" />
            Công việc của tôi
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Xin chào, <span className="font-medium text-foreground">{user?.ho_ten ?? "—"}</span>
            {user?.role && <> · {ROLE_LABELS[user.role] ?? user.role}</>}
            {user?.bo_phan && <> · {BO_PHAN_LABELS[user.bo_phan] ?? user.bo_phan}</>}
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="tong-quan">
          <TabsList className="h-9">
            <TabsTrigger value="tong-quan" className="text-xs">Tổng quan</TabsTrigger>
            <TabsTrigger value="deadline" className="text-xs">
              Deadline
              {filteredDeadlines.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                  {filteredDeadlines.filter((d) => deadlineGroup(d.deadline) !== "later").length || filteredDeadlines.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="giao-viec" className="text-xs">
              Giao việc
              {giaoViecPending > 0 && (
                <span className="ml-1.5 rounded-full bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                  {giaoViecPending}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tong-quan" className="space-y-6 mt-4">
        {/* KPI Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Đoàn đang chạy"
              value={stats.dangChay}
              sub="được phân công"
              icon={BriefcaseBusiness}
              cls="bg-primary/10"
            />
            <StatCard
              label="Sắp khởi hành"
              value={stats.sapKhoiHanh}
              sub="trong 7 ngày tới"
              icon={CalendarClock}
              cls="bg-orange-100"
            />
            <StatCard
              label="Chờ đặt booking"
              value={stats.choBooking}
              sub="đoàn còn việc chưa xong"
              icon={ClipboardList}
              cls={stats.choBooking > 0 ? "bg-amber-500" : "bg-green-100"}
            />
            <StatCard
              label="Tổng khách tháng này"
              value={stats.tongKhachThang}
              sub="từ đoàn của tôi"
              icon={Users}
              cls="bg-teal-100"
            />
          </div>
        )}

        {/* Section: Đoàn của tôi */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-semibold">Đoàn được phân công</h2>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Tìm tên đoàn..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs w-44"
              />
              <Select value={trangThai} onValueChange={setTrangThai}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <span>{trangThai === "dang_chay" ? "Đang chạy" : trangThai === "hoan_thanh" ? "Hoàn thành" : trangThai === "huy" ? "Đã hủy" : "Tất cả"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dang_chay">Đang chạy</SelectItem>
                  <SelectItem value="hoan_thanh">Hoàn thành</SelectItem>
                  <SelectItem value="huy">Đã hủy</SelectItem>
                  <SelectItem value="all">Tất cả</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{rows.length} đoàn</span>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#E6F1FB] text-xs">
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap">Tên đoàn</TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap">Ngày đi</TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap">Ngày về</TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">KH</TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">Booking KS</TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">Booking NH</TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">Booking DV</TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">ĐNTT</TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">Thanh toán</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-10 text-xs text-muted-foreground">
                        Không có đoàn nào
                      </TableCell>
                    </TableRow>
                  ) : rows.map(({ g, ks, ksFinal, nh, nhSent, dv, dvXN, dntt, dnttDuyet, dnttDaTT }) => (
                    <TableRow key={g.id} className="text-xs hover:bg-muted/30">
                      <TableCell className="py-1.5 px-3 whitespace-nowrap">
                        <button
                          onClick={() => navigate(`/doan/${g.id}`)}
                          className="font-medium text-primary hover:underline text-left"
                        >
                          {g.ten_doan}
                        </button>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                        {fmtDate(g.ngay_di)}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                        {fmtDate(g.ngay_ve)}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-center text-muted-foreground">
                        {g.so_khach ?? "—"}
                      </TableCell>

                      {/* Booking KS */}
                      <TableCell className="py-1.5 px-3 text-center">
                        <InfoTooltip
                          trigger={
                            <StatusBadge done={ksFinal} total={ks.length}>
                              {ksFinal}/{ks.length} Final
                            </StatusBadge>
                          }
                          items={ks.map((r) => {
                            const s = ksOverallStatus(r.ks_dat_truoc_status, r.ks_final_status);
                            return { label: r.khach_san_ten, statusLabel: s.label, statusCls: s.cls };
                          })}
                        />
                      </TableCell>

                      {/* Booking NH */}
                      <TableCell className="py-1.5 px-3 text-center">
                        <InfoTooltip
                          trigger={
                            <StatusBadge done={nhSent} total={nh.length}>
                              {nhSent}/{nh.length} gửi
                            </StatusBadge>
                          }
                          items={nh.map((r) => {
                            const s = nhStatusLabel(r.booking_status);
                            return {
                              label: r.nha_hang_ten ?? "—",
                              sub: r.bua_an === "trua" ? "Trưa" : "Tối",
                              statusLabel: s.label, statusCls: s.cls,
                            };
                          })}
                        />
                      </TableCell>

                      {/* Booking DV */}
                      <TableCell className="py-1.5 px-3 text-center">
                        <InfoTooltip
                          trigger={
                            <StatusBadge done={dvXN} total={dv.length} colorMode="traffic">
                              {dvXN}/{dv.length} XN
                            </StatusBadge>
                          }
                          items={dv.map((r) => {
                            const s = dvStatusLabel(r.booking_status);
                            return { label: r.ten_nha_cung_cap, statusLabel: s.label, statusCls: s.cls };
                          })}
                        />
                      </TableCell>

                      {/* ĐNTT */}
                      <TableCell className="py-1.5 px-3 text-center">
                        <InfoTooltip
                          trigger={
                            <StatusBadge done={dnttDuyet} total={dntt.length}>
                              {dnttDuyet}/{dntt.length} duyệt
                            </StatusBadge>
                          }
                          items={dntt.map((r) => {
                            const s = dnttDuyetLabel(r.trang_thai_duyet);
                            return { label: r.mo_ta ?? "—", statusLabel: s.label, statusCls: s.cls };
                          })}
                        />
                      </TableCell>

                      {/* Thanh toán */}
                      <TableCell className="py-1.5 px-3 text-center">
                        <InfoTooltip
                          trigger={
                            <StatusBadge done={dnttDaTT} total={dntt.length}>
                              {dnttDaTT}/{dntt.length} TT
                            </StatusBadge>
                          }
                          items={dntt.map((r) => {
                            const s = ttLabel((r as any).payment_status ?? "unpaid");
                            return { label: r.mo_ta ?? "—", statusLabel: s.label, statusCls: s.cls };
                          })}
                        />
                      </TableCell>
                      <TableCell className="py-1.5 px-1 text-center">
                        {g.assigned_to === uid && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => hidesDoan(g.id)}
                                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors p-0.5 rounded"
                              >
                                <EyeOff className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left">Hủy theo dõi</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Section: Ghi chú cá nhân */}
        {ghiChuLogs.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <StickyNote className="h-4 w-4 text-blue-500" /> Ghi chú của tôi
            </h2>
            {ghiChuLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 rounded-lg border bg-blue-50 border-blue-100 px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => navigate(`/doan/${log.doan_id}?tab=log`)}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    {log.doan_ten ?? `Đoàn #${log.doan_id}`}
                  </button>
                  <p className="text-xs text-foreground mt-0.5">{log.tieu_de}</p>
                  {log.noi_dung && <p className="text-xs text-muted-foreground">{log.noi_dung}</p>}
                </div>
                <button
                  onClick={() => toggleResolved.mutate({ id: log.id, doan_id: log.doan_id, loai: "ghi_chu", is_resolved: true })}
                  className="shrink-0 text-muted-foreground hover:text-green-600 transition-colors"
                  title="Đánh dấu đã xong"
                >
                  <Circle className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Section: Việc cần xử lý */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Việc cần xử lý</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : todos.length === 0 ? (
            <div className="rounded-lg border bg-green-50 border-green-100 px-4 py-6 text-center">
              <p className="text-sm text-green-700 font-medium">Không có việc gì cần xử lý</p>
              <p className="text-xs text-green-600 mt-0.5">Tất cả đoàn đều đang ổn</p>
            </div>
          ) : (
            <div className="space-y-2">
              {todos.map((item, i) => {
                const cfg = priorityConfig[item.priority];
                const PIcon = cfg.icon;
                return (
                  <button
                    key={i}
                    onClick={() => navigate(`/doan/${item.doanId}`)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left hover:opacity-80 transition-opacity",
                      cfg.bg,
                    )}
                  >
                    <PIcon className={cn("h-4 w-4 shrink-0", cfg.cls)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{item.doanName}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
          </TabsContent>

          {/* ── Tab Deadline ──────────────────────────────────────────────── */}
          <TabsContent value="deadline" className="mt-4 space-y-4">
            {loadingDeadlines ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : filteredDeadlines.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 px-4 py-10 text-center">
                <p className="text-sm text-muted-foreground font-medium">Chưa có deadline nào</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  Vào chi tiết từng booking (KS / NH / DV) để điền deadline
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {(["overdue", "today", "week", "later"] as const).map((group) => {
                  const items = filteredDeadlines.filter((d) => deadlineGroup(d.deadline) === group);
                  if (items.length === 0) return null;
                  const gcfg = GROUP_CFG[group];
                  return (
                    <div key={group} className="space-y-2">
                      <h3 className={cn("text-xs font-semibold uppercase tracking-wide", gcfg.cls)}>
                        {gcfg.label} ({items.length})
                      </h3>
                      {items.map((item) => {
                        const tcfg = TYPE_CFG[item.type];
                        const TIcon = tcfg.icon;
                        const dl = parseISO(item.deadline);
                        const daysLeft = differenceInDays(dl, new Date());
                        const daysText = group === "overdue"
                          ? `Quá ${Math.abs(daysLeft)} ngày`
                          : group === "today"
                          ? "Hôm nay"
                          : `Còn ${daysLeft} ngày`;
                        return (
                          <div
                            key={`${item.type}-${item.bookingId}`}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/doan/${item.doanId}`)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                navigate(`/doan/${item.doanId}`);
                              }
                            }}
                            className={cn(
                              "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left hover:opacity-80 transition-opacity cursor-pointer",
                              gcfg.bg,
                            )}
                          >
                            <span className={cn("flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0", tcfg.cls)}>
                              <TIcon className="h-3 w-3" />
                              {tcfg.label}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{item.label}</p>
                              <p className="text-xs text-muted-foreground truncate">{item.doanName}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={cn("text-xs font-semibold", gcfg.cls)}>
                                {format(dl, "dd/MM/yyyy")}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{daysText}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px] gap-1 shrink-0 bg-white/70"
                              disabled={markDone.isPending}
                              title="Đánh dấu deadline này đã xong"
                              onClick={(e) => {
                                e.stopPropagation();
                                markDone.mutate(
                                  { type: item.type, bookingId: item.bookingId },
                                  {
                                    onSuccess: () => toast.success("Đã đánh dấu xong"),
                                    onError: (err: any) => toast.error(err?.message || "Lỗi đánh dấu"),
                                  },
                                );
                              }}
                            >
                              <Check className="h-3 w-3" />
                              Đã xong
                            </Button>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Tab Giao việc ─────────────────────────────────────────────── */}
          <TabsContent value="giao-viec">
            {uid && user?.ho_ten ? (
              <GiaoViecTab userId={uid} userName={user.ho_ten} />
            ) : null}
          </TabsContent>
        </Tabs>

      </div>
    </TooltipProvider>
  );
}
