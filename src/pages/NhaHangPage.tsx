import { useState } from "react";
import { Plus, Search, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useNhaHangList, useCreateNhaHang, type NhaHang } from "@/hooks/use-nha-hang";
import { useNhaCungCapList } from "@/hooks/use-nha-cung-cap";
import { SearchableSelect } from "@/components/SearchableSelect";
import { toast } from "sonner";
import NhaHangDetail from "@/components/nha-hang/NhaHangDetail";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { t, useTranslate } from "@/lib/i18n";

function NhaHangPageContent() {
  useTranslate();
  const { data: list, isLoading } = useNhaHangList();
  const createMut = useCreateNhaHang();
  const { data: nccList } = useNhaCungCapList();
  const nccOptions = (nccList ?? []).map((n) => ({ value: String(n.id), label: n.ten }));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNccId, setNewNccId] = useState("");

  const filtered = (list ?? []).filter(
    (nh) => nh.ten.toLowerCase().includes(search.toLowerCase())
  );

  const selected = (list ?? []).find((nh) => nh.id === selectedId) ?? null;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await createMut.mutateAsync({ ten: newName.trim(), nha_cung_cap_id: newNccId ? Number(newNccId) : null });
      setSelectedId(created.id);
      setNewName("");
      setNewNccId("");
      setShowCreate(false);
      toast.success(t("Đã tạo nhà hàng"));
    } catch {
      toast.error(t("Lỗi tạo nhà hàng"));
    }
  };

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* LEFT — List: full-width mobile, ẩn khi đã chọn (mobile); cạnh trái cố định ở desktop */}
      <div className={cn(
        "w-full md:w-80 shrink-0 border-r flex-col bg-card",
        selected ? "hidden md:flex" : "flex",
      )}>
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">{t("Nhà hàng")}</h2>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowCreate(!showCreate)}>
              <Plus className="h-3 w-3 mr-1" /> {t("Thêm")}
            </Button>
          </div>
          {showCreate && (
            <div className="space-y-1">
              <Input
                placeholder={t("Tên nhà hàng *")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-7 text-xs"
                autoFocus
              />
              <div className="flex gap-1">
                <SearchableSelect
                  options={nccOptions}
                  value={newNccId}
                  onChange={setNewNccId}
                  placeholder={t("Nhà cung cấp")}
                  className="h-7 text-xs flex-1"
                />
                <Button size="sm" className="h-7 text-xs shrink-0" onClick={handleCreate} disabled={createMut.isPending}>
                  {t("Tạo")}
                </Button>
              </div>
            </div>
          )}
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
            <p className="p-3 text-xs text-muted-foreground">{t("Không tìm thấy nhà hàng")}</p>
          ) : (
            <div className="p-1">
              {filtered.map((nh) => (
                <button
                  key={nh.id}
                  onClick={() => setSelectedId(nh.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    selectedId === nh.id
                      ? "bg-accent/10 border border-accent/20"
                      : "hover:bg-muted/50"
                  )}
                >
                  <div className="font-medium text-xs truncate">{nh.ten}</div>
                  {nh.dia_diem && (
                    <div className="text-[11px] text-muted-foreground truncate">{nh.dia_diem}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* RIGHT — Detail: ẩn trên mobile khi chưa chọn; 2 cột ở desktop */}
      <div className={cn(
        "flex-1 overflow-auto flex-col",
        selected ? "flex" : "hidden md:flex",
      )}>
        {selected ? (
          <>
            {/* Nút quay lại list — chỉ mobile */}
            <button
              onClick={() => setSelectedId(null)}
              className="md:hidden sticky top-0 z-10 flex items-center gap-1 px-3 py-2.5 border-b bg-card text-sm font-medium"
            >
              <ChevronLeft className="h-4 w-4" /> {t("Nhà hàng")}
            </button>
            <NhaHangDetail
              nhaHang={selected}
              onDeleted={() => setSelectedId(null)}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t("Chọn nhà hàng để xem chi tiết")}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NhaHangPage() {
  const canView = usePermission("danh_muc", "view");
  if (!canView) return <AccessDenied />;
  return <NhaHangPageContent />;
}
