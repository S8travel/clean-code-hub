import { Link } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  Users, TrendingUp, CreditCard, Clock,
  ArrowRight, CalendarCheck, Building2, Utensils, MapPin,
  CheckCircle2, AlertCircle, Banknote,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { useDashboardStats } from "@/hooks/use-dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const fmtMoney = (n: number) =>
  n >= 1_000_000_000
    ? `${(n / 1_000_000_000).toFixed(1)}B`
    : n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(0)}tr`
    : n.toLocaleString("vi-VN");

const fmtMoneyFull = (n: number) => n.toLocaleString("vi-VN") + " ₫";

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM", { locale: vi }); } catch { return d; }
}

function StatCard({
  label, value, sub, icon: Icon, cls, href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  cls?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3 hover:shadow-sm transition-shadow">
      <div className={cn("p-2 rounded-lg shrink-0", cls ?? "bg-primary/10")}>
        <Icon className={cn("h-5 w-5", cls ? "text-white" : "text-primary")} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {href && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-auto mt-1" />}
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

const DNTT_STATUS: Record<string, { label: string; cls: string }> = {
  cho_duyet: { label: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  da_duyet:  { label: "Đã duyệt",  cls: "bg-teal-100 text-teal-700" },
};

export default function DashboardPage() {
  const { data, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const today = format(new Date(), "EEEE, dd/MM/yyyy", { locale: vi });

  return (
    <div className="p-5 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Tổng quan</h1>
        <p className="text-sm text-muted-foreground capitalize">{today}</p>
      </div>

      {/* ── Row 1: KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Đoàn đang hoạt động"
          value={data.activeDoanCount}
          sub="hôm nay"
          icon={TrendingUp}
          cls="bg-emerald-500"
          href="/doan"
        />
        <StatCard
          label="Đoàn tháng này"
          value={data.thisMonthDoanCount}
          sub={`${data.thisMonthGuests} khách`}
          icon={CalendarCheck}
          cls="bg-blue-500"
          href="/doan"
        />
        <StatCard
          label="Chờ duyệt ĐNTT"
          value={data.pendingApprovalCount}
          sub={fmtMoney(data.pendingApprovalAmount) + " ₫"}
          icon={AlertCircle}
          cls="bg-amber-500"
          href="/de-nghi-thanh-toan"
        />
        <StatCard
          label="Chờ thanh toán"
          value={data.pendingPaymentCount}
          sub={fmtMoney(data.pendingPaymentAmount) + " ₫"}
          icon={CreditCard}
          cls="bg-violet-500"
          href="/de-nghi-thanh-toan"
        />
      </div>

      {/* ── Row 2: Chi phí tháng này ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Chi phí dự trù tháng này
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
          <div className="px-4 py-3">
            <p className="text-[11px] text-muted-foreground mb-0.5">Tổng</p>
            <p className="text-lg font-bold">{fmtMoney(data.tongChiPhiThang)} ₫</p>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Building2 className="h-3.5 w-3.5 text-indigo-500" />
              <p className="text-[11px] text-muted-foreground">Khách sạn</p>
            </div>
            <p className="text-sm font-semibold">{fmtMoney(data.chiPhiKS)} ₫</p>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Utensils className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-[11px] text-muted-foreground">Nhà hàng</p>
            </div>
            <p className="text-sm font-semibold">{fmtMoney(data.chiPhiNH)} ₫</p>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-0.5">
              <MapPin className="h-3.5 w-3.5 text-emerald-500" />
              <p className="text-[11px] text-muted-foreground">Dịch vụ</p>
            </div>
            <p className="text-sm font-semibold">{fmtMoney(data.chiPhiDV)} ₫</p>
          </div>
        </div>
      </div>

      {/* ── Row 3: Chart + Pie ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Bar chart */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold mb-4">Đoàn & khách 6 tháng gần nhất</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{ fontSize: 12, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: number, name: string) => [v, name === "soDoan" ? "Số đoàn" : "Số khách"]}
              />
              <Bar yAxisId="left" dataKey="soDoan" name="soDoan" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar yAxisId="right" dataKey="soKhach" name="soKhach" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" /><span className="text-xs text-muted-foreground">Số đoàn</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /><span className="text-xs text-muted-foreground">Số khách</span></div>
          </div>
        </div>

        {/* Pie chart chi phí */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold mb-2">Cơ cấu chi phí tháng</p>
          {data.tongChiPhiThang === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
              Chưa có chi phí
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={data.chiPieParts.filter((p) => p.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {data.chiPieParts.filter((p) => p.value > 0).map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [fmtMoneyFull(v)]}
                    contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-1">
                {data.chiPieParts.filter((p) => p.value > 0).map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: p.color }} />
                      <span className="text-muted-foreground">{p.name}</span>
                    </div>
                    <span className="font-medium">{fmtMoney(p.value)} ₫</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Row 4: Sắp khởi hành + ĐNTT gần đây ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming tours */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Sắp khởi hành (14 ngày tới)
            </p>
            <Link to="/doan" className="text-xs text-primary hover:underline flex items-center gap-1">
              Xem tất cả <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {data.upcomingDoan.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Không có đoàn nào sắp khởi hành
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.upcomingDoan.map((doan) => {
                const guests = (doan.so_khach_lon || 0) + (doan.so_khach_em1 || 0) + (doan.so_khach_em2 || 0) + (doan.so_khach_tl || 0) || doan.so_khach || 0;
                return (
                  <Link
                    key={doan.id}
                    to={`/doan/${doan.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                  >
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
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent DNTT */}
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
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              Tất cả đã xử lý
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.recentDNTT.map((d) => {
                const st = DNTT_STATUS[d.trang_thai_duyet] ?? { label: d.trang_thai_duyet, cls: "bg-muted text-muted-foreground" };
                return (
                  <Link
                    key={d.id}
                    to="/de-nghi-thanh-toan"
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <div className="p-1.5 rounded-md bg-muted shrink-0">
                      <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.mo_ta || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.created_at ? format(new Date(d.created_at), "dd/MM/yyyy", { locale: vi }) : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <p className="text-sm font-semibold">{fmtMoney(d.so_tien)} ₫</p>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", st.cls)}>
                        {st.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 5: Đoàn đang chạy ── */}
      {data.activeDoan.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-emerald-50/50">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              Đang hoạt động hôm nay ({data.activeDoan.length} đoàn)
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {data.activeDoan.slice(0, 6).map((doan) => {
              const guests = (doan.so_khach_lon || 0) + (doan.so_khach_em1 || 0) + (doan.so_khach_em2 || 0) + (doan.so_khach_tl || 0) || doan.so_khach || 0;
              return (
                <Link
                  key={doan.id}
                  to={`/doan/${doan.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
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
      )}
    </div>
  );
}
