import { useState, useId } from "react";
import {
  Panel, PanelGroup, PanelResizeHandle,
} from "react-resizable-panels";
import {
  CalendarCheck, Plus, Trash2, Play, Save, ChevronDown, ChevronRight, Zap, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useHDVList } from "@/hooks/use-hdv";
import { useAgents, useDiaDiem } from "@/hooks/use-doan";
import {
  useDoanForXep,
  useSaveHDVAssignments,
  assignHDVs,
  type TourInput,
} from "@/hooks/use-xep-hdv";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";

// ─── Form nhập đoàn thủ công ──────────────────────────────────────
const emptyManual = (): Omit<TourInput, "assigned_hdv_id"> => ({
  ten_doan: "",
  ngay_di: "",
  ngay_ve: "",
  chuyen_bay_don: null,
  chuyen_bay_tien: null,
  agent_id: null,
  dia_diem_id: null,
  is_chained: false,
});

function formatDate(d: string) {
  if (!d) return "?";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

// ─── Component: kết quả 1 HDV ─────────────────────────────────────
function HDVResultCard({
  hdvId,
  hdvName,
  tours,
  allHdvs,
  onReassign,
}: {
  hdvId: number | null;
  hdvName: string;
  tours: TourInput[];
  allHdvs: { id: number; ten: string }[];
  onReassign: (tourIndex: number, newHdvId: number | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const isUnassigned = hdvId === null;

  return (
    <div className={cn("border rounded-lg overflow-hidden", isUnassigned && "border-destructive/40")}>
      {/* Header */}
      <button
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left",
          isUnassigned ? "bg-destructive/5" : "bg-[#E6F1FB]"
        )}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        {isUnassigned ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
        ) : (
          <CalendarCheck className="h-3.5 w-3.5 text-primary shrink-0" />
        )}
        <span className={isUnassigned ? "text-destructive" : ""}>{hdvName}</span>
        <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
          {tours.length} đoàn
        </Badge>
      </button>

      {/* Rows */}
      {open && (
        <div className="divide-y">
          {tours.map((tour, idx) => (
            <div key={idx} className="px-3 py-2 text-xs flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Chain indicator */}
                {tour.is_chained && (
                  <span className="flex items-center gap-0.5 text-amber-600 font-medium shrink-0">
                    <Zap className="h-3 w-3" /> Ghép chuyến
                  </span>
                )}
                <span className="font-medium">{tour.ten_doan}</span>
                {!tour.doan_id && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground">
                    Thủ công
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
                <span>{formatDate(tour.ngay_di)} → {formatDate(tour.ngay_ve)}</span>
                {tour.dia_diem_ten && <span>{tour.dia_diem_ten}</span>}
                {tour.agent_ten && <span className="text-[10px]">{tour.agent_ten}</span>}
                {(tour.chuyen_bay_tien || tour.chuyen_bay_don) && (
                  <span className="text-[10px]">
                    {tour.chuyen_bay_tien && `↑${tour.chuyen_bay_tien}`}
                    {tour.chuyen_bay_tien && tour.chuyen_bay_don ? " · " : ""}
                    {tour.chuyen_bay_don && `↓${tour.chuyen_bay_don}`}
                  </span>
                )}
                {/* Reassign */}
                <Select
                  value={tour.assigned_hdv_id?.toString() ?? "none"}
                  onValueChange={(v) => onReassign(idx, v === "none" ? null : Number(v))}
                >
                  <SelectTrigger className="h-6 text-[11px] w-36 ml-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Chưa xếp —</SelectItem>
                    {allHdvs.map((h) => (
                      <SelectItem key={h.id} value={h.id.toString()}>{h.ten}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function XepHDVPage() {
  const canView = usePermission("doan", "view");
  if (!canView) return <AccessDenied />;

  const id = useId();

  // Lookup data
  const { data: hdvList = [] } = useHDVList();
  const { data: agents = [] } = useAgents();
  const { data: diaDiemList = [] } = useDiaDiem();

  // Filter DB
  const [dbFrom, setDbFrom] = useState("");
  const [dbTo, setDbTo] = useState("");
  const [filterActive, setFilterActive] = useState<{ from: string; to: string } | null>(null);
  const [hideWithHdv, setHideWithHdv] = useState(true);
  const { data: dbTours = [], isFetching: dbFetching } = useDoanForXep(filterActive) as {
    data: (TourInput & { _has_hdv?: boolean })[];
    isFetching: boolean;
  };

  // Danh sách đoàn đã chọn (từ DB + thủ công)
  const [selectedDoanIds, setSelectedDoanIds] = useState<Set<string>>(new Set()); // "db-{id}" | "manual-{idx}"
  const [manualTours, setManualTours] = useState<(Omit<TourInput, "assigned_hdv_id"> & { _key: string })[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState(emptyManual());

  // HDV pool
  const [hdvMode, setHdvMode] = useState<"all" | "manual">("all");
  const [selectedHdvIds, setSelectedHdvIds] = useState<Set<number>>(new Set());

  // Kết quả
  const [result, setResult] = useState<TourInput[] | null>(null);

  const saveMut = useSaveHDVAssignments();

  // ── helpers ──
  const activeHdvs = hdvList.filter((h) => h.active);
  const poolHdvs = hdvMode === "all" ? activeHdvs : activeHdvs.filter((h) => selectedHdvIds.has(h.id));

  const displayDbTours = hideWithHdv ? dbTours.filter((t) => !t._has_hdv) : dbTours;

  function toggleDbTour(doan_id: number) {
    const key = `db-${doan_id}`;
    setSelectedDoanIds((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setResult(null);
  }

  function addManualTour() {
    if (!manualForm.ten_doan || !manualForm.ngay_di || !manualForm.ngay_ve) {
      toast.error("Cần nhập tên đoàn, ngày đi và ngày về");
      return;
    }
    if (manualForm.ngay_di > manualForm.ngay_ve) {
      toast.error("Ngày đi phải trước ngày về");
      return;
    }
    const key = `manual-${Date.now()}`;
    const diaDiemTen = diaDiemList.find((d) => d.id === manualForm.dia_diem_id)?.ten;
    const agentTen = agents.find((a) => a.id === manualForm.agent_id)?.ten;
    setManualTours((prev) => [...prev, { ...manualForm, dia_diem_ten: diaDiemTen, agent_ten: agentTen, _key: key }]);
    setSelectedDoanIds((prev) => new Set([...prev, key]));
    setManualForm(emptyManual());
    setShowManualForm(false);
    setResult(null);
  }

  function removeManualTour(key: string) {
    setManualTours((prev) => prev.filter((t) => t._key !== key));
    setSelectedDoanIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
    setResult(null);
  }

  // Tổng hợp tours đã chọn
  function getSelectedTours(): TourInput[] {
    const tours: TourInput[] = [];
    for (const key of selectedDoanIds) {
      if (key.startsWith("db-")) {
        const id = Number(key.replace("db-", ""));
        const t = dbTours.find((d) => d.doan_id === id);
        if (t) tours.push({ ...t, assigned_hdv_id: null, is_chained: false });
      } else {
        const manual = manualTours.find((m) => m._key === key);
        if (manual) tours.push({ ...manual, assigned_hdv_id: null, is_chained: false });
      }
    }
    return tours;
  }

  function handleRun() {
    const tours = getSelectedTours();
    if (tours.length === 0) { toast.error("Chưa chọn đoàn nào"); return; }
    if (poolHdvs.length === 0) { toast.error("Không có hướng dẫn viên nào trong pool"); return; }
    const res = assignHDVs(tours, poolHdvs);
    setResult(res);
  }

  // Reassign tay từ result
  function handleReassign(tourIdx: number, newHdvId: number | null) {
    if (!result) return;
    setResult((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[tourIdx] = { ...next[tourIdx], assigned_hdv_id: newHdvId, is_chained: false };
      return next;
    });
  }

  // Lưu vào DB
  async function handleSave() {
    if (!result) return;
    const toSave = result.filter((t) => t.doan_id != null);
    const skipped = result.filter((t) => t.doan_id == null).length;
    if (toSave.length === 0) {
      toast.error("Không có đoàn nào từ DB để lưu");
      return;
    }
    try {
      await saveMut.mutateAsync(
        toSave.map((t) => ({ doan_id: t.doan_id!, hdv_id: t.assigned_hdv_id }))
      );
      toast.success(`Đã lưu ${toSave.length} đoàn${skipped > 0 ? ` · ${skipped} đoàn thủ công không lưu được vào DB` : ""}`);
    } catch {
      toast.error("Lỗi khi lưu");
    }
  }

  // Nhóm kết quả theo HDV
  const groupedResult = (() => {
    if (!result) return null;
    const map = new Map<number | null, TourInput[]>();
    for (const tour of result) {
      const key = tour.assigned_hdv_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tour);
    }
    return map;
  })();

  const hdvMap = new Map(hdvList.map((h) => [h.id, h.ten]));
  const unassignedCount = result?.filter((t) => t.assigned_hdv_id === null).length ?? 0;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-sm">Xếp hướng dẫn viên</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleRun} disabled={selectedDoanIds.size === 0}>
            <Play className="h-3.5 w-3.5" /> Chạy xếp
          </Button>
          <Button
            size="sm" variant="outline" className="h-8 text-xs gap-1.5"
            onClick={handleSave}
            disabled={!result || saveMut.isPending}
          >
            <Save className="h-3.5 w-3.5" />
            {saveMut.isPending ? "Đang lưu..." : "Xác nhận & Lưu"}
          </Button>
        </div>
      </div>

      {/* Main panels */}
      <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* ── Left panel: cấu hình ── */}
        <Panel defaultSize={32} minSize={24}>
          <ScrollArea className="h-full">
            <div className="p-3 space-y-4">

              {/* Section: Đoàn cần xếp */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Đoàn cần xếp ({selectedDoanIds.size})
                </p>

                {/* Filter từ DB */}
                <div className="border rounded-md p-2.5 space-y-2">
                  <p className="text-xs font-medium">Lấy từ DB</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Từ ngày</Label>
                      <Input
                        type="date" className="h-7 text-xs"
                        value={dbFrom}
                        onChange={(e) => { setDbFrom(e.target.value); setResult(null); }}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground">Đến ngày</Label>
                      <Input
                        type="date" className="h-7 text-xs"
                        value={dbTo}
                        onChange={(e) => { setDbTo(e.target.value); setResult(null); }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={hideWithHdv}
                        onCheckedChange={(v) => setHideWithHdv(!!v)}
                      />
                      Chỉ đoàn chưa có HDV
                    </label>
                    <Button
                      size="sm" variant="outline" className="h-6 text-xs ml-auto"
                      disabled={!dbFrom || !dbTo}
                      onClick={() => { setFilterActive({ from: dbFrom, to: dbTo }); setResult(null); }}
                    >
                      {dbFetching ? "Đang tải..." : "Tải"}
                    </Button>
                  </div>

                  {/* Danh sách từ DB */}
                  {displayDbTours.length > 0 && (
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {displayDbTours.map((tour) => {
                        const key = `db-${tour.doan_id}`;
                        const checked = selectedDoanIds.has(key);
                        return (
                          <label
                            key={key}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors",
                              checked ? "bg-primary/10" : "hover:bg-muted/50"
                            )}
                          >
                            <Checkbox checked={checked} onCheckedChange={() => toggleDbTour(tour.doan_id!)} />
                            <div className="min-w-0">
                              <span className="font-medium truncate">{tour.ten_doan}</span>
                              <span className="text-muted-foreground ml-1.5 text-[10px]">
                                {formatDate(tour.ngay_di)}→{formatDate(tour.ngay_ve)}
                                {tour.dia_diem_ten ? ` · ${tour.dia_diem_ten}` : ""}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {filterActive && displayDbTours.length === 0 && !dbFetching && (
                    <p className="text-xs text-muted-foreground text-center py-1">Không có đoàn nào</p>
                  )}
                </div>

                {/* Đoàn thủ công */}
                {manualTours.length > 0 && (
                  <div className="space-y-0.5">
                    {manualTours.map((tour) => {
                      const checked = selectedDoanIds.has(tour._key);
                      return (
                        <div key={tour._key} className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                          checked ? "bg-primary/10" : "hover:bg-muted/50"
                        )}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => {
                              setSelectedDoanIds((prev) => {
                                const next = new Set(prev);
                                next.has(tour._key) ? next.delete(tour._key) : next.add(tour._key);
                                return next;
                              });
                              setResult(null);
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{tour.ten_doan}</span>
                            <Badge variant="outline" className="text-[9px] h-3.5 px-1 ml-1">Thủ công</Badge>
                            <span className="text-muted-foreground ml-1 text-[10px]">
                              {formatDate(tour.ngay_di)}→{formatDate(tour.ngay_ve)}
                            </span>
                          </div>
                          <button
                            onClick={() => removeManualTour(tour._key)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Form thêm thủ công */}
                {showManualForm ? (
                  <div className="border rounded-md p-2.5 space-y-2 bg-muted/30">
                    <p className="text-xs font-medium">Thêm đoàn thủ công</p>
                    <Input
                      className="h-7 text-xs" placeholder="Tên đoàn *"
                      value={manualForm.ten_doan}
                      onChange={(e) => setManualForm((p) => ({ ...p, ten_doan: e.target.value }))}
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Ngày đi *</Label>
                        <Input
                          type="date" className="h-7 text-xs"
                          value={manualForm.ngay_di}
                          onChange={(e) => setManualForm((p) => ({ ...p, ngay_di: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Ngày về *</Label>
                        <Input
                          type="date" className="h-7 text-xs"
                          value={manualForm.ngay_ve}
                          onChange={(e) => setManualForm((p) => ({ ...p, ngay_ve: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Chuyến bay tiễn</Label>
                        <Input
                          className="h-7 text-xs" placeholder="VD: VJ100"
                          value={manualForm.chuyen_bay_tien ?? ""}
                          onChange={(e) => setManualForm((p) => ({ ...p, chuyen_bay_tien: e.target.value || null }))}
                        />
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Chuyến bay đón</Label>
                        <Input
                          className="h-7 text-xs" placeholder="VD: VJ101"
                          value={manualForm.chuyen_bay_don ?? ""}
                          onChange={(e) => setManualForm((p) => ({ ...p, chuyen_bay_don: e.target.value || null }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Địa điểm</Label>
                        <Select
                          value={manualForm.dia_diem_id?.toString() ?? ""}
                          onValueChange={(v) => setManualForm((p) => ({ ...p, dia_diem_id: v ? Number(v) : null }))}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Chọn..." />
                          </SelectTrigger>
                          <SelectContent>
                            {diaDiemList.map((d) => (
                              <SelectItem key={d.id} value={d.id.toString()}>{d.ten}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-muted-foreground">Agent</Label>
                        <Select
                          value={manualForm.agent_id?.toString() ?? ""}
                          onValueChange={(v) => setManualForm((p) => ({ ...p, agent_id: v ? Number(v) : null }))}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Chọn..." />
                          </SelectTrigger>
                          <SelectContent>
                            {agents.map((a) => (
                              <SelectItem key={a.id} value={a.id.toString()}>{a.ten}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-7 text-xs flex-1" onClick={addManualTour}>Thêm</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowManualForm(false)}>Hủy</Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm" variant="outline" className="w-full h-7 text-xs gap-1"
                    onClick={() => setShowManualForm(true)}
                  >
                    <Plus className="h-3 w-3" /> Thêm đoàn thủ công
                  </Button>
                )}
              </div>

              {/* Section: Hướng dẫn viên */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Hướng dẫn viên
                </p>
                <div className="border rounded-md p-2.5 space-y-2">
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="radio" name={`hdv-mode-${id}`}
                        checked={hdvMode === "all"}
                        onChange={() => setHdvMode("all")}
                        className="accent-primary"
                      />
                      Tất cả đang hoạt động
                      <span className="text-muted-foreground">({activeHdvs.length})</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="radio" name={`hdv-mode-${id}`}
                        checked={hdvMode === "manual"}
                        onChange={() => setHdvMode("manual")}
                        className="accent-primary"
                      />
                      Chọn thủ công
                    </label>
                  </div>

                  {hdvMode === "manual" && (
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {activeHdvs.map((hdv) => {
                        const checked = selectedHdvIds.has(hdv.id);
                        return (
                          <label
                            key={hdv.id}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors",
                              checked ? "bg-primary/10" : "hover:bg-muted/50"
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => {
                                setSelectedHdvIds((prev) => {
                                  const next = new Set(prev);
                                  next.has(hdv.id) ? next.delete(hdv.id) : next.add(hdv.id);
                                  return next;
                                });
                                setResult(null);
                              }}
                            />
                            {hdv.ten}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    Pool: {poolHdvs.length} HDV
                  </p>
                </div>
              </div>
            </div>
          </ScrollArea>
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors" />

        {/* ── Right panel: kết quả ── */}
        <Panel minSize={40}>
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {!result ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                  <CalendarCheck className="h-10 w-10 opacity-20" />
                  <p className="text-sm">Chọn đoàn và HDV, rồi bấm "Chạy xếp"</p>
                </div>
              ) : (
                <>
                  {/* Stats */}
                  <div className="flex items-center gap-3 pb-1 text-xs text-muted-foreground">
                    <span>{result.length} đoàn</span>
                    <span>·</span>
                    <span>{groupedResult!.size - (unassignedCount > 0 ? 1 : 0)} HDV được xếp</span>
                    {unassignedCount > 0 && (
                      <span className="text-destructive font-medium">· {unassignedCount} chưa xếp được</span>
                    )}
                    {result.some((t) => t.is_chained) && (
                      <span className="text-amber-600 flex items-center gap-0.5">
                        <Zap className="h-3 w-3" /> {result.filter((t) => t.is_chained).length} ghép chuyến
                      </span>
                    )}
                  </div>

                  {/* Unassigned first */}
                  {unassignedCount > 0 && groupedResult!.has(null) && (
                    <HDVResultCard
                      hdvId={null}
                      hdvName="Chưa xếp được"
                      tours={groupedResult!.get(null)!}
                      allHdvs={activeHdvs}
                      onReassign={(idx, newHdvId) => {
                        // Tìm global index trong result
                        const unassigned = result.filter((t) => t.assigned_hdv_id === null);
                        const tourToReassign = unassigned[idx];
                        const globalIdx = result.findIndex((t) => t === tourToReassign);
                        handleReassign(globalIdx, newHdvId);
                      }}
                    />
                  )}

                  {/* Grouped by HDV */}
                  {[...groupedResult!.entries()]
                    .filter(([hdvId]) => hdvId !== null)
                    .sort(([a], [b]) => (hdvMap.get(a!)?.localeCompare(hdvMap.get(b!) ?? "") ?? 0))
                    .map(([hdvId, tours]) => (
                      <HDVResultCard
                        key={hdvId}
                        hdvId={hdvId}
                        hdvName={hdvMap.get(hdvId!) ?? `HDV #${hdvId}`}
                        tours={tours}
                        allHdvs={activeHdvs}
                        onReassign={(idx, newHdvId) => {
                          const tourToReassign = tours[idx];
                          const globalIdx = result.findIndex((t) => t === tourToReassign);
                          handleReassign(globalIdx, newHdvId);
                        }}
                      />
                    ))}
                </>
              )}
            </div>
          </ScrollArea>
        </Panel>
      </PanelGroup>
    </div>
  );
}
