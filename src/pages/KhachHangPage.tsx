import { useState } from "react";
import { Plus, Search, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { normalizePhone } from "@/lib/phone";
import { useKhachHangList, useCreateKhachHang } from "@/hooks/use-khach-hang";
import KhachHangDetail from "@/components/khach-hang/KhachHangDetail";

function KhachHangPageContent() {
  const { user } = useAuth();
  const { data: list, isLoading } = useKhachHangList();
  const createMut = useCreateKhachHang();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const searchNorm = normalizePhone(search);
  const filtered = (list ?? []).filter((k) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const byName = (k.ho_ten ?? "").toLowerCase().includes(q);
    const byPhone = searchNorm.length > 0 && (k.sdt_norm ?? "").includes(searchNorm);
    return byName || byPhone;
  });

  const selected = (list ?? []).find((k) => k.id === selectedId) ?? null;

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.warning("Nhập tên khách hàng");
      return;
    }
    try {
      const created = await createMut.mutateAsync({
        ho_ten: newName.trim(),
        so_dien_thoai: newPhone.trim() || null,
        created_by: user?.user_id ?? null,
        van_phong_id: user?.van_phong_id ?? null,
      });
      setSelectedId(created.id);
      setNewName("");
      setNewPhone("");
      setShowCreate(false);
      toast.success("Đã tạo khách hàng");
    } catch {
      toast.error("Lỗi tạo khách hàng");
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* List */}
      <div className={cn(
        "w-full md:w-80 shrink-0 border-r flex-col bg-card",
        selected ? "hidden md:flex" : "flex",
      )}>
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Khách hàng</h2>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-3 w-3 mr-1" /> Thêm
            </Button>
          </div>
          {showCreate && (
            <div className="space-y-1">
              <Input
                placeholder="Tên khách hàng *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-7 text-xs"
                autoFocus
              />
              <div className="flex gap-1">
                <Input
                  placeholder="Số điện thoại"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="h-7 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <Button size="sm" className="h-7 text-xs shrink-0" onClick={handleCreate} disabled={createMut.isPending}>
                  Tạo
                </Button>
              </div>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên / SĐT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Không tìm thấy khách hàng</p>
          ) : (
            <div className="p-1">
              {filtered.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setSelectedId(k.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    selectedId === k.id ? "bg-accent/10 border border-accent/20" : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-xs truncate">{k.ho_ten}</span>
                    {(k.so_doan ?? 0) > 0 && (
                      <span className="shrink-0 text-[10px] px-1.5 py-px rounded-full bg-emerald-100 text-emerald-700">
                        {k.so_doan} đoàn
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {k.so_dien_thoai || "—"}
                    {k.loai === "to_chuc" && k.ten_to_chuc ? ` · ${k.ten_to_chuc}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Detail */}
      <div className={cn(
        "flex-1 overflow-auto flex-col",
        selected ? "flex" : "hidden md:flex",
      )}>
        {selected ? (
          <>
            <button
              onClick={() => setSelectedId(null)}
              className="md:hidden sticky top-0 z-10 flex items-center gap-1 px-3 py-2.5 border-b bg-card text-sm font-medium"
            >
              <ChevronLeft className="h-4 w-4" /> Khách hàng
            </button>
            <KhachHangDetail khachHang={selected} onDeleted={() => setSelectedId(null)} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Chọn khách hàng để xem chi tiết
          </div>
        )}
      </div>
    </div>
  );
}

export default function KhachHangPage() {
  const canView = usePermission("lead", "view");
  if (!canView) return <AccessDenied />;
  return <KhachHangPageContent />;
}
