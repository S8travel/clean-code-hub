import { useState, useEffect } from "react";
import { Plus, Search, Trash2, Save, UserCheck, MapPin, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useHDVList, useCreateHDV, useUpdateHDV, useDeleteHDV, type HDVRow } from "@/hooks/use-hdv";
import { useAgents, useDiaDiem } from "@/hooks/use-doan";
import { toast } from "sonner";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { t, useTranslate } from "@/lib/i18n";

const GIOI_TINH_OPTS = [
  { value: "nam", label: "Nam" },
  { value: "nu", label: "Nữ" },
  { value: "khac", label: "Khác" },
];

const tuoiHDV = (namSinh: number | null) => {
  if (!namSinh) return null;
  return new Date().getFullYear() - namSinh;
};

const BAC_OPTS = [1, 2, 3, 4, 5];

const emptyForm = (): Omit<HDVRow, "id"> => ({
  ten: "",
  gioi_tinh: null,
  nam_sinh: null,
  kinh_nghiem: null,
  chuyen_mon: null,
  agent_ids: [],
  ghi_chu: null,
  so_dien_thoai: null,
  so_tai_khoan: null,
  ngan_hang: null,
  active: true,
  dia_diem_ids: [],
  bac: 3,
});

function HDVPageContent() {
  useTranslate();
  const { data: list = [], isLoading } = useHDVList();
  const { data: agents = [] } = useAgents();
  const { data: diaDiemList = [] } = useDiaDiem();
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
        so_dien_thoai: selected.so_dien_thoai ?? null,
        so_tai_khoan: selected.so_tai_khoan ?? null,
        ngan_hang: selected.ngan_hang ?? null,
        active: selected.active ?? true,
        dia_diem_ids: selected.dia_diem_ids ?? [],
        bac: selected.bac ?? 3,
      });
      setDirty(false);
    }
    // selected = list.find(...) — react-query structural sharing giữ ref ổn định
    // khi HDV này không đổi → effect chỉ chạy khi đổi HDV hoặc data HDV đổi thật.
  }, [selected]);

  const set = <K extends keyof Omit<HDVRow, "id">>(field: K, value: Omit<HDVRow, "id">[K]) => {
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

  const toggleDiaDiem = (ddId: number) => {
    const current = form.dia_diem_ids ?? [];
    const next = current.includes(ddId)
      ? current.filter((id) => id !== ddId)
      : [...current, ddId];
    set("dia_diem_ids", next);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const created = await createMut.mutateAsync({ ...emptyForm(), ten: newName.trim() });
      setSelectedId(created.id);
      setNewName("");
      setShowCreate(false);
      toast.success(t("Đã thêm hướng dẫn viên"));
    } catch {
      toast.error(t("Lỗi khi tạo HDV"));
    }
  };

  const handleSave = async () => {
    if (!selected || !form.ten.trim()) return;
    try {
      await updateMut.mutateAsync({ id: selected.id, ...form });
      setDirty(false);
      toast.success(t("Đã lưu"));
    } catch {
      toast.error(t("Lỗi khi lưu"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      toast.success(t("Đã xóa"));
    } catch {
      toast.error(t("Lỗi khi xóa"));
    }
  };

  // Agents gắn với HDV đang chọn
  const assignedAgents = agents.filter((a) => (form.agent_ids ?? []).includes(a.id));

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
      {/* ── Left: danh sách — full-width mobile, ẩn khi đã chọn (mobile) ── */}
      <div className={cn(
        "w-full md:w-72 shrink-0 border-r flex-col bg-card",
        selected ? "hidden md:flex" : "flex",
      )}>
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">{t("Hướng dẫn viên")}</h2>
            <Button
              size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => setShowCreate(!showCreate)}
            >
              <Plus className="h-3 w-3 mr-1" /> {t("Thêm")}
            </Button>
          </div>
          {showCreate && (
            <div className="flex gap-1">
              <Input
                className="h-7 text-xs"
                placeholder={t("Tên HDV...")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <Button size="sm" className="h-7 text-xs shrink-0" onClick={handleCreate}>
                {t("Tạo")}
              </Button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-7 text-xs pl-7"
              placeholder={t("Tìm kiếm...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">{t("Đang tải...")}</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t("Chưa có HDV")}</div>
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
                        : "hover:bg-muted/60",
                      !hdv.active && "opacity-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{hdv.ten}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {!hdv.active && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground">
                            {t("Nghỉ")}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-[10px] h-4 px-1">
                          B{hdv.bac ?? 3}
                        </Badge>
                        {agentCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">
                            {agentCount} agent
                          </Badge>
                        )}
                      </div>
                    </div>
                    {(hdv.gioi_tinh || tuoi) && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {hdv.gioi_tinh === "nam" ? t("Nam") : hdv.gioi_tinh === "nu" ? t("Nữ") : hdv.gioi_tinh ? t("Khác") : ""}
                        {hdv.gioi_tinh && tuoi ? " · " : ""}
                        {tuoi ? `${tuoi} ${t("tuổi")}` : ""}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Right: chi tiết — ẩn trên mobile khi chưa chọn ── */}
      {!selected ? (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground text-sm">
          <div className="text-center space-y-2">
            <UserCheck className="h-10 w-10 mx-auto opacity-30" />
            <p>{t("Chọn một hướng dẫn viên để xem chi tiết")}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Nút quay lại list — chỉ mobile */}
          <button
            onClick={() => setSelectedId(null)}
            className="md:hidden sticky top-0 z-10 flex items-center gap-1 px-3 py-2.5 border-b bg-card text-sm font-medium w-full"
          >
            <ChevronLeft className="h-4 w-4" /> {t("Hướng dẫn viên")}
          </button>
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold">{selected.ten}</h1>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.active}
                    onCheckedChange={(v) => set("active", v)}
                  />
                  <span className={cn("text-xs font-medium", form.active ? "text-green-600" : "text-muted-foreground")}>
                    {form.active ? t("Đang hoạt động") : t("Tạm nghỉ")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="destructive" className="h-8 text-xs"
                  onClick={() => setDeleteTarget(selected)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("Xóa")}
                </Button>
                <Button
                  size="sm" className="h-8 text-xs"
                  onClick={handleSave}
                  disabled={!dirty || updateMut.isPending}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {updateMut.isPending ? t("Đang lưu...") : t("Lưu")}
                </Button>
              </div>
            </div>

            {/* Thông tin cơ bản */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Họ tên")} <span className="text-destructive">*</span></Label>
                <Input
                  className="h-8 text-sm"
                  value={form.ten}
                  onChange={(e) => set("ten", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Giới tính")}</Label>
                <Select
                  value={form.gioi_tinh ?? ""}
                  onValueChange={(v) => set("gioi_tinh", v || null)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <span>{!form.gioi_tinh ? t("Chọn giới tính") : t(GIOI_TINH_OPTS.find((o) => o.value === form.gioi_tinh)?.label ?? "")}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {GIOI_TINH_OPTS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{t(o.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Bậc HDV")}</Label>
                <Select
                  value={String(form.bac ?? 3)}
                  onValueChange={(v) => set("bac", Number(v))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <span>{t("Bậc")} {form.bac ?? 3}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {BAC_OPTS.map((b) => (
                      <SelectItem key={b} value={String(b)}>{t("Bậc")} {b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{t("Bậc 1 được ưu tiên xếp trước")}</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Năm sinh")}</Label>
                <Input
                  className="h-8 text-sm"
                  type="number"
                  min={1950}
                  max={new Date().getFullYear() - 18}
                  placeholder={t("VD: 1990")}
                  value={form.nam_sinh ?? ""}
                  onChange={(e) => set("nam_sinh", e.target.value ? Number(e.target.value) : null)}
                />
                {form.nam_sinh && (
                  <p className="text-[11px] text-muted-foreground">
                    {new Date().getFullYear() - form.nam_sinh} {t("tuổi")}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Số điện thoại")}</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder={t("VD: 0901234567")}
                  value={form.so_dien_thoai ?? ""}
                  onChange={(e) => set("so_dien_thoai", e.target.value || null)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("Kinh nghiệm")}</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder={t("VD: 5 năm, chuyên tour Tây Bắc")}
                  value={form.kinh_nghiem ?? ""}
                  onChange={(e) => set("kinh_nghiem", e.target.value || null)}
                />
              </div>
            </div>

            {/* Thông tin ngân hàng */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Số tài khoản")}</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder={t("VD: 012345678901")}
                  value={form.so_tai_khoan ?? ""}
                  onChange={(e) => set("so_tai_khoan", e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Ngân hàng")}</Label>
                <Input
                  className="h-8 text-sm"
                  placeholder={t("VD: Vietcombank")}
                  value={form.ngan_hang ?? ""}
                  onChange={(e) => set("ngan_hang", e.target.value || null)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("Chuyên môn")}</Label>
              <Textarea
                className="text-sm min-h-[80px] resize-none"
                placeholder={t("Mô tả chuyên môn, tuyến đường, ngôn ngữ thuyết minh...")}
                value={form.chuyen_mon ?? ""}
                onChange={(e) => set("chuyen_mon", e.target.value || null)}
              />
            </div>

            {/* Agent ưu tiên */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">{t("Agent ưu tiên")}</Label>
                {assignedAgents.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("HDV sẽ được ưu tiên xếp cho")} {assignedAgents.map((a) => a.ten).join(", ")}
                  </p>
                )}
              </div>
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("Chưa có agent nào")}</p>
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

            {/* Địa điểm hoạt động */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {t("Địa điểm hoạt động")}
                </Label>
                {(form.dia_diem_ids ?? []).length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {(form.dia_diem_ids ?? []).length} {t("địa điểm được chọn")}
                  </p>
                )}
              </div>
              {diaDiemList.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("Chưa có địa điểm nào")}</p>
              ) : (
                <div className="border rounded-md p-3 grid grid-cols-2 gap-2">
                  {diaDiemList.map((dd) => {
                    const checked = (form.dia_diem_ids ?? []).includes(dd.id);
                    return (
                      <label
                        key={dd.id}
                        className={cn(
                          "flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 text-sm transition-colors",
                          checked ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleDiaDiem(dd.id)}
                        />
                        {dd.ten}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t("Ghi chú")}</Label>
              <Textarea
                className="text-sm min-h-[80px] resize-none"
                placeholder={t("Ghi chú thêm...")}
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
            <AlertDialogTitle>{t("Xóa hướng dẫn viên?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Xóa")} <strong>{deleteTarget?.ten}</strong>. {t("Hành động này không thể hoàn tác.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Hủy")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("Xóa")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function HDVPage() {
  const canView = usePermission("danh_muc", "view");
  if (!canView) return <AccessDenied />;
  return <HDVPageContent />;
}
