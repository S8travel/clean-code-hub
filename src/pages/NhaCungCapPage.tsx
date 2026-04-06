import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useNhaCungCapList, useCreateNhaCungCap, type NhaCungCap } from "@/hooks/use-nha-cung-cap";
import { toast } from "sonner";
import NhaCungCapDetail from "@/components/nha-cung-cap/NhaCungCapDetail";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";

export default function NhaCungCapPage() {
  const canView = usePermission("danh_muc", "view");
  if (!canView) return <AccessDenied />;
  const { data: list, isLoading } = useNhaCungCapList();
  const createMut = useCreateNhaCungCap();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  const filtered = (list ?? []).filter(
    (ncc) => ncc.ten.toLowerCase().includes(search.toLowerCase())
  );

  const selected = (list ?? []).find((ncc) => ncc.id === selectedId) ?? null;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await createMut.mutateAsync({ ten: newName.trim() });
      setSelectedId(created.id);
      setNewName("");
      setShowCreate(false);
      toast.success("Đã tạo nhà cung cấp");
    } catch {
      toast.error("Lỗi tạo nhà cung cấp");
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      <div className="w-80 shrink-0 border-r flex flex-col bg-card">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Nhà cung cấp</h2>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-3 w-3 mr-1" /> Thêm
            </Button>
          </div>
          {showCreate && (
            <div className="flex gap-1">
              <Input
                placeholder="Tên NCC *"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-7 text-xs"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <Button size="sm" className="h-7 text-xs shrink-0" onClick={handleCreate} disabled={createMut.isPending}>
                Tạo
              </Button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm..."
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
            <p className="p-3 text-xs text-muted-foreground">Không tìm thấy NCC</p>
          ) : (
            <div className="p-1">
              {filtered.map((ncc) => (
                <button
                  key={ncc.id}
                  onClick={() => setSelectedId(ncc.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    selectedId === ncc.id
                      ? "bg-accent/10 border border-accent/20"
                      : "hover:bg-muted/50"
                  )}
                >
                  <div className="font-medium text-xs truncate">{ncc.ten}</div>
                  {ncc.dia_diem && (
                    <div className="text-[11px] text-muted-foreground truncate">{ncc.dia_diem}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 overflow-auto">
        {selected ? (
          <NhaCungCapDetail
            nhaCungCap={selected}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Chọn nhà cung cấp để xem chi tiết
          </div>
        )}
      </div>
    </div>
  );
}
