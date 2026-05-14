import { Link } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  TrendingUp, TrendingDown, Users, CreditCard, AlertCircle,
  ArrowRight, Banknote, CheckCircle2, CalendarCheck, Activity,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from "recharts";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { useRoleAtLeast } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtM = (n: number) =>
  n >= 1_000_000_000 ? `${(n / 1_000_000_000).toFixed(1)}B`
  : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(0)}tr`
  : n.toLocaleString("vi-VN");

const fmtFull = (n: number) => n.toLocaleString("vi-VN") + " ₫";

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM", { locale: vi }); } catch { return d; }
}

function growthPct(curr: number, prev: number) {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, color, growth, href,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; growth?: number | null; href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={cn("p-1.5 rounded-lg", color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <div className="flex items-center justify-between">
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {growth != null && (
          <span className={cn("text-[11px] font-semibold flex items-center gap-0.5 ml-auto",
            growth >= 0 ? "text-emerald-600" : "text-rose-500")}>
            {growth >= 0
              ? <TrendingUp className="h-3 w-3" />
              : <TrendingDown className="h-3 w-3" />}
            {Math.abs(growth)}% so tháng trước
          </span>
        )}
      </div>
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-0.5 mb-3">
      {children}
    </p>
  );
}

const TOOLTIP_STYLE = {
  fontSize: 12,
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const canView = useRoleAtLeast("truong_phong");
  if (!canView) return <AccessDenied />;
  const { data, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
        <Skeleton className="h-7 w-52" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const today = format(new Date(), "EEEE, dd/MM/yyyy", { locale: vi });
  const doanGrowth = growthPct(data.thisMonthDoanCount, data.lastMonthDoanCount);
  const khachGrowth = growthPct(data.thisMonthGuests, data.lastMonthGuests);

  return (
    <div className="p-5 space-y-6 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Tổng quan</h1>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">{today}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-medium text-emerald-600">{data.activeDoanCount} đoàn</span>
          <span>đang hoạt động hôm nay</span>
        </div>
      </div>

      {/* ── Section 1: KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Đoàn đang chạy"
          value={data.activeDoanCount}
          sub="hôm nay"
          icon={Activity}
          color="bg-emerald-500"
          href="/doan"
        />
        <KpiCard
          label="Đoàn tháng này"
          value={data.thisMonthDoanCount}
          sub={`${data.thisMonthGuests.toLocaleString()} khách`}
          icon={CalendarCheck}
          color="bg-blue-500"
          growth={doanGrowth}
          href="/doan"
        />
        <KpiCard
          label="Tổng khách tháng"
          value={data.thisMonthGuests.toLocaleString()}
          sub={`tháng trước: ${data.lastMonthGuests.toLocaleString()}`}
          icon={Users}
          color="bg-orange-500"
          growth={khachGrowth}
        />
        <KpiCard
          label="Chờ duyệt ĐNTT"
          value={data.pendingApprovalCount}
          sub={fmtM(data.pendingApprovalAmount) + " ₫"}
          icon={AlertCircle}
          color="bg-amber-500"
          href="/de-nghi-thanh-toan"
        />
        <KpiCard
          label="Chưa thanh toán"
          value={data.pendingPaymentCount}
          sub={fmtM(data.pendingPaymentAmount) + " ₫"}
          icon={CreditCard}
          color="bg-violet-500"
          href="/de-nghi-thanh-toan"
        />
      </div>

      {/* ── Section 2: Xu hướng đoàn + Trạng thái ── */}
      <div>
        <SectionTitle>Hoạt động kinh doanh</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Bar chart: Đoàn & khách 12 tháng (6 trước + 6 sau) */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold mb-1">Xu hướng đoàn & khách</p>
            <p className="text-xs text-muted-foreground mb-4">12 tháng (6 trước + 6 sau · vuốt ngang trên mobile)</p>
            {/* Mobile: scroll ngang vì 12 cột chật chội. Desktop fill 100%. */}
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="min-w-[760px] sm:min-w-0">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, name: string) => [v.toLocaleString(), name === "soDoan" ? "Số đoàn" : "Số khách"]} />
                    <Bar yAxisId="l" dataKey="soDoan" name="soDoan" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    <Bar yAxisId="r" dataKey="soKhach" name="soKhach" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex items-center gap-4 justify-center mt-2">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /><span className="text-xs text-muted-foreground">Số đoàn</span></div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-orange-500 inline-block" /><span className="text-xs text-muted-foreground">Số khách</span></div>
            </div>
          </div>

          {/* Donut: Trạng thái đoàn */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold mb-1">Trạng thái đoàn</p>
            <p className="text-xs text-muted-foreground mb-3">6 tháng gần nhất</p>
            {data.statusBreakdown.length === 0 ? (
              <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">Chưa có dữ liệu</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={data.statusBreakdown} cx="50%" cy="50%"
                      innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                      {data.statusBreakdown.map((s) => <Cell key={s.name} fill={s.color} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v + " đoàn"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {data.statusBreakdown.map((s) => {
                    const total = data.statusBreakdown.reduce((acc, x) => acc + x.value, 0);
                    const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                    return (
                      <div key={s.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: s.color }} />
                          <span className="text-muted-foreground">{s.name}</span>
                        </div>
                        <span className="font-semibold">{s.value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Chi phí ── */}
      <div>
        <SectionTitle>Chi phí & tài chính</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Area chart: Chi phí 6 tháng */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold mb-1">Xu hướng chi phí</p>
            <p className="text-xs text-muted-foreground mb-4">6 tháng gần nhất (đơn vị: triệu ₫)</p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.monthlyCostData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gKS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gNH" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="gDV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}tr`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => [fmtFull(v),
                    name === "ks" ? "Khách sạn" : name === "nh" ? "Nhà hàng" : "Dịch vụ"]} />
                <Area type="monotone" dataKey="ks" name="ks" stroke="#6366f1" strokeWidth={2} fill="url(#gKS)" />
                <Area type="monotone" dataKey="nh" name="nh" stroke="#f59e0b" strokeWidth={2} fill="url(#gNH)" />
                <Area type="monotone" dataKey="dv" name="dv" stroke="#10b981" strokeWidth={2} fill="url(#gDV)" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 justify-center mt-2">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /><span className="text-xs text-muted-foreground">Khách sạn</span></div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /><span className="text-xs text-muted-foreground">Nhà hàng</span></div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /><span className="text-xs text-muted-foreground">Dịch vụ</span></div>
            </div>
          </div>

          {/* Donut + breakdown: Chi phí tháng này */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold mb-1">Cơ cấu chi phí tháng</p>
            <p className="text-xs text-muted-foreground mb-3">Tổng: <span className="font-semibold text-foreground">{fmtM(data.tongChiPhiThang)} ₫</span></p>
            {data.tongChiPhiThang === 0 ? (
              <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">Chưa có chi phí</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={data.chiPieParts.filter((p) => p.value > 0)}
                      cx="50%" cy="50%" innerRadius={45} outerRadius={68}
                      paddingAngle={3} dataKey="value">
                      {data.chiPieParts.filter((p) => p.value > 0).map((p) => <Cell key={p.name} fill={p.color} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtFull(v)]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {data.chiPieParts.filter((p) => p.value > 0).map((p) => {
                    const pct = data.tongChiPhiThang > 0 ? Math.round((p.value / data.tongChiPhiThang) * 100) : 0;
                    return (
                      <div key={p.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} />
                          <span className="text-muted-foreground">{p.name}</span>
                        </div>
                        <span className="font-medium">{fmtM(p.value)} ₫ <span className="text-muted-foreground">({pct}%)</span></span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 4: Agent + Địa điểm ── */}
      <div>
        <SectionTitle>Hiệu suất vận hành (6 tháng)</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Agent ranking */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold mb-1">Đoàn theo Agent</p>
            <p className="text-xs text-muted-foreground mb-4">Xếp hạng theo số khách</p>
            {data.topAgents.length === 0 ? (
              <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">Chưa có dữ liệu</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, data.topAgents.length * 36)}>
                <BarChart data={data.topAgents} layout="vertical"
                  margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={70}
                    tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => [v.toLocaleString(), name === "soKhach" ? "Khách" : "Đoàn"]} />
                  <Bar dataKey="soKhach" name="soKhach" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={22}
                    label={{ position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Địa điểm breakdown */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold mb-1">Đoàn theo Địa điểm</p>
            <p className="text-xs text-muted-foreground mb-4">Số đoàn theo từng điểm đến</p>
            {data.topDiaDiem.length === 0 ? (
              <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">Chưa có dữ liệu</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, data.topDiaDiem.length * 36)}>
                <BarChart data={data.topDiaDiem} layout="vertical"
                  margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={70}
                    tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v + " đoàn"]} />
                  <Bar dataKey="count" name="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={22}
                    label={{ position: "right", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 5: Sắp khởi hành + ĐNTT ── */}
      <div>
        <SectionTitle>Cần theo dõi</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Upcoming 7 ngày */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Sắp khởi hành — 7 ngày tới
              </p>
              <Link to="/doan" className="text-xs text-primary hover:underline flex items-center gap-1">
                Xem tất cả <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {data.upcomingDoan.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Không có đoàn sắp khởi hành</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.upcomingDoan.map((doan) => {
                  const guests = (doan.so_khach_lon || 0) + (doan.so_khach_em1 || 0) + (doan.so_khach_em2 || 0) + (doan.so_khach_tl || 0) || doan.so_khach || 0;
                  const daysLeft = doan.ngay_di
                    ? Math.ceil((new Date(doan.ngay_di + "T00:00:00").getTime() - new Date().setHours(0,0,0,0)) / 86400000)
                    : null;
                  return (
                    <Link key={doan.id} to={`/doan/${doan.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="text-center shrink-0 w-10">
                        <p className="text-lg font-bold leading-none text-primary">
                          {doan.ngay_di ? format(new Date(doan.ngay_di + "T00:00:00"), "dd") : "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {doan.ngay_di ? format(new Date(doan.ngay_di + "T00:00:00"), "MMM", { locale: vi }) : ""}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doan.ten_doan}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(doan.ngay_di)} → {fmtDate(doan.ngay_ve)} · {guests} khách
                        </p>
                      </div>
                      {daysLeft != null && (
                        <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0",
                          daysLeft <= 2 ? "bg-red-100 text-red-600"
                          : daysLeft <= 5 ? "bg-amber-100 text-amber-700"
                          : "bg-muted text-muted-foreground")}>
                          {daysLeft === 0 ? "Hôm nay" : daysLeft === 1 ? "Ngày mai" : `${daysLeft} ngày`}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* ĐNTT chờ xử lý */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                ĐNTT chờ xử lý
              </p>
              <Link to="/de-nghi-thanh-toan" className="text-xs text-primary hover:underline flex items-center gap-1">
                Xem tất cả <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {data.recentDNTT.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Tất cả đã xử lý</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.recentDNTT.map((d) => {
                  const isPending = d.trang_thai_duyet === "cho_duyet";
                  return (
                    <Link key={d.id} to="/de-nghi-thanh-toan"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className={cn("p-1.5 rounded-md shrink-0", isPending ? "bg-amber-50" : "bg-violet-50")}>
                        <Banknote className={cn("h-3.5 w-3.5", isPending ? "text-amber-500" : "text-violet-500")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.mo_ta || "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.created_at ? format(new Date(d.created_at), "dd/MM/yyyy") : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <p className="text-sm font-semibold">{fmtM(d.so_tien)} ₫</p>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                          isPending ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700")}>
                          {isPending ? "Chờ duyệt" : "Chờ TT"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 6: Đoàn đang chạy ── */}
      {data.activeDoan.length > 0 && (
        <div>
          <SectionTitle>Đang hoạt động hôm nay</SectionTitle>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-emerald-50/60">
              <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                {data.activeDoan.length} đoàn đang chạy
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {data.activeDoan.map((doan) => {
                const guests = (doan.so_khach_lon || 0) + (doan.so_khach_em1 || 0) + (doan.so_khach_em2 || 0) + (doan.so_khach_tl || 0) || doan.so_khach || 0;
                return (
                  <Link key={doan.id} to={`/doan/${doan.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doan.ten_doan}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(doan.ngay_di)} → {fmtDate(doan.ngay_ve)} · {guests} khách
                      </p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
