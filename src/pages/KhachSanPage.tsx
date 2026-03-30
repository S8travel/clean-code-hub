import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useKhachSanList, useCreateKhachSan, type KhachSan } from "@/hooks/use-khach-san";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import KhachSanDetail from "@/components/khach-san/KhachSanDetail";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export default function KhachSanPage() {
  const { data: list, isLoading } = useKhachSanList();
  const { data: nccList } = useNhaCungCapList();
  const createMut = useCreateKhachSan();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNccId, setNewNccId] = useState("");
  const [newDiaDiem, setNewDiaDiem] = useState("");

  const nccOptions = (nccList ?? []).map((n) => ({ value: String(n.id), label: n.ten }));

  const filtered = (list ?? []).filter(
    (ks) => ks.ten.toLowerCase().includes(search.toLowerCase())
  );

  const selected = (list ?? []).find((ks) => ks.id === selectedId) ?? null;

  const handleCreate = async () => {
    if (!newName.trim()) { toast.warning("Tên khách sạn bắt buộc"); return; }
    if (!newNccId) { toast.warning("Vui lòng chọn nhà cung cấp"); return; }
    try {
      const created = await createMut.mutateAsync({
        ten: newName.trim(),
        nha_cung_cap_id: Number(newNccId),
        dia_diem: newDiaDiem.trim() || undefined,
      });
      setSelectedId(created.id);
      setNewName("");
      setNewNccId("");
      setNewDiaDiem("");
      setShowCreate(false);
      toast.success("Đã tạo khách sạn");
    } catch {
      toast.error("Lỗi tạo khách sạn");
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      <div className="w-80 shrink-0 border-r flex flex-col bg-card">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Khách sạn</h2>
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
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Không tìm thấy khách sạn</p>
          ) : (
            <div className="p-1">
              {filtered.map((ks) => (
                <button
                  key={ks.id}
                  onClick={() => setSelectedId(ks.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    selectedId === ks.id
                      ? "bg-accent/10 border border-accent/20"
                      : "hover:bg-muted/50"
                  )}
                >
                  <div className="font-medium text-xs truncate">{ks.ten}</div>
                  {ks.dia_diem && (
                    <div className="text-[11px] text-muted-foreground truncate">{ks.dia_diem}</div>
                  )}
                  {ks.email && (
                    <div className="text-[11px] text-muted-foreground truncate">{ks.email}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 overflow-auto">
        {selected ? (
          <KhachSanDetail khachSan={selected} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Chọn khách sạn để xem chi tiết
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm khách sạn mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tên khách sạn *</Label>
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
            <div>
              <Label className="text-xs">Địa điểm</Label>
              <Input
                value={newDiaDiem}
                onChange={(e) => setNewDiaDiem(e.target.value)}
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
