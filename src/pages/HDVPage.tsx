import { useState, useEffect } from "react";
import { Plus, Search, Trash2, Save, UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useHDVList, useCreateHDV, useUpdateHDV, useDeleteHDV, type HDVRow } from "@/hooks/use-hdv";
import { useAgents } from "@/hooks/use-doan";
import { toast } from "sonner";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";

const GIOI_TINH_OPTS = [
  { value: "nam", label: "Nam" },
  { value: "nu", label: "Nữ" },
  { value: "khac", label: "Khác" },
];

const tuoiHDV = (namSinh: number | null) => {
  if (!namSinh) return null;
  return new Date().getFullYear() - namSinh;
};

const emptyForm = (): Omit<HDVRow, "id"> => ({
  ten: "",
  gioi_tinh: null,
  nam_sinh: null,
  kinh_nghiem: null,
  chuyen_mon: null,
  agent_ids: [],
  ghi_chu: null,
  so_tai_khoan: null,
  ngan_hang: null,
});

export default function HDVPage() {
  const canView = usePermission("danh_muc", "view");
  if (!canView) return <AccessDenied />;

  const { data: list = [], isLoading } = useHDVList();
  const { data: agents = [] } = useAgents();
  const createMut = useCreateHDV();
  const updateMut = useUpdateHDV();
  const deleteMut = useDeleteHDV();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [form, setForm] = useState<Omit<HDVRow, "id">>(emptyForm());
  const [deleteTarget, setDeleteTarget] = useState<HDVRow | null>(null);
  const [dirty, setDirty] = useState(false);

  const filtered = list.filter((h) =>
    h.ten.toLowerCase().includes(search.toLowerCase())
  );

  const selected = list.find((h) => h.id === selectedId) ?? null;

  // Load form when selection changes
  useEffect(() => {
    if (selected) {
      setForm({
        ten: selected.ten,
        gioi_tinh: selected.gioi_tinh,
        nam_sinh: selected.nam_sinh,
        kinh_nghiem: selected.kinh_nghiem,
        chuyen_mon: selected.chuyen_mon,
        agent_ids: selected.agent_ids ?? [],
        ghi_chu: selected.ghi_chu,
        so_tai_khoan: selected.so_tai_khoan ?? null,
        ngan_hang: selected.ngan_hang ?? null,
      });
      setDirty(false);
    }
  }, [selectedId, list]);

  const set = (field: keyof Omit<HDVRow, "id">, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const toggleAgent = (agentId: number) => {
    const current = form.agent_ids ?? [];
    const next = current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [...current, agentId];
    set("agent_ids", next);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await createMut.mutateAsync({ ...emptyForm(), ten: newName.trim() });
      setSelectedId(created.id);
      setNewName("");
      setShowCreate(false);
      toast.success("Đã thêm hướng dẫn viên");
    } catch {
      toast.error("Lỗi khi tạo HDV");
    }
  };

  const handleSave = async () => {
    if (!selected || !form.ten.trim()) return;
    try {
      await updateMut.mutateAsync({ id: selected.id, ...form });
      setDirty(false);
      toast.success("Đã lưu");
    } catch {
      toast.error("Lỗi khi lưu");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      toast.success("Đã xóa");
    } catch {
      toast.error("Lỗi khi xóa");
    }
  };

  // Agents gắn với HDV đang chọn
  const assignedAgents = agents.filter((a) => (form.agent_ids ?? []).includes(a.id));

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* ── Left: danh sách ── */}
      <div className="w-72 shrink-0 border-r flex flex-col bg-card">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Hướng dẫn viên</h2>
            <Button
              size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => setShowCreate(!showCreate)}
            >
              <Plus className="h-3 w-3 mr-1" /> Thêm
            </Button>
          </div>
          {showCreate && (
            <div className="flex gap-1">
              <Input
                className="h-7 text-xs"
                placeholder="Tên HDV..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <Button size="sm" className="h-7 text-xs shrink-0" onClick={handleCreate}>
                Tạo
              </Button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-7 text-xs pl-7"
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Chưa có HDV</div>
          ) : (
            <div className="p-2 space-y-0.5">
              {filtered.map((hdv) => {
                const agentCount = (hdv.agent_ids ?? []).length;
                const tuoi = tuoiHDV(hdv.nam_sinh);
                return (
                  <button
                    key={hdv.id}
                    onClick={() => setSelectedId(hdv.id)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                      selectedId === hdv.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{hdv.ten}</span>
                      {agentCount > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
                          {agentCount} agent
                        </Badge>
                      )}
                    </div>
                    {(hdv.gioi_tinh || tuoi) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {hdv.gioi_tinh === "nam" ? "Nam" : hdv.gioi_tinh === "nu" ? "Nữ" : hdv.gioi_tinh ? "Khác" : ""}
                        {hdv.gioi_tinh && tuoi ? " · " : ""}
                        {tuoi ? `${tuoi} tuổi` : ""}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Right: chi tiết ── */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          <div className="text-center space-y-2">
            <UserCheck className="h-10 w-10 mx-auto opacity-30" />
            <p>Chọn một hướng dẫn viên để xem chi tiết</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold">{selected.ten}</h1>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="destructive" className="h-8 text-xs"
                  onClick={() => setDeleteTarget(selected)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Xóa
                </Button>
                <Button
                  size="sm" className="h-8 text-xs"
                  onClick={handleSave}
                  disabled={!dirty || updateMut.isPending}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {updateMut.isPending ? "Đang lưu..." : "Lưu"}
                </Button>
              </div>
            </div>

            {/* Thông tin cơ bản */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Họ tên <span className="text-destructive">*</span></Label>
                <Input
                  className="h-8 text-sm"
                  value={form.ten}
                  onChange={(e) => set("ten", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Giới tính</Label>
                <Select
                  value={form.gioi_tinh ?? ""}
                  onValueChange={(v) => set("gioi_tinh", v || null)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Chọn giới tính" />
                  </SelectTrigger>
                  <SelectContent>
                    {GIOI_TINH_OPTS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Năm sinh</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  min={1950}
                  max={new Date().getFullYear() - 18}
                  placeholder="VD: 1990"
                  value={form.nam_sinh ?? ""}
                  onChange={(e) => set("nam_sinh", e.target.value ? Number(e.target.value) : null)}
                />
                {form.nam_sinh && (
                  <p className="text-[11px] text-muted-foreground">
                    {new Date().getFullYear() - form.nam_sinh} tuổi
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Kinh nghiệm</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="VD: 5 năm, chuyên tour Tây Bắc"
                  value={form.kinh_nghiem ?? ""}
                  onChange={(e) => set("kinh_nghiem", e.target.value || null)}
                />
              </div>
            </div>

            {/* Thông tin ngân hàng */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Số tài khoản</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="VD: 012345678901"
                  value={form.so_tai_khoan ?? ""}
                  onChange={(e) => set("so_tai_khoan", e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ngân hàng</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="VD: Vietcombank"
                  value={form.ngan_hang ?? ""}
                  onChange={(e) => set("ngan_hang", e.target.value || null)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Chuyên môn</Label>
              <Textarea
                className="text-sm min-h-[80px] resize-none"
                placeholder="Mô tả chuyên môn, tuyến đường, ngôn ngữ thuyết minh..."
                value={form.chuyen_mon ?? ""}
                onChange={(e) => set("chuyen_mon", e.target.value || null)}
              />
            </div>

            {/* Agent ưu tiên */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Agent ưu tiên</Label>
                {assignedAgents.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    HDV sẽ được ưu tiên xếp cho {assignedAgents.map((a) => a.ten).join(", ")}
                  </p>
                )}
              </div>
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground">Chưa có agent nào</p>
              ) : (
                <div className="border rounded-md p-3 grid grid-cols-2 gap-2">
                  {agents.map((agent) => {
                    const checked = (form.agent_ids ?? []).includes(agent.id);
                    return (
                      <label
                        key={agent.id}
                        className={cn(
                          "flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 text-sm transition-colors",
                          checked ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleAgent(agent.id)}
                        />
                        {agent.ten}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ghi chú</Label>
              <Textarea
                className="text-sm min-h-[80px] resize-none"
                placeholder="Ghi chú thêm..."
                value={form.ghi_chu ?? ""}
                onChange={(e) => set("ghi_chu", e.target.value || null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa hướng dẫn viên?</AlertDialogTitle>
            <AlertDialogDescription>
              Xóa <strong>{deleteTarget?.ten}</strong>. Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
