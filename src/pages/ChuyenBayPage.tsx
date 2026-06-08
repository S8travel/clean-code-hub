import { useState } from "react";
import { Plus, Search, Trash2, Plane } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  useChuyenBayList, useCreateChuyenBay, useUpdateChuyenBay, useDeleteChuyenBay,
  type ChuyenBay,
} from "@/hooks/use-chuyen-bay";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { t, useTranslate } from "@/lib/i18n";

type EditableField = "ma_bay" | "hang_bay" | "chang" | "gio_di" | "gio_den" | "ghi_chu";

// 1 dòng chuyến bay — input lưu onBlur (chỉ khi đổi).
function ChuyenBayRow({ cb }: { cb: ChuyenBay }) {
  useTranslate();
  const updateMut = useUpdateChuyenBay();
  const deleteMut = useDeleteChuyenBay();
  const [local, setLocal] = useState({
    ma_bay: cb.ma_bay ?? "",
    hang_bay: cb.hang_bay ?? "",
    chang: cb.chang ?? "",
    gio_di: cb.gio_di ?? "",
    gio_den: cb.gio_den ?? "",
    ghi_chu: cb.ghi_chu ?? "",
  });

  const saveField = (field: EditableField) => {
    const val = local[field].trim();
    const cur = (cb[field] ?? "") as string;
    if (val === cur) return;
    if (field === "ma_bay" && !val) {
      setLocal((p) => ({ ...p, ma_bay: cb.ma_bay })); // không cho xoá mã rỗng
      return;
    }
    updateMut.mutate({ id: cb.id, updates: { [field]: val || null } });
  };

  const cell = (field: EditableField, w: string, placeholder = "") => (
    <td className="px-2 py-1">
      <Input
        value={local[field]}
        onChange={(e) => setLocal((p) => ({ ...p, [field]: e.target.value }))}
        onBlur={() => saveField(field)}
        placeholder={placeholder}
        className={`h-7 text-xs ${w}`}
      />
    </td>
  );

  return (
    <tr className="border-b border-border/60 hover:bg-muted/20">
      {cell("ma_bay", "w-[120px] font-medium", "BR397")}
      {cell("hang_bay", "w-[140px]", t("Hãng"))}
      {cell("chang", "w-[120px]", "TPE-DAN")}
      {cell("gio_di", "w-[80px]", "19:00")}
      {cell("gio_den", "w-[80px]", "20:55")}
      {cell("ghi_chu", "min-w-[140px]", t("Ghi chú"))}
      <td className="px-2 py-1 text-right">
        <Button
          size="icon" variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          disabled={deleteMut.isPending}
          onClick={() => {
            if (!confirm(t("Xóa chuyến bay này?"))) return;
            deleteMut.mutate(cb.id, {
              onSuccess: () => toast.success(t("Đã xóa")),
              onError: () => toast.error(t("Lỗi xóa")),
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

function ChuyenBayPageContent() {
  useTranslate();
  const { data: list = [], isLoading } = useChuyenBayList();
  const createMut = useCreateChuyenBay();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ma_bay: "", hang_bay: "", chang: "", gio_di: "", gio_den: "", ghi_chu: "" });

  const filtered = list.filter((cb) =>
    [cb.ma_bay, cb.hang_bay, cb.chang].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = async () => {
    if (!form.ma_bay.trim()) { toast.warning(t("Nhập mã chuyến bay")); return; }
    try {
      await createMut.mutateAsync(form);
      setForm({ ma_bay: "", hang_bay: "", chang: "", gio_di: "", gio_den: "", ghi_chu: "" });
      setShowAdd(false);
      toast.success(t("Đã thêm chuyến bay"));
    } catch {
      toast.error(t("Lỗi thêm chuyến bay"));
    }
  };

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <Plane className="h-4 w-4" /> {t("Chuyến bay")}
          <span className="text-xs text-muted-foreground font-normal">({filtered.length})</span>
        </h2>
        <Button size="sm" className="h-8 text-xs" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {t("Thêm")}
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-lg border border-border bg-card p-3 flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{t("Mã chuyến bay")} *</label>
            <Input value={form.ma_bay} onChange={(e) => setForm((p) => ({ ...p, ma_bay: e.target.value }))} placeholder="BR397" className="h-8 text-xs w-[120px]" autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{t("Hãng")}</label>
            <Input value={form.hang_bay} onChange={(e) => setForm((p) => ({ ...p, hang_bay: e.target.value }))} placeholder="EVA Air" className="h-8 text-xs w-[140px]" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{t("Chặng")}</label>
            <Input value={form.chang} onChange={(e) => setForm((p) => ({ ...p, chang: e.target.value }))} placeholder="TPE-DAN" className="h-8 text-xs w-[120px]" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{t("Giờ đi")}</label>
            <Input value={form.gio_di} onChange={(e) => setForm((p) => ({ ...p, gio_di: e.target.value }))} placeholder="19:00" className="h-8 text-xs w-[80px]" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{t("Giờ đến")}</label>
            <Input value={form.gio_den} onChange={(e) => setForm((p) => ({ ...p, gio_den: e.target.value }))} placeholder="20:55" className="h-8 text-xs w-[80px]" />
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={handleCreate} disabled={createMut.isPending}>{t("Lưu")}</Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowAdd(false)}>{t("Hủy")}</Button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Tìm mã / hãng / chặng...")} className="h-8 text-xs pl-8" />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-[11px] font-medium text-muted-foreground">
              <th className="text-left px-2 py-2">{t("Mã chuyến bay")}</th>
              <th className="text-left px-2 py-2">{t("Hãng")}</th>
              <th className="text-left px-2 py-2">{t("Chặng")}</th>
              <th className="text-left px-2 py-2">{t("Giờ đi")}</th>
              <th className="text-left px-2 py-2">{t("Giờ đến")}</th>
              <th className="text-left px-2 py-2">{t("Ghi chú")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="p-3"><Skeleton className="h-6 w-full" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-2 py-4 text-center text-muted-foreground">{t("Chưa có chuyến bay nào.")}</td></tr>
            ) : (
              filtered.map((cb) => <ChuyenBayRow key={cb.id} cb={cb} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ChuyenBayPage() {
  const canView = usePermission("danh_muc", "view");
  if (!canView) return <AccessDenied />;
  return <ChuyenBayPageContent />;
}
