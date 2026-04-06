import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useDonViVisaList, useCreateDonViVisa } from "@/hooks/use-visa";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import DonViVisaDetail from "@/components/visa/DonViVisaDetail";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";

export default function VisaPage() {
  const canView = usePermission("danh_muc", "view");
  if (!canView) return <AccessDenied />;
  const { data: list, isLoading } = useDonViVisaList();
  const { data: nccList } = useNhaCungCapList();
  const createMut = useCreateDonViVisa();

  const nccOptions = (nccList ?? []).map((n) => ({ value: String(n.id), label: n.ten }));

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNccId, setNewNccId] = useState("");

  const filtered = (list ?? []).filter(
    (v) => v.ten.toLowerCase().includes(search.toLowerCase())
  );

  const selected = (list ?? []).find((v) => v.id === selectedId) ?? null;

  const handleCreate = async () => {
    if (!newName.trim()) { toast.warning("Tên đơn vị bắt buộc"); return; }
    if (!newNccId) { toast.warning("Vui lòng chọn nhà cung cấp"); return; }
    try {
      const created = await createMut.mutateAsync({
        ten: newName.trim(),
        nha_cung_cap_id: Number(newNccId),
      });
      setSelectedId(created.id);
      setNewName("");
      setNewNccId("");
      setShowCreate(false);
      toast.success("Đã tạo đơn vị visa");
    } catch {
      toast.error("Lỗi tạo đơn vị visa");
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* LEFT — List */}
      <div className="w-80 shrink-0 border-r flex flex-col bg-card">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Visa</h2>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="h-3 w-3 mr-1" /> Thêm
            </Button>
          </div>
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
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Không tìm thấy đơn vị visa</p>
          ) : (
            <div className="p-1">
              {filtered.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedId(v.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    selectedId === v.id
                      ? "bg-accent/10 border border-accent/20"
                      : "hover:bg-muted/50"
                  )}
                >
                  <div className="font-medium text-xs truncate">{v.ten}</div>
                  {v.so_dien_thoai && (
                    <div className="text-[11px] text-muted-foreground truncate">{v.so_dien_thoai}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* RIGHT — Detail */}
      <div className="flex-1 overflow-auto">
        {selected ? (
          <DonViVisaDetail donViVisa={selected} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Chọn đơn vị visa để xem chi tiết
          </div>
        )}
      </div>

      {/* Dialog tạo mới */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm đơn vị visa mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tên đơn vị *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Nhà cung cấp *</Label>
              <SearchableSelect
                options={nccOptions}
                value={newNccId}
                onChange={setNewNccId}
                placeholder="Chọn nhà cung cấp"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>Hủy</Button>
            <Button size="sm" onClick={handleCreate} disabled={createMut.isPending}>Tạo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
