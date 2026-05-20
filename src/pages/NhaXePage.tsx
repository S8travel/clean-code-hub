import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useNhaXeList, useCreateNhaXe } from "@/hooks/use-nha-xe";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import NhaXeDetail from "@/components/nha-xe/NhaXeDetail";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { t, useTranslate } from "@/lib/i18n";

function NhaXePageContent() {
  useTranslate();
  const { data: list, isLoading } = useNhaXeList();
  const { data: nccList } = useNhaCungCapList();
  const createMut = useCreateNhaXe();

  const nccOptions = (nccList ?? []).map((n) => ({ value: String(n.id), label: n.ten }));

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNccId, setNewNccId] = useState("");
  const [newDiaDiem, setNewDiaDiem] = useState("");

  const filtered = (list ?? []).filter(
    (nx) => nx.ten.toLowerCase().includes(search.toLowerCase())
  );

  const selected = (list ?? []).find((nx) => nx.id === selectedId) ?? null;

  const handleCreate = async () => {
    if (!newName.trim()) { toast.warning(t("Tên nhà xe bắt buộc")); return; }
    try {
      const created = await createMut.mutateAsync({
        ten: newName.trim(),
        nha_cung_cap_id: newNccId ? Number(newNccId) : null,
        dia_diem: newDiaDiem.trim() || undefined,
      });
      setSelectedId(created.id);
      setNewName("");
      setNewNccId("");
      setNewDiaDiem("");
      setShowCreate(false);
      toast.success(t("Đã tạo nhà xe"));
    } catch {
      toast.error(t("Lỗi tạo nhà xe"));
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* LEFT — List */}
      <div className="w-80 shrink-0 border-r flex flex-col bg-card">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">{t("Nhà xe")}</h2>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="h-3 w-3 mr-1" /> {t("Thêm")}
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder={t("Tìm kiếm...")}
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
            <p className="p-3 text-xs text-muted-foreground">{t("Không tìm thấy nhà xe")}</p>
          ) : (
            <div className="p-1">
              {filtered.map((nx) => (
                <button
                  key={nx.id}
                  onClick={() => setSelectedId(nx.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    selectedId === nx.id
                      ? "bg-accent/10 border border-accent/20"
                      : "hover:bg-muted/50"
                  )}
                >
                  <div className="font-medium text-xs truncate">{nx.ten}</div>
                  {nx.dia_diem && (
                    <div className="text-[11px] text-muted-foreground truncate">{nx.dia_diem}</div>
                  )}
                  {nx.so_dien_thoai && (
                    <div className="text-[11px] text-muted-foreground truncate">{nx.so_dien_thoai}</div>
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
          <NhaXeDetail nhaXe={selected} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t("Chọn nhà xe để xem chi tiết")}
          </div>
        )}
      </div>

      {/* Dialog tạo mới */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Thêm nhà xe mới")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{t("Tên nhà xe *")}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">{t("Nhà cung cấp")}</Label>
              <SearchableSelect
                options={nccOptions}
                value={newNccId}
                onChange={setNewNccId}
                placeholder={t("Chọn nhà cung cấp")}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">{t("Địa điểm")}</Label>
              <Input
                value={newDiaDiem}
                onChange={(e) => setNewDiaDiem(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>{t("Hủy")}</Button>
            <Button size="sm" onClick={handleCreate} disabled={createMut.isPending}>{t("Tạo")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NhaXePage() {
  const canView = usePermission("danh_muc", "view");
  if (!canView) return <AccessDenied />;
  return <NhaXePageContent />;
}
