import { useState, useMemo, useEffect } from "react";
import { Plus, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DoanTable } from "@/components/DoanTable";
import { DoanDrawer } from "@/components/DoanDrawer";
import { DeleteDialog } from "@/components/DeleteDialog";
import {
  useDoanList,
  useDoanRealtime,
  useCreateDoan,
  useUpdateDoan,
  useDeleteDoan,
  useCancelDoan,
  useAgents,
  useDiaDiem,
  useUserRoles,
  // useAddDoanPermission, // FEATURE_DOAN_PERM_DISABLED
} from "@/hooks/use-doan";
import type { DoanInsert } from "@/hooks/use-doan";
import { externalSupabase } from "@/lib/supabase-external";
import { useApplySeriToDoan } from "@/hooks/use-seri";
import { useLogActivity } from "@/hooks/use-activity-log";

const PAGE_SIZE = 20;

const TRANG_THAI_OPTIONS = [
  { value: "all", label: "Tất cả" },
  { value: "dang_chay", label: "Đang chạy" },
  { value: "hoan_thanh", label: "Hoàn thành" },
  { value: "huy", label: "Đã hủy" },
];

export default function Index() {
  const { data: groups, isLoading, error } = useDoanList();
  useDoanRealtime();
  const createDoan = useCreateDoan();
  const updateDoan = useUpdateDoan();
  const deleteDoan = useDeleteDoan();
  const cancelDoan = useCancelDoan();
  // const addPerm = useAddDoanPermission(); // FEATURE_DOAN_PERM_DISABLED
  const applySeri = useApplySeriToDoan();
  const logActivity = useLogActivity();
  const { data: agents } = useAgents();
  const { data: diaDiemList } = useDiaDiem();
  const { data: userRoles } = useUserRoles();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingDoan, setEditingDoan] = useState<any | null>(null);
  const [deletingDoan, setDeletingDoan] = useState<any | null>(null);
  const [cancelingDoan, setCancelingDoan] = useState<any | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [diaDiemFilter, setDiaDiemFilter] = useState("all");
  const [trangThaiFilter, setTrangThaiFilter] = useState("all");

  // Pagination
  const [page, setPage] = useState(1);

  // Build user_roles map: user_id → ho_ten
  const userRolesMap = useMemo(() => {
    const map = new Map<string, string>();
    userRoles?.forEach((u) => map.set(u.user_id, u.ho_ten));
    return map;
  }, [userRoles]);

  const hasFilters = search || dateFrom || dateTo || agentFilter !== "all" || diaDiemFilter !== "all" || trangThaiFilter !== "all";

  const clearFilters = () => {
    setSearch(""); setDateFrom(""); setDateTo("");
    setAgentFilter("all"); setDiaDiemFilter("all"); setTrangThaiFilter("all");
    setPage(1);
  };

  const filtered = useMemo(() => {
    if (!groups) return [];
    return groups.filter((g: any) => {
      if (search) {
        const q = search.toLowerCase();
        const opName = g.assigned_to ? userRolesMap.get(g.assigned_to) || "" : "";
        const match =
          g.ten_doan?.toLowerCase().includes(q) ||
          g.huong_dan_vien?.ten?.toLowerCase().includes(q) ||
          g.agents?.ten?.toLowerCase().includes(q) ||
          opName.toLowerCase().includes(q);
        if (!match) return false;
      }

      // Date range on ngay_di (ngày đón)
      if (dateFrom && g.ngay_di) { if (g.ngay_di < dateFrom) return false; }
      if (dateTo && g.ngay_di) { if (g.ngay_di > dateTo) return false; }
      if ((dateFrom || dateTo) && !g.ngay_di) return false;

      if (agentFilter !== "all" && g.agent_id?.toString() !== agentFilter) return false;
      if (diaDiemFilter !== "all" && g.dia_diem_id?.toString() !== diaDiemFilter) return false;

      if (trangThaiFilter !== "all") {
        if (trangThaiFilter === "dang_chay" && (g.trang_thai === "hoan_thanh" || g.trang_thai === "huy")) return false;
        if (trangThaiFilter === "hoan_thanh" && g.trang_thai !== "hoan_thanh") return false;
        if (trangThaiFilter === "huy" && g.trang_thai !== "huy") return false;
      }

      return true;
    });
  }, [groups, search, dateFrom, dateTo, agentFilter, diaDiemFilter, trangThaiFilter, userRolesMap]);

  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, agentFilter, diaDiemFilter, trangThaiFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showFrom = filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showTo = Math.min(page * PAGE_SIZE, filtered.length);

  const handleSave = async (data: DoanInsert) => {
    try {
      if (editingDoan) {
        await updateDoan.mutateAsync({ id: editingDoan.id, ...data });
        // FEATURE_DOAN_PERM_DISABLED: auto-grant khi sửa assigned_to
        // if (data.assigned_to && data.assigned_to !== editingDoan.assigned_to) {
        //   const assigneeName = userRolesMap.get(data.assigned_to) || "";
        //   try {
        //     await addPerm.mutateAsync({ doan_id: editingDoan.id, user_id: data.assigned_to, ho_ten: assigneeName, quyen: "admin" });
        //   } catch { /* ignore if permission already exists */ }
        // }
        logActivity.mutate({ action: "sua", table_name: "doan", record_id: editingDoan.id, mo_ta: `Sửa đoàn ${data.ten_doan ?? editingDoan.ten_doan}` });
        toast.success("Đã cập nhật đoàn");
      } else {
        const created = await createDoan.mutateAsync({ ...data, shopping: false });
        // FEATURE_DOAN_PERM_DISABLED: auto-grant khi tạo đoàn mới
        // if (created && data.assigned_to) {
        //   const creatorName = userRolesMap.get(data.assigned_to) || "";
        //   try {
        //     await addPerm.mutateAsync({ doan_id: created.id, user_id: data.assigned_to, ho_ten: creatorName, quyen: "admin" });
        //   } catch { /* ignore if permission already exists */ }
        // }
        if (created) {
          logActivity.mutate({ action: "tao", table_name: "doan", record_id: created.id, mo_ta: `Tạo đoàn ${data.ten_doan}` });
        }
        // Apply seri if selected
        if (created && data.seri_id && data.ngay_di) {
          try {
            await applySeri.mutateAsync({
              doanId: created.id,
              seriId: data.seri_id,
              ngayDi: data.ngay_di,
            });
          } catch { /* seri apply failure non-fatal */ }
        }
        toast.success("✓ Tạo đoàn thành công");
      }
      setDrawerOpen(false);
      setEditingDoan(null);
    } catch {
      toast.error("Có lỗi xảy ra");
    }
  };

  const handleDelete = async () => {
    if (!deletingDoan) return;
    try {
      const name = deletingDoan.ten_doan;
      await deleteDoan.mutateAsync(deletingDoan.id);
      logActivity.mutate({ action: "xoa", table_name: "doan", record_id: deletingDoan.id, mo_ta: `Xóa đoàn ${name}` });
      toast.success("Đã xoá đoàn");
      setDeletingDoan(null);
    } catch {
      toast.error("Xoá thất bại");
    }
  };

  const handleCancel = async () => {
    if (!cancelingDoan) return;
    try {
      await cancelDoan.mutateAsync(cancelingDoan.id);
      toast.success("Đã hủy đoàn");
      setCancelingDoan(null);
    } catch {
      toast.error("Hủy đoàn thất bại");
    }
  };

  const openNew = () => {
    setEditingDoan(null);
    setDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">

        {/* TOOLBAR */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold">Quản lý đoàn</h1>
            <Badge variant="secondary" className="text-xs tabular-nums">{filtered.length}</Badge>
          </div>
          <Button onClick={openNew} className="active:scale-[0.98] transition-transform shrink-0"
            style={{ backgroundColor: "hsl(213, 78%, 37%)" }}>
            <Plus className="h-4 w-4 mr-1.5" />
            Tạo đoàn mới
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-destructive/5 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            Không thể tải dữ liệu. Kiểm tra kết nối và thử lại.
          </div>
        )}

        {/* FILTER BAR */}
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm code, HDV, agent, OP..."
              className="pl-9 h-9 text-sm rounded-lg" />
          </div>

          <div className="flex items-center gap-1.5">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 text-xs rounded-lg w-[130px] tabular-nums" placeholder="Từ ngày" />
            <span className="text-muted-foreground text-xs">→</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-9 text-xs rounded-lg w-[130px] tabular-nums" placeholder="Đến ngày" />
          </div>

          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-9 text-xs rounded-lg w-[140px]">
              <SelectValue placeholder="Agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả Agent</SelectItem>
              {agents?.map((a) => (
                <SelectItem key={a.id} value={a.id.toString()}>{a.ten}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={diaDiemFilter} onValueChange={setDiaDiemFilter}>
            <SelectTrigger className="h-9 text-xs rounded-lg w-[140px]">
              <SelectValue placeholder="Địa điểm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả ĐĐ</SelectItem>
              {diaDiemList?.map((d) => (
                <SelectItem key={d.id} value={d.id.toString()}>{d.ten}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={trangThaiFilter} onValueChange={setTrangThaiFilter}>
            <SelectTrigger className="h-9 text-xs rounded-lg w-[130px]">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              {TRANG_THAI_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5 mr-1" />
              Xoá lọc
            </Button>
          )}
        </div>

        {/* TABLE */}
        <div className="rounded-xl bg-card shadow-card overflow-hidden">
          <DoanTable
            groups={paged}
            isLoading={isLoading}
            userRolesMap={userRolesMap}
            onEdit={(doan) => { setEditingDoan(doan); setDrawerOpen(true); }}
            onCancel={(doan) => setCancelingDoan(doan)}
            onDelete={(doan) => setDeletingDoan(doan)}
          />
        </div>

        {/* PAGINATION */}
        {filtered.length > 0 && (
          <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
            <span>Hiển thị {showFrom}–{showTo} / {filtered.length} đoàn</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Trước
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && p - prev > 1;
                  return (
                    <span key={p} className="flex items-center">
                      {showEllipsis && <span className="px-1">…</span>}
                      <Button variant={p === page ? "default" : "outline"} size="sm"
                        className="h-8 w-8 text-xs p-0" onClick={() => setPage(p)}>{p}</Button>
                    </span>
                  );
                })}
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}>
                Sau <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <DoanDrawer
        open={drawerOpen}
        doan={editingDoan}
        onClose={() => { setDrawerOpen(false); setEditingDoan(null); }}
        onSave={handleSave}
        isSaving={createDoan.isPending || updateDoan.isPending}
      />

      <DeleteDialog
        open={!!cancelingDoan}
        name={cancelingDoan?.ten_doan || ""}
        onConfirm={handleCancel}
        onCancel={() => setCancelingDoan(null)}
        isDeleting={cancelDoan.isPending}
        variant="cancel"
      />

      <DeleteDialog
        open={!!deletingDoan}
        name={deletingDoan?.ten_doan || ""}
        onConfirm={handleDelete}
        onCancel={() => setDeletingDoan(null)}
        isDeleting={deleteDoan.isPending}
      />
    </div>
  );
}
