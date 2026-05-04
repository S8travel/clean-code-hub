import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge as UiBadge } from "@/components/ui/badge";
import { useDoanList } from "@/hooks/use-doan";
import { useTheodoi, type KSItem, type NHItem, type DVItem, type DNTTItem } from "@/hooks/use-theo-doi";
import { useDoanLogSuCo, useToggleResolved } from "@/hooks/use-doan-log";
import { useMarkThongBaoRead } from "@/hooks/use-thong-bao";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useRoleAtLeast } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yy", { locale: vi }); } catch { return d; }
}

function fmtDatetime(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yy", { locale: vi }); } catch { return d; }
}

function fmtMoney(n: number) {
  return n.toLocaleString("vi-VN");
}

// ── KS overall status (dùng cả dat_truoc + final) ───────────────────────────
function ksOverallStatus(dt: string, fn: string) {
  if (fn === "ks_xac_nhan_huy")      return { label: "✗ Đã hủy",            cls: "text-red-600" };
  if (fn === "cho_ks_xac_nhan_huy")  return { label: "⏳ Chờ XN hủy",       cls: "text-orange-600" };
  if (fn === "ks_xac_nhan_final")    return { label: "✓ Final",              cls: "text-purple-600" };
  if (fn === "cho_ks_xac_nhan")      return { label: "⏳ Chờ XN Final",      cls: "text-green-600" };
  if (dt === "ks_xac_nhan")          return { label: "✓ Đặt trước XN",       cls: "text-teal-600" };
  if (dt === "cho_ks_xac_nhan")      return { label: "⏳ Chờ XN đặt trước",  cls: "text-blue-600" };
  return { label: "○ Chưa gửi", cls: "text-muted-foreground" };
}

// ── NH status label ───────────────────────────────────────────────────────────
function nhStatusLabel(status: string) {
  if (status === "da_gui") return { label: "✓ Đã gửi", cls: "text-green-600" };
  return { label: "○ Chưa gửi", cls: "text-muted-foreground" };
}

// ── DV status label ───────────────────────────────────────────────────────────
function dvStatusLabel(status: string) {
  if (status === "da_xac_nhan") return { label: "✓ Đã XN", cls: "text-green-600" };
  if (status === "cho_xac_nhan") return { label: "⏳ Chờ XN", cls: "text-amber-600" };
  if (status === "da_huy") return { label: "✗ Đã hủy", cls: "text-red-600" };
  return { label: "○ Chưa gửi", cls: "text-muted-foreground" };
}

// ── ĐNTT duyet label ─────────────────────────────────────────────────────────
function dnttDuyetLabel(status: string) {
  if (status === "da_duyet") return { label: "✓ Đã duyệt", cls: "text-green-600" };
  if (status === "cho_duyet") return { label: "⏳ Chờ duyệt", cls: "text-amber-600" };
  if (status === "tu_choi") return { label: "✗ Từ chối", cls: "text-red-600" };
  return { label: status, cls: "text-muted-foreground" };
}

// ── TT label ─────────────────────────────────────────────────────────────────
function ttLabel(status: string) {
  if (status === "da_tt") return { label: "✓ Đã TT", cls: "text-green-600" };
  if (status === "can_tru" || status === "da_can_tru") return { label: "✓ Cấn trừ", cls: "text-teal-600" };
  if (status === "cong_no") return { label: "Công nợ", cls: "text-orange-600" };
  return { label: "○ Chưa TT", cls: "text-muted-foreground" };
}

// ── Badge component ───────────────────────────────────────────────────────────
function Badge({ done, total, colorMode, children }: {
  done: number; total: number; colorMode?: "traffic"; children: React.ReactNode;
}) {
  if (total === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
  const pct = total > 0 ? done / total : 0;
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

// ── Tooltip wrapper ───────────────────────────────────────────────────────────
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function TheodoiPage() {
  const canView = useRoleAtLeast("truong_phong");
  const { user } = useAuth();
  const navigate = useNavigate();
  const vanPhongId = user?.role !== "admin" ? (user?.van_phong_id ?? null) : null;
  const { data: groups = [], isLoading: loadingDoan } = useDoanList(vanPhongId);
  const { data: td, isLoading: loadingTD } = useTheodoi();
  const { data: suCoLogs = [], isLoading: loadingSuCo } = useDoanLogSuCo();
  const toggleMut = useToggleResolved();
  const markRead = useMarkThongBaoRead();

  const [activeTab, setActiveTab] = useState("theo-doi");
  const [search, setSearch] = useState("");
  const [trangThai, setTrangThai] = useState("dang_chay");

  useEffect(() => {
    if (activeTab === "su-co" && user?.user_id) {
      markRead.mutate({ userId: user.user_id, loai: "su_co" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.user_id]);

  const isLoading = loadingDoan || loadingTD;

  const rows = useMemo(() => {
    if (!groups || !td) return [];

    return (groups as any[])
      .filter((g) => {
        if (trangThai !== "all" && g.trang_thai !== trangThai) return false;
        if (search && !g.ten_doan.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .map((g) => {
        const id: number = g.id;

        const ks: KSItem[] = td.ksList.filter((r) => r.doan_id === id);
        const ksFinal = ks.filter((r) => r.ks_final_status === "ks_xac_nhan_final").length;

        const nh: NHItem[] = td.nhList.filter((r) => r.doan_id === id);
        const nhSent = nh.filter((r) => r.booking_status === "da_gui").length;

        const dv: DVItem[] = td.dvList.filter((r) => r.doan_id === id);
        const dvXN = dv.filter((r) => r.booking_status === "da_xac_nhan").length;

        const dntt: DNTTItem[] = td.dnttList.filter((r) => r.doan_id === id);
        const dnttDuyet = dntt.filter((r) => r.trang_thai_duyet === "da_duyet").length;
        const dnttDaTT = dntt.filter((r) => r.trang_thai_thanh_toan === "da_tt" || r.trang_thai_thanh_toan === "can_tru" || r.trang_thai_thanh_toan === "da_can_tru").length;

        return { g, ks, ksFinal, nh, nhSent, dv, dvXN, dntt, dnttDuyet, dnttDaTT };
      });
  }, [groups, td, search, trangThai]);

  if (!canView) return <AccessDenied />;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold">Theo dõi</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="theo-doi">Theo dõi đoàn</TabsTrigger>
            <TabsTrigger value="su-co" className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Sự cố
              {suCoLogs.filter((l) => !l.is_resolved).length > 0 && (
                <span className="ml-0.5 min-w-[16px] h-[16px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {suCoLogs.filter((l) => !l.is_resolved).length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="theo-doi" className="mt-4 space-y-4">

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Tìm tên đoàn..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs w-48"
          />
          <Select value={trangThai} onValueChange={setTrangThai}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dang_chay">Đang chạy</SelectItem>
              <SelectItem value="huy">Đã hủy</SelectItem>
              <SelectItem value="all">Tất cả</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{rows.length} đoàn</span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#E6F1FB] text-xs">
                  <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap">Tên đoàn</TableHead>
                  <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap">Ngày tạo</TableHead>
                  <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap">Ngày đi</TableHead>
                  <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap">Agent</TableHead>
                  <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">Booking KS</TableHead>
                  <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">Booking NH</TableHead>
                  <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">Booking DV</TableHead>
                  <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">ĐNTT</TableHead>
                  <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">Thanh toán</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-xs text-muted-foreground">
                      Không có đoàn nào
                    </TableCell>
                  </TableRow>
                ) : rows.map(({ g, ks, ksFinal, nh, nhSent, dv, dvXN, dntt, dnttDuyet, dnttDaTT }) => (
                  <TableRow key={g.id} className="text-xs hover:bg-muted/30">
                    {/* Tên đoàn */}
                    <TableCell className="py-1.5 px-3 whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/doan/${g.id}`)}
                        className="font-medium text-primary hover:underline text-left"
                      >
                        {g.ten_doan}
                      </button>
                    </TableCell>

                    {/* Ngày tạo */}
                    <TableCell className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                      {fmtDatetime(g.created_at)}
                    </TableCell>

                    {/* Ngày đi */}
                    <TableCell className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                      {fmtDate(g.ngay_di)}
                    </TableCell>

                    {/* Agent */}
                    <TableCell className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                      {g.agents?.ten ?? "—"}
                    </TableCell>

                    {/* Booking KS */}
                    <TableCell className="py-1.5 px-3 text-center">
                      <InfoTooltip
                        trigger={
                          <Badge done={ksFinal} total={ks.length}>
                            {ksFinal}/{ks.length} Final
                          </Badge>
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
                          <Badge done={nhSent} total={nh.length}>
                            {nhSent}/{nh.length} gửi
                          </Badge>
                        }
                        items={nh.map((r) => {
                          const s = nhStatusLabel(r.booking_status);
                          return {
                            label: r.nha_hang_ten ?? "—",
                            sub: r.bua_an === "trua" ? "Trưa" : "Tối",
                            statusLabel: s.label,
                            statusCls: s.cls,
                          };
                        })}
                      />
                    </TableCell>

                    {/* Booking DV */}
                    <TableCell className="py-1.5 px-3 text-center">
                      <InfoTooltip
                        trigger={
                          <Badge done={dvXN} total={dv.length}>
                            {dvXN}/{dv.length} XN
                          </Badge>
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
                          <Badge done={dnttDuyet} total={dntt.length}>
                            {dnttDuyet}/{dntt.length} duyệt
                          </Badge>
                        }
                        items={dntt.map((r) => {
                          const s = dnttDuyetLabel(r.trang_thai_duyet);
                          return {
                            label: r.mo_ta ?? "ĐNTT",
                            sub: fmtMoney(r.so_tien),
                            statusLabel: s.label,
                            statusCls: s.cls,
                          };
                        })}
                      />
                    </TableCell>

                    {/* Thanh toán */}
                    <TableCell className="py-1.5 px-3 text-center">
                      <InfoTooltip
                        trigger={
                          <Badge done={dnttDaTT} total={dntt.length} colorMode="traffic">
                            {dnttDaTT}/{dntt.length} TT
                          </Badge>
                        }
                        items={dntt.map((r) => {
                          const s = ttLabel(r.trang_thai_thanh_toan);
                          return {
                            label: r.mo_ta ?? "ĐNTT",
                            sub: fmtMoney(r.so_tien),
                            statusLabel: s.label,
                            statusCls: s.cls,
                          };
                        })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
          </TabsContent>

          <TabsContent value="su-co" className="mt-4">
            <div className="max-w-3xl space-y-2">
              {loadingSuCo && <p className="text-sm text-muted-foreground">Đang tải...</p>}
              {!loadingSuCo && suCoLogs.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Chưa có sự cố nào.</p>
              )}
              {suCoLogs.map((log) => (
                <div
                  key={log.id}
                  className={cn(
                    "border rounded-lg p-3 flex gap-3 items-start bg-white hover:bg-muted/20 transition-colors",
                    log.is_resolved && "opacity-50"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <button
                        onClick={() => navigate(`/doan/${log.doan_id}?tab=log`)}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        {log.doan_ten ?? `Đoàn #${log.doan_id}`}
                      </button>
                      {log.is_resolved && (
                        <UiBadge variant="outline" className="text-[11px] text-green-700 border-green-300">Đã xử lý</UiBadge>
                      )}
                    </div>
                    <p className="text-sm font-medium">{log.tieu_de}</p>
                    {log.noi_dung && <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{log.noi_dung}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {log.created_by_ten ?? "—"} · {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await toggleMut.mutateAsync({ id: log.id, doan_id: log.doan_id, loai: "su_co", is_resolved: !log.is_resolved });
                      } catch { toast.error("Lỗi cập nhật"); }
                    }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title={log.is_resolved ? "Đánh dấu chưa xử lý" : "Đánh dấu đã xử lý"}
                  >
                    {log.is_resolved
                      ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                      : <Circle className="h-4 w-4" />
                    }
                  </button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}
