import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge as UiBadge } from "@/components/ui/badge";
import { useDoanList } from "@/hooks/use-doan";
import { useDoanLogSuCo, useToggleResolved } from "@/hooks/use-doan-log";
import { useMarkThongBaoRead } from "@/hooks/use-thong-bao";
import { useAuth } from "@/hooks/use-auth";
import { useUserListForAssign } from "@/hooks/use-cong-viec";
import {
  useDoanPhanViecMatrix, useAssignPvItem, useSetPvKhongCan, PHAN_VIEC_ITEMS,
  type PvKey, type PvCell,
} from "@/hooks/use-phan-viec";
import { cn } from "@/lib/utils";
import { useRoleAtLeast } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { CheckCircle2, Circle, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yy", { locale: vi }); } catch { return d; }
}
function fmtDatetime(d: string | null | undefined) {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yy", { locale: vi }); } catch { return d; }
}

// Màu tên theo trạng thái nhận việc: chưa xác nhận = vàng, đã nhận = xanh, từ chối = xám
const STT_CLS: Record<string, string> = {
  cho_nhan:   "text-amber-600",
  dang_lam:   "text-green-600",
  hoan_thanh: "text-green-600",
  tu_choi:    "text-muted-foreground line-through",
  khong_can:  "text-black font-medium",
};
const KC = "__khong_can__";

// ── Ô phân việc (gán / đổi người) ───────────────────────────────────────────
function PvAssignCell({
  doanId, doanTen, ngayDi, pvKey, cell, users, onAssign, onKhongCan, pending,
}: {
  doanId: number; doanTen: string; ngayDi: string | null;
  pvKey: PvKey; cell: PvCell | undefined;
  users: { user_id: string; ho_ten: string }[];
  onAssign: (p: { doanId: number; doanTen: string; ngayDi: string | null; key: PvKey; userId: string }) => void;
  onKhongCan: (p: { doanId: number; doanTen: string; ngayDi: string | null; key: PvKey }) => void;
  pending: boolean;
}) {
  const isKC = cell?.trang_thai === "khong_can";
  const cls = cell ? (STT_CLS[cell.trang_thai] ?? "text-foreground") : "text-muted-foreground";
  const label = !cell ? "Admin" : isKC ? "Không cần" : cell.ten;
  const value = isKC ? KC : (cell?.user_id ?? "_none");
  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(v) => {
        if (v === "_none") return;
        if (v === KC) { onKhongCan({ doanId, doanTen, ngayDi, key: pvKey }); return; }
        onAssign({ doanId, doanTen, ngayDi, key: pvKey, userId: v });
      }}
    >
      <SelectTrigger className="h-7 text-xs border-dashed px-2 min-w-[110px] justify-center">
        <span className={cn("truncate", cls)}>{label}</span>
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.user_id} value={u.user_id} className="text-xs">
            {u.ho_ten}
          </SelectItem>
        ))}
        <SelectItem value={KC} className="text-xs font-medium">⊘ Không cần</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function TheodoiPage() {
  const canView = useRoleAtLeast("truong_phong");
  const { user } = useAuth();
  const navigate = useNavigate();
  const vanPhongId = user?.role !== "admin" ? (user?.van_phong_id ?? null) : null;
  const { data: groups = [], isLoading: loadingDoan } = useDoanList(vanPhongId);
  const { data: assignUsers = [] } = useUserListForAssign();
  const allDoanIds = useMemo(
    () => ((groups as any[]) ?? []).map((g) => g.id),
    [groups],
  );
  const { data: pvMatrix } = useDoanPhanViecMatrix(allDoanIds);
  const assignMut = useAssignPvItem();
  const setKcMut = useSetPvKhongCan();
  const { data: suCoLogs = [], isLoading: loadingSuCo } = useDoanLogSuCo();
  const toggleMut = useToggleResolved();
  const markRead = useMarkThongBaoRead();

  const [activeTab, setActiveTab] = useState("theo-doi");
  const [search, setSearch] = useState("");
  const [trangThai, setTrangThai] = useState("dang_chay");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [departFrom, setDepartFrom] = useState("");
  const [departTo, setDepartTo] = useState("");
  const [sortBy, setSortBy] = useState<"created_at" | "ngay_di" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  const toggleSort = (col: "created_at" | "ngay_di") => {
    if (sortBy !== col) { setSortBy(col); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortBy(null); setSortDir("asc"); }
  };

  useEffect(() => {
    setPage(1);
  }, [search, trangThai, createdFrom, createdTo, departFrom, departTo, sortBy, sortDir]);

  useEffect(() => {
    if (activeTab === "su-co" && user?.user_id) {
      markRead.mutate({ userId: user.user_id, loai: "su_co" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.user_id]);

  const rows = useMemo(() => {
    if (!groups) return [];
    return (groups as any[]).filter((g) => {
      if (trangThai !== "all" && g.trang_thai !== trangThai) return false;
      if (search && !g.ten_doan.toLowerCase().includes(search.toLowerCase())) return false;
      if (createdFrom || createdTo) {
        const c = (g.created_at ?? "").slice(0, 10);
        if (createdFrom && c < createdFrom) return false;
        if (createdTo && c > createdTo) return false;
      }
      if (departFrom || departTo) {
        const d = g.ngay_di ?? "";
        if (departFrom && d < departFrom) return false;
        if (departTo && d > departTo) return false;
      }
      return true;
    }).map((g) => ({ g }));
  }, [groups, search, trangThai, createdFrom, createdTo, departFrom, departTo]);

  const sortedRows = useMemo(() => {
    if (!sortBy) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = sortBy === "created_at" ? (a.g.created_at ?? "") : (a.g.ngay_di ?? "");
      const bv = sortBy === "created_at" ? (b.g.created_at ?? "") : (b.g.ngay_di ?? "");
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!canView) return <AccessDenied />;

  const onAssign = (p: { doanId: number; doanTen: string; ngayDi: string | null; key: PvKey; userId: string }) => {
    assignMut.mutate(p, {
      onSuccess: () => toast.success("Đã phân việc — đã thông báo người nhận"),
      onError: (e: any) => toast.error(e?.message ?? "Lỗi phân việc"),
    });
  };

  const onKhongCan = (p: { doanId: number; doanTen: string; ngayDi: string | null; key: PvKey }) => {
    setKcMut.mutate(p, {
      onSuccess: () => toast.success("Đã đánh dấu Không cần — sẽ không theo dõi/thông báo"),
      onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
    });
  };

  return (
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
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Tìm tên đoàn..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs w-48"
              />
              <Select value={trangThai} onValueChange={setTrangThai}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <span>{trangThai === "dang_chay" ? "Đang chạy" : trangThai === "huy" ? "Đã hủy" : "Tất cả"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dang_chay">Đang chạy</SelectItem>
                  <SelectItem value="huy">Đã hủy</SelectItem>
                  <SelectItem value="all">Tất cả</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{sortedRows.length} đoàn</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-muted-foreground">Ngày tạo:</span>
              <Input type="date" value={createdFrom} onChange={(e) => setCreatedFrom(e.target.value)} className="h-8 text-xs w-36" />
              <span className="text-muted-foreground">→</span>
              <Input type="date" value={createdTo} onChange={(e) => setCreatedTo(e.target.value)} className="h-8 text-xs w-36" />
              <span className="text-muted-foreground ml-2">Ngày đi:</span>
              <Input type="date" value={departFrom} onChange={(e) => setDepartFrom(e.target.value)} className="h-8 text-xs w-36" />
              <span className="text-muted-foreground">→</span>
              <Input type="date" value={departTo} onChange={(e) => setDepartTo(e.target.value)} className="h-8 text-xs w-36" />
              {(createdFrom || createdTo || departFrom || departTo) && (
                <button
                  onClick={() => { setCreatedFrom(""); setCreatedTo(""); setDepartFrom(""); setDepartTo(""); }}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground border rounded"
                >
                  Xóa filter ngày
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Tên người: <span className="text-amber-600 font-medium">vàng</span> = chưa xác nhận ·{" "}
              <span className="text-green-600 font-medium">xanh</span> = đã nhận ·{" "}
              <span className="text-muted-foreground line-through">xám</span> = từ chối
            </p>
          </div>

          {/* Table */}
          {loadingDoan ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#E6F1FB] text-xs">
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap">Tên đoàn</TableHead>
                    <TableHead
                      className="text-xs font-semibold py-2 px-3 whitespace-nowrap cursor-pointer hover:bg-blue-100 select-none"
                      onClick={() => toggleSort("created_at")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Ngày tạo
                        {sortBy === "created_at"
                          ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </span>
                    </TableHead>
                    <TableHead
                      className="text-xs font-semibold py-2 px-3 whitespace-nowrap cursor-pointer hover:bg-blue-100 select-none"
                      onClick={() => toggleSort("ngay_di")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Ngày đi
                        {sortBy === "ngay_di"
                          ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </span>
                    </TableHead>
                    <TableHead className="text-xs font-semibold py-2 px-3 whitespace-nowrap">Agent</TableHead>
                    {PHAN_VIEC_ITEMS.map((it) => (
                      <TableHead key={it.key} className="text-xs font-semibold py-2 px-3 whitespace-nowrap text-center">
                        {it.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4 + PHAN_VIEC_ITEMS.length} className="text-center py-8 text-xs text-muted-foreground">
                        Không có đoàn nào
                      </TableCell>
                    </TableRow>
                  ) : pageRows.map(({ g }) => {
                    const cells = pvMatrix?.get(g.id) ?? {};
                    return (
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
                          {fmtDatetime(g.created_at)}
                        </TableCell>
                        <TableCell className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                          {fmtDate(g.ngay_di)}
                        </TableCell>
                        <TableCell className="py-1.5 px-3 text-muted-foreground whitespace-nowrap">
                          {g.agents?.ten ?? "—"}
                        </TableCell>
                        {PHAN_VIEC_ITEMS.map((it) => (
                          <TableCell key={it.key} className="py-1.5 px-2 text-center">
                            <PvAssignCell
                              doanId={g.id}
                              doanTen={g.ten_doan}
                              ngayDi={g.ngay_di ?? null}
                              pvKey={it.key}
                              cell={cells[it.key]}
                              users={assignUsers}
                              onAssign={onAssign}
                              onKhongCan={onKhongCan}
                              pending={assignMut.isPending || setKcMut.isPending}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {!loadingDoan && sortedRows.length > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, sortedRows.length)} / {sortedRows.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="h-7 px-2 inline-flex items-center gap-1 border rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                >
                  <ChevronLeft className="h-3 w-3" />
                  Trước
                </button>
                <span className="px-2 text-muted-foreground">Trang {currentPage} / {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-7 px-2 inline-flex items-center gap-1 border rounded text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted"
                >
                  Sau
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
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
                      await toggleMut.mutateAsync({ id: log.id, doan_id: log.doan_id, loai: "su_co", is_resolved: !log.is_resolved, user_id: user?.user_id ?? null, user_ten: user?.ho_ten ?? null });
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
  );
}
