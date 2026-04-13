import { useState, useId, useRef } from "react";
import * as XLSX from "xlsx";
import { parseISO, eachDayOfInterval, format } from "date-fns";
import {
  Panel, PanelGroup, PanelResizeHandle,
} from "react-resizable-panels";
import {
  CalendarCheck, Trash2, Play, Save, ChevronDown, ChevronRight, Zap, AlertCircle,
  Upload, Download, LayoutGrid, List, Lock, Check,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useHDVList } from "@/hooks/use-hdv";
import { useAgents, useDiaDiem } from "@/hooks/use-doan";
import {
  useDoanForXep,
  useSaveHDVAssignments,
  assignHDVs,
  getSuggestions,
  type TourInput,
} from "@/hooks/use-xep-hdv";
import { usePermission } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";

// ─── Parse ngày từ Excel ──────────────────────────────────────────
// Dùng cellDates: false → serial number hoặc string, tránh lỗi timezone của JS Date
function parseExcelDate(raw: any): string {
  if (raw == null || raw === "") return "";

  // Serial number Excel (cellDates: false) — tính thủ công bằng UTC tránh lệch timezone
  if (typeof raw === "number" && raw > 0) {
    // Excel epoch: Dec 30, 1899 UTC
    // Excel có bug coi năm 1900 là năm nhuận (serial 60 = 29/2/1900 không tồn tại)
    // → serial >= 60 thì trừ 1 để bù lại
    const serial = raw >= 60 ? raw - 1 : raw;
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dy = String(d.getUTCDate()).padStart(2, "0");
    if (y >= 1900 && y <= 2200) return `${y}-${mo}-${dy}`;
    return "";
  }

  const s = String(raw).trim();
  if (!s) return "";

  // D/M/YYYY hoặc DD/MM/YYYY (định dạng Việt Nam)
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return "";
}

// ─── Tải file mẫu Excel ───────────────────────────────────────────
function downloadTemplate() {
  // Thứ tự cột theo file mẫu chuẩn
  const headers = [
    "ten_doan", "hdv", "agent", "ngay_di", "ngay_ve",
    "chuyen_bay_tien", "chuyen_bay_don", "dia_diem", "so_khach", "ghi_chu",
  ];
  const example = [
    "Tour Hà Nội 1", "", "Agent ABC", "15/04/2026", "20/04/2026", "VJ100", "VJ101", "Hà Nội", 20, "",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map(() => ({ wch: 20 }));

  // Format cột ngay_di (D) và ngay_ve (E) là Text để Excel không tự convert
  for (let r = 1; r <= 1000; r++) {
    ["D", "E"].forEach((col) => {
      const addr = `${col}${r + 1}`;
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      ws[addr].z = "@";
    });
  }
  ws["D2"] = { t: "s", v: "15/04/2026", z: "@" };
  ws["E2"] = { t: "s", v: "20/04/2026", z: "@" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Danh sách đoàn");
  XLSX.writeFile(wb, "mau_xep_hdv.xlsx");
}

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
  getSuggestionsForTour,
}: {
  hdvId: number | null;
  hdvName: string;
  tours: TourInput[];
  allHdvs: { id: number; ten: string }[];
  onReassign: (tourIdx: number, newHdvId: number | null) => void;
  getSuggestionsForTour?: (tour: TourInput) => { primary: { id: number; ten: string }[]; secondary: { id: number; ten: string }[] };
}) {
  const [open, setOpen] = useState(true);
  const [openPopover, setOpenPopover] = useState<number | null>(null);
  const isUnassigned = hdvId === null;

  return (
    <div className={cn("border rounded-lg overflow-hidden", isUnassigned && "border-destructive/40")}>
      <button
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left",
          isUnassigned ? "bg-destructive/5" : "bg-[#E6F1FB]"
        )}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        {isUnassigned
          ? <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          : <CalendarCheck className="h-3.5 w-3.5 text-primary shrink-0" />}
        <span className={isUnassigned ? "text-destructive" : ""}>{hdvName}</span>
        <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5">
          {tours.length} đoàn
        </Badge>
      </button>

      {open && (
        <div className="divide-y">
          {tours.map((tour, idx) => (
            <div key={idx} className="px-3 py-2 text-xs flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                {tour.is_chained && (
                  <span className="flex items-center gap-0.5 text-amber-600 font-medium shrink-0">
                    <Zap className="h-3 w-3" /> Ghép chuyến
                  </span>
                )}
                <span className="font-medium">{tour.ten_doan}</span>
                {!tour.doan_id && (
                  <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground">
                    File
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
                {(() => {
                  const sugg = getSuggestionsForTour?.(tour);
                  const curName = tour.assigned_hdv_id
                    ? (allHdvs.find((h) => h.id === tour.assigned_hdv_id)?.ten ?? `HDV #${tour.assigned_hdv_id}`)
                    : null;
                  if (sugg) {
                    // Combobox có nhóm gợi ý (cho đoàn chưa xếp)
                    return (
                      <Popover open={openPopover === idx} onOpenChange={(o) => setOpenPopover(o ? idx : null)}>
                        <PopoverTrigger asChild>
                          <button className={cn(
                            "flex items-center gap-1 h-6 px-2 text-[11px] border rounded ml-auto min-w-[120px] max-w-[160px] hover:bg-muted/60",
                            curName ? "text-primary font-medium" : "text-muted-foreground"
                          )}>
                            <span className="flex-1 truncate text-left">{curName ?? "— Chưa xếp —"}</span>
                            <ChevronDown className="h-3 w-3 shrink-0" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-0" align="end">
                          <Command>
                            <CommandInput placeholder="Tìm HDV..." className="h-8 text-xs" />
                            <CommandList>
                              <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">Không tìm thấy</CommandEmpty>
                              <CommandItem
                                value="__none__"
                                onSelect={() => { onReassign(idx, null); setOpenPopover(null); }}
                                className="text-xs text-muted-foreground"
                              >
                                <Check className={cn("h-3 w-3 mr-2", !tour.assigned_hdv_id ? "opacity-100" : "opacity-0")} />
                                — Chưa xếp —
                              </CommandItem>
                              {sugg.primary.length > 0 && (
                                <CommandGroup heading="Phù hợp (agent + địa điểm)">
                                  {sugg.primary.map((h) => (
                                    <CommandItem key={h.id} value={h.ten} onSelect={() => { onReassign(idx, h.id); setOpenPopover(null); }} className="text-xs">
                                      <Check className={cn("h-3 w-3 mr-2", tour.assigned_hdv_id === h.id ? "opacity-100" : "opacity-0")} />
                                      {h.ten}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {sugg.secondary.length > 0 && (
                                <CommandGroup heading="Phù hợp địa điểm">
                                  {sugg.secondary.map((h) => (
                                    <CommandItem key={h.id} value={h.ten} onSelect={() => { onReassign(idx, h.id); setOpenPopover(null); }} className="text-xs">
                                      <Check className={cn("h-3 w-3 mr-2", tour.assigned_hdv_id === h.id ? "opacity-100" : "opacity-0")} />
                                      {h.ten}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {sugg.primary.length === 0 && sugg.secondary.length === 0 && (
                                <CommandGroup heading="Tất cả HDV">
                                  {allHdvs.map((h) => (
                                    <CommandItem key={h.id} value={h.ten} onSelect={() => { onReassign(idx, h.id); setOpenPopover(null); }} className="text-xs">
                                      <Check className={cn("h-3 w-3 mr-2", tour.assigned_hdv_id === h.id ? "opacity-100" : "opacity-0")} />
                                      {h.ten}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    );
                  }
                  // Select thông thường (cho đoàn đã có HDV)
                  return (
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
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Review Dialog (kiểm tra / sửa khi có lỗi) ───────────────────
interface ReviewRow {
  rowNum: number;
  ten_doan: string;
  ngay_di: string;       // YYYY-MM-DD (hoặc "" nếu lỗi)
  ngay_ve: string;
  chuyen_bay_tien: string;
  chuyen_bay_don: string;
  dia_diem_ten: string;
  agent_ten: string;
  hdv_ten: string;       // tên HDV chỉ định (optional)
  so_khach: string;
  ghi_chu: string;
  error?: string;
}

function validateReviewRow(r: ReviewRow): string | undefined {
  if (!r.ten_doan.trim()) return "Thiếu tên đoàn";
  if (!r.ngay_di) return "Ngày đi không hợp lệ";
  if (!r.ngay_ve) return "Ngày về không hợp lệ";
  if (r.ngay_di > r.ngay_ve) return "Ngày đi sau ngày về";
  return undefined;
}

function ReviewDialog({
  rows,
  onConfirm,
  onCancel,
}: {
  rows: ReviewRow[];
  onConfirm: (rows: ReviewRow[]) => void;
  onCancel: () => void;
}) {
  const [editRows, setEditRows] = useState<ReviewRow[]>(() =>
    rows.map((r) => ({ ...r, error: validateReviewRow(r) }))
  );

  function updateRow(idx: number, patch: Partial<ReviewRow>) {
    setEditRows((prev) => {
      const next = [...prev];
      const updated = { ...next[idx], ...patch };
      updated.error = validateReviewRow(updated);
      next[idx] = updated;
      return next;
    });
  }

  const errorCount = editRows.filter((r) => r.error).length;
  const validCount = editRows.length - errorCount;

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-5xl flex flex-col" style={{ maxHeight: "85vh" }}>
        <DialogHeader>
          <DialogTitle>Kiểm tra dữ liệu import</DialogTitle>
          <DialogDescription>
            <span className="text-green-600 font-medium">{validCount} hàng hợp lệ</span>
            {errorCount > 0 && (
              <span className="text-destructive font-medium ml-2">· {errorCount} hàng lỗi — chỉnh sửa trực tiếp trong bảng</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Table */}
        <div className="flex-1 overflow-auto border rounded-md">
          <table className="text-xs w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#E6F1FB] text-left">
                <th className="border px-2 py-1.5 w-8">#</th>
                <th className="border px-2 py-1.5 min-w-[140px]">Tên đoàn</th>
                <th className="border px-2 py-1.5 w-28">Ngày đi</th>
                <th className="border px-2 py-1.5 w-28">Ngày về</th>
                <th className="border px-2 py-1.5 min-w-[100px]">Bay tiễn</th>
                <th className="border px-2 py-1.5 min-w-[100px]">Bay đón</th>
                <th className="border px-2 py-1.5 min-w-[90px]">Địa điểm</th>
                <th className="border px-2 py-1.5 min-w-[80px]">Agent</th>
                <th className="border px-2 py-1.5 min-w-[100px]">HDV</th>
                <th className="border px-2 py-1.5 w-32">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {editRows.map((row, idx) => (
                <tr key={idx} className={row.error ? "bg-red-50" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                  <td className="border px-2 py-0.5 text-center text-muted-foreground">{row.rowNum}</td>

                  {/* ten_doan */}
                  <td className="border px-1 py-0.5">
                    <Input
                      className={cn("h-6 text-xs px-1 border-0 focus:border focus:border-primary bg-transparent", !row.ten_doan && "bg-red-100")}
                      value={row.ten_doan}
                      onChange={(e) => updateRow(idx, { ten_doan: e.target.value })}
                    />
                  </td>

                  {/* ngay_di */}
                  <td className="border px-1 py-0.5">
                    <Input
                      type="date"
                      className={cn("h-6 text-xs px-1 border-0 focus:border focus:border-primary bg-transparent", !row.ngay_di && "bg-red-100")}
                      value={row.ngay_di}
                      onChange={(e) => updateRow(idx, { ngay_di: e.target.value })}
                    />
                  </td>

                  {/* ngay_ve */}
                  <td className="border px-1 py-0.5">
                    <Input
                      type="date"
                      className={cn("h-6 text-xs px-1 border-0 focus:border focus:border-primary bg-transparent", !row.ngay_ve && "bg-red-100")}
                      value={row.ngay_ve}
                      onChange={(e) => updateRow(idx, { ngay_ve: e.target.value })}
                    />
                  </td>

                  {/* chuyen_bay_tien */}
                  <td className="border px-1 py-0.5">
                    <Input
                      className="h-6 text-xs px-1 border-0 focus:border focus:border-primary bg-transparent"
                      value={row.chuyen_bay_tien}
                      onChange={(e) => updateRow(idx, { chuyen_bay_tien: e.target.value })}
                    />
                  </td>

                  {/* chuyen_bay_don */}
                  <td className="border px-1 py-0.5">
                    <Input
                      className="h-6 text-xs px-1 border-0 focus:border focus:border-primary bg-transparent"
                      value={row.chuyen_bay_don}
                      onChange={(e) => updateRow(idx, { chuyen_bay_don: e.target.value })}
                    />
                  </td>

                  {/* dia_diem */}
                  <td className="border px-1 py-0.5">
                    <Input
                      className="h-6 text-xs px-1 border-0 focus:border focus:border-primary bg-transparent"
                      value={row.dia_diem_ten}
                      onChange={(e) => updateRow(idx, { dia_diem_ten: e.target.value })}
                    />
                  </td>

                  {/* agent */}
                  <td className="border px-1 py-0.5">
                    <Input
                      className="h-6 text-xs px-1 border-0 focus:border focus:border-primary bg-transparent"
                      value={row.agent_ten}
                      onChange={(e) => updateRow(idx, { agent_ten: e.target.value })}
                    />
                  </td>

                  {/* hdv */}
                  <td className="border px-1 py-0.5">
                    <Input
                      className="h-6 text-xs px-1 border-0 focus:border focus:border-primary bg-transparent"
                      value={row.hdv_ten}
                      onChange={(e) => updateRow(idx, { hdv_ten: e.target.value })}
                      placeholder="(tùy chọn)"
                    />
                  </td>

                  {/* status */}
                  <td className="border px-2 py-0.5">
                    {row.error
                      ? <span className="text-destructive text-[10px] leading-tight">{row.error}</span>
                      : <span className="text-green-600 font-medium">✓ Hợp lệ</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter className="pt-2">
          <div className="flex items-center gap-2 w-full justify-between">
            <p className="text-xs text-muted-foreground">
              {errorCount > 0 && `${errorCount} hàng lỗi sẽ bị bỏ qua khi xác nhận`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onCancel}>Hủy</Button>
              <Button onClick={() => onConfirm(editRows)} disabled={validCount === 0}>
                Thêm {validCount} đoàn hợp lệ
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Schedule Grid (view lịch) ────────────────────────────────────
// Màu nền luân phiên cho từng tour trong một hàng (dễ phân biệt)
const TOUR_COLORS = [
  "bg-yellow-200", "bg-sky-200", "bg-green-200",
  "bg-orange-200", "bg-pink-200", "bg-purple-200",
];

function ScheduleGrid({
  result,
  hdvList,
}: {
  result: TourInput[];
  hdvList: { id: number; ten: string }[];
}) {
  const assignedTours = result.filter((t) => t.assigned_hdv_id !== null);
  if (assignedTours.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">Không có đoàn nào được xếp</p>;
  }

  // Phạm vi ngày
  const allDateStrs = assignedTours.flatMap((t) => [t.ngay_di, t.ngay_ve]).filter(Boolean);
  const minStr = allDateStrs.reduce((a, b) => (a < b ? a : b));
  const maxStr = allDateStrs.reduce((a, b) => (a > b ? a : b));
  const days = eachDayOfInterval({ start: parseISO(minStr), end: parseISO(maxStr) });
  const dayStrs = days.map((d) => format(d, "yyyy-MM-dd"));

  // Nhóm tháng cho header
  const monthGroups: { label: string; month: string; count: number }[] = [];
  for (const day of days) {
    const key = format(day, "yyyy-MM");
    const label = `Tháng ${format(day, "M")}`;
    if (!monthGroups.length || monthGroups[monthGroups.length - 1].month !== key) {
      monthGroups.push({ month: key, label, count: 1 });
    } else {
      monthGroups[monthGroups.length - 1].count++;
    }
  }

  // Danh sách HDV có đoàn, sort theo tên
  const hdvIds = [
    ...new Set(assignedTours.map((t) => t.assigned_hdv_id!)),
  ].sort((a, b) => {
    const na = hdvList.find((h) => h.id === a)?.ten ?? "";
    const nb = hdvList.find((h) => h.id === b)?.ten ?? "";
    return na.localeCompare(nb, "vi");
  });

  const titleMonth = format(parseISO(minStr), "M");
  const titleYear = format(parseISO(minStr), "yyyy");

  function renderRow(hdvId: number) {
    const tours = assignedTours
      .filter((t) => t.assigned_hdv_id === hdvId)
      .sort((a, b) => a.ngay_di.localeCompare(b.ngay_di));

    const cells: React.ReactNode[] = [];
    let dayIdx = 0;

    tours.forEach((tour, ti) => {
      const startIdx = dayStrs.indexOf(tour.ngay_di);
      const endIdx = dayStrs.indexOf(tour.ngay_ve);
      if (startIdx < 0 || endIdx < 0) return;

      // Gap trước tour
      const gap = startIdx - dayIdx;
      if (gap > 0) {
        cells.push(
          <td key={`g-${dayIdx}`} colSpan={gap} className="border border-gray-200 bg-white" />
        );
      }

      const span = endIdx - startIdx + 1;
      const colorClass = TOUR_COLORS[ti % TOUR_COLORS.length];
      cells.push(
        <td
          key={`t-${ti}`}
          colSpan={span}
          className={`border border-gray-400 ${colorClass} text-[10px] px-0.5 text-center font-semibold overflow-hidden`}
        >
          <div className="truncate whitespace-nowrap leading-tight py-0.5">
            {tour.is_chained && "⚡ "}
            {tour.ten_doan}
          </div>
        </td>
      );

      dayIdx = endIdx + 1;
    });

    // Đuôi trống
    if (dayIdx < days.length) {
      cells.push(
        <td key="trail" colSpan={days.length - dayIdx} className="border border-gray-200 bg-white" />
      );
    }
    return cells;
  }

  return (
    <div className="space-y-2">
      <div className="text-center">
        <p className="font-bold text-sm uppercase tracking-wide">
          LỊCH ĐIỀU HƯỚNG DẪN VIÊN THÁNG {titleMonth} NĂM {titleYear}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[11px]" style={{ minWidth: "max-content" }}>
          <thead>
            {/* Hàng nhóm tháng */}
            <tr className="bg-green-600 text-white text-center">
              <th rowSpan={2} className="border border-green-700 px-2 py-1 whitespace-nowrap">STT</th>
              <th rowSpan={2} className="border border-green-700 px-3 py-1 whitespace-nowrap">Họ tên</th>
              <th rowSpan={2} className="border border-green-700 px-2 py-1">Tên</th>
              {monthGroups.map((mg) => (
                <th key={mg.month} colSpan={mg.count} className="border border-green-700 px-1 py-0.5">
                  {mg.label}
                </th>
              ))}
            </tr>
            {/* Hàng số ngày */}
            <tr className="bg-green-600 text-white text-center">
              {days.map((d) => (
                <th
                  key={format(d, "yyyy-MM-dd")}
                  className="border border-green-700 py-0.5 font-medium"
                  style={{ minWidth: 26, width: 26 }}
                >
                  {format(d, "d")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hdvIds.map((hdvId, idx) => {
              const hdv = hdvList.find((h) => h.id === hdvId);
              if (!hdv) return null;
              const parts = hdv.ten.trim().split(/\s+/);
              const shortName = parts[parts.length - 1].toUpperCase();
              return (
                <tr key={hdvId} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="border border-gray-300 px-2 py-1 text-center">{idx + 1}</td>
                  <td className="border border-gray-300 px-2 py-1 font-medium uppercase whitespace-nowrap">
                    {hdv.ten.toUpperCase()}
                  </td>
                  <td className="border border-gray-300 px-1 py-1 text-center font-semibold">
                    {shortName}
                  </td>
                  {renderRow(hdvId)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────
export default function XepHDVPage() {
  const canView = usePermission("doan", "view");
  if (!canView) return <AccessDenied />;

  const id = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Danh sách đoàn đã chọn
  const [selectedDoanIds, setSelectedDoanIds] = useState<Set<string>>(new Set());
  const [fileTours, setFileTours] = useState<(TourInput & { _key: string })[]>([]);

  // HDV pool
  const [hdvMode, setHdvMode] = useState<"all" | "manual">("all");
  const [selectedHdvIds, setSelectedHdvIds] = useState<Set<number>>(new Set());

  // Kết quả
  const [result, setResult] = useState<TourInput[] | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "grid">("cards");
  const [assignView, setAssignView] = useState<"byhdv" | "bydate">("byhdv");

  // Ràng buộc tái xếp — key = "db-{doan_id}" hoặc "file-{_key}"
  const [lockedTourKeys, setLockedTourKeys] = useState<Set<string>>(new Set());

  // Số đoàn tối đa mỗi HDV (null = không giới hạn)
  const [maxToursPerHDV, setMaxToursPerHDV] = useState<number | null>(3);

  // Popover đang mở trong bydate view (lưu index tour trong result)
  const [openPopoverIdx, setOpenPopoverIdx] = useState<number | null>(null);

  // Review dialog khi file có lỗi
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null);

  const saveMut = useSaveHDVAssignments();

  // Xác nhận từ ReviewDialog → chuyển hàng hợp lệ vào fileTours
  function confirmImport(rows: ReviewRow[]) {
    const validRows = rows.filter((r) => !r.error && r.ten_doan.trim() && r.ngay_di && r.ngay_ve);
    if (validRows.length === 0) { toast.error("Không có hàng hợp lệ"); return; }

    const newTours: (TourInput & { _key: string })[] = validRows.map((r, i) => {
      const dia_diem_id = diaDiemList.find(
        (d) => d.ten.toLowerCase() === r.dia_diem_ten.toLowerCase()
      )?.id ?? null;
      const agent_id = agents.find(
        (a) => a.ten.toLowerCase() === r.agent_ten.toLowerCase()
      )?.id ?? null;
      const locked_hdv_id = r.hdv_ten.trim()
        ? (hdvList.find((h) => h.ten.toLowerCase() === r.hdv_ten.trim().toLowerCase())?.id ?? null)
        : null;
      return {
        _key: `file-${Date.now()}-${i}`,
        ten_doan: r.ten_doan.trim(),
        ngay_di: r.ngay_di,
        ngay_ve: r.ngay_ve,
        chuyen_bay_tien: r.chuyen_bay_tien.trim() || null,
        chuyen_bay_don: r.chuyen_bay_don.trim() || null,
        dia_diem_id,
        dia_diem_ten: r.dia_diem_ten || undefined,
        agent_id,
        agent_ten: r.agent_ten || undefined,
        assigned_hdv_id: locked_hdv_id,
        locked_hdv_id,
        is_chained: false,
        so_khach: r.so_khach ? Number(r.so_khach) || null : null,
        ghi_chu: r.ghi_chu.trim() || null,
      };
    });

    setFileTours((prev) => [...prev, ...newTours]);
    setSelectedDoanIds((prev) => {
      const next = new Set(prev);
      newTours.forEach((t) => next.add(t._key));
      return next;
    });
    setReviewRows(null);
    setResult(null);
    const skipped = rows.length - validRows.length;
    toast.success(
      `Đã thêm ${newTours.length} đoàn` +
      (skipped > 0 ? ` · bỏ qua ${skipped} hàng lỗi` : "")
    );
  }

  const activeHdvs = hdvList.filter((h) => h.active);
  const poolHdvs = hdvMode === "all" ? activeHdvs : activeHdvs.filter((h) => selectedHdvIds.has(h.id));
  const displayDbTours = hideWithHdv ? dbTours.filter((t) => !t._has_hdv) : dbTours;

  function toggleDbTour(doan_id: number) {
    const key = `db-${doan_id}`;
    setSelectedDoanIds((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
    setResult(null);
  }

  // ── Upload Excel ──────────────────────────────────────────────────
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset để có thể upload lại cùng file

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (rows.length < 2) { toast.error("File không có dữ liệu"); return; }

        // Xác định cột từ header row (row 0)
        const headers = rows[0].map((h: any) => String(h).trim().toLowerCase());
        const col = (names: string[]) => names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;

        const iName   = col(["ten_doan", "tên đoàn", "ten doan", "name"]);
        const iFrom   = col(["ngay_di", "ngày đi", "ngay di", "departure"]);
        const iTo     = col(["ngay_ve", "ngày về", "ngay ve", "return"]);
        const iTien   = col(["chuyen_bay_tien", "chuyến bay tiễn", "cb_tien", "flight_out"]);
        const iDon    = col(["chuyen_bay_don", "chuyến bay đón", "cb_don", "flight_in"]);
        const iDd     = col(["dia_diem", "địa điểm", "dia diem", "location"]);
        const iAgent   = col(["agent"]);
        const iHdv     = col(["hdv", "hướng dẫn viên", "huong_dan_vien", "huong dan vien"]);
        const iSoKhach = col(["so_khach", "số khách", "so khach", "khach", "pax"]);
        const iGhiChu  = col(["ghi_chu", "ghi chú", "ghi chu", "note", "notes"]);

        if (iName < 0 || iFrom < 0 || iTo < 0) {
          toast.error("File thiếu cột bắt buộc: ten_doan, ngay_di, ngay_ve");
          return;
        }

        // Thu thập TẤT CẢ hàng (cả hợp lệ lẫn lỗi) vào reviewData
        const reviewData: ReviewRow[] = [];

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const ten_doan = String(row[iName] ?? "").trim();
          if (!ten_doan) continue; // bỏ qua hàng hoàn toàn trống

          const ngay_di = parseExcelDate(row[iFrom]);
          const ngay_ve = parseExcelDate(row[iTo]);

          reviewData.push({
            rowNum: r + 1,
            ten_doan,
            ngay_di,
            ngay_ve,
            chuyen_bay_tien: iTien >= 0 ? String(row[iTien] ?? "").trim() : "",
            chuyen_bay_don:  iDon  >= 0 ? String(row[iDon]  ?? "").trim() : "",
            dia_diem_ten:    iDd   >= 0 ? String(row[iDd]   ?? "").trim() : "",
            agent_ten:       iAgent   >= 0 ? String(row[iAgent]   ?? "").trim() : "",
            hdv_ten:         iHdv     >= 0 ? String(row[iHdv]     ?? "").trim() : "",
            so_khach:        iSoKhach >= 0 ? String(row[iSoKhach] ?? "").trim() : "",
            ghi_chu:         iGhiChu  >= 0 ? String(row[iGhiChu]  ?? "").trim() : "",
          });
        }

        if (reviewData.length === 0) { toast.error("Không có dữ liệu nào"); return; }

        const errorCount = reviewData.filter(
          (r) => !r.ngay_di || !r.ngay_ve || r.ngay_di > r.ngay_ve
        ).length;

        if (errorCount > 0) {
          // Có lỗi → mở dialog để user kiểm tra + sửa
          setReviewRows(reviewData);
        } else {
          // Không lỗi → thêm thẳng qua confirmImport
          confirmImport(reviewData.map((r) => ({ ...r, error: undefined })));
        }
      } catch (err) {
        toast.error("Lỗi đọc file Excel");
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function removeFileTour(key: string) {
    setFileTours((prev) => prev.filter((t) => t._key !== key));
    setSelectedDoanIds((prev) => { const next = new Set(prev); next.delete(key); return next; });
    setResult(null);
  }

  // ── Tổng hợp tours đã chọn ──
  function getSelectedTours(): TourInput[] {
    const tours: TourInput[] = [];
    for (const key of selectedDoanIds) {
      if (key.startsWith("db-")) {
        const dbId = Number(key.replace("db-", ""));
        const t = dbTours.find((d) => d.doan_id === dbId);
        // Giữ locked_hdv_id, set assigned_hdv_id = locked_hdv_id để thuật toán xử lý
        if (t) tours.push({ ...t, assigned_hdv_id: t.locked_hdv_id, is_chained: false });
      } else {
        const ft = fileTours.find((m) => m._key === key);
        if (ft) tours.push({ ...ft, assigned_hdv_id: ft.locked_hdv_id, is_chained: false });
      }
    }
    return tours;
  }

  // Key ổn định cho mỗi tour trong result
  function tourResultKey(t: TourInput) {
    return t.doan_id != null ? `db-${t.doan_id}` : `${t.ten_doan}|${t.ngay_di}`;
  }

  function handleRun() {
    const tours = getSelectedTours();
    if (tours.length === 0) { toast.error("Chưa chọn đoàn nào"); return; }
    if (poolHdvs.length === 0) { toast.error("Không có hướng dẫn viên nào trong pool"); return; }
    setResult(assignHDVs(tours, poolHdvs, maxToursPerHDV));
    setLockedTourKeys(new Set());
    setViewMode("cards");
  }

  function handleRerun() {
    if (!result) return;
    if (poolHdvs.length === 0) { toast.error("Không có hướng dẫn viên nào trong pool"); return; }
    const toursForRerun = result.map((t) => {
      const key = tourResultKey(t);
      const isLocked = lockedTourKeys.has(key);
      return {
        ...t,
        _hard_locked: isLocked,
        _prev_hdv_id: t.assigned_hdv_id,   // lưu lại để đánh dấu thay đổi
        locked_hdv_id: t.assigned_hdv_id,
      };
    });
    setResult(assignHDVs(toursForRerun, poolHdvs, maxToursPerHDV));
    setViewMode("cards");
  }

  function handleReassign(tourIdx: number, newHdvId: number | null) {
    if (!result) return;
    setResult((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[tourIdx] = { ...next[tourIdx], assigned_hdv_id: newHdvId, is_chained: false };
      return next;
    });
  }

  async function handleSave() {
    if (!result) return;
    const toSave = result.filter((t) => t.doan_id != null);
    const skipped = result.filter((t) => t.doan_id == null).length;
    if (toSave.length === 0) { toast.error("Không có đoàn nào từ DB để lưu"); return; }
    try {
      await saveMut.mutateAsync(toSave.map((t) => ({ doan_id: t.doan_id!, hdv_id: t.assigned_hdv_id })));
      toast.success(`Đã lưu ${toSave.length} đoàn${skipped > 0 ? ` · ${skipped} đoàn từ file không lưu vào DB` : ""}`);
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

  const hdvMap = new Map<number, string>(hdvList.map((h) => [h.id, h.ten]));
  const unassignedCount = result?.filter((t) => t.assigned_hdv_id === null).length ?? 0;

  function exportScheduleToExcel() {
    if (!result) return;
    const assignedTours = result.filter((t) => t.assigned_hdv_id !== null);
    if (assignedTours.length === 0) return;

    const allDateStrs = assignedTours.flatMap((t) => [t.ngay_di, t.ngay_ve]).filter(Boolean);
    const minStr = allDateStrs.reduce((a, b) => (a < b ? a : b));
    const maxStr = allDateStrs.reduce((a, b) => (a > b ? a : b));
    const days = eachDayOfInterval({ start: parseISO(minStr), end: parseISO(maxStr) });
    const dayStrs = days.map((d) => format(d, "yyyy-MM-dd"));

    // Nhóm tháng
    const monthGroups: { label: string; count: number }[] = [];
    for (const day of days) {
      const label = `Tháng ${format(day, "M/yyyy")}`;
      if (!monthGroups.length || monthGroups[monthGroups.length - 1].label !== label) {
        monthGroups.push({ label, count: 1 });
      } else {
        monthGroups[monthGroups.length - 1].count++;
      }
    }

    const hdvIds = [...new Set(assignedTours.map((t) => t.assigned_hdv_id!))].sort((a, b) => {
      const na = activeHdvs.find((h) => h.id === a)?.ten ?? "";
      const nb = activeHdvs.find((h) => h.id === b)?.ten ?? "";
      return na.localeCompare(nb, "vi");
    });

    // Hàng header 1: tháng
    const row0: string[] = ["STT", "Họ tên", "Tên"];
    monthGroups.forEach((mg) => {
      row0.push(mg.label);
      for (let i = 1; i < mg.count; i++) row0.push("");
    });

    // Hàng header 2: số ngày
    const row1: string[] = ["", "", ""];
    days.forEach((d) => row1.push(format(d, "d")));

    // Hàng dữ liệu
    const dataRows = hdvIds.map((hdvId, idx) => {
      const hdv = activeHdvs.find((h) => h.id === hdvId);
      const parts = (hdv?.ten ?? "").trim().split(/\s+/);
      const shortName = parts[parts.length - 1].toUpperCase();
      const rowDays: string[] = Array(days.length).fill("");
      const tours = assignedTours
        .filter((t) => t.assigned_hdv_id === hdvId)
        .sort((a, b) => a.ngay_di.localeCompare(b.ngay_di));
      tours.forEach((tour) => {
        const startIdx = dayStrs.indexOf(tour.ngay_di);
        const endIdx = dayStrs.indexOf(tour.ngay_ve);
        if (startIdx >= 0) {
          rowDays[startIdx] = (tour.is_chained ? "⚡ " : "") + tour.ten_doan;
        }
      });
      return [String(idx + 1), (hdv?.ten ?? "").toUpperCase(), shortName, ...rowDays];
    });

    const aoa = [row0, row1, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Merges
    const merges: XLSX.Range[] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
    ];
    // Merge tháng
    let colOffset = 3;
    monthGroups.forEach((mg) => {
      if (mg.count > 1) merges.push({ s: { r: 0, c: colOffset }, e: { r: 0, c: colOffset + mg.count - 1 } });
      colOffset += mg.count;
    });
    // Merge tour spans
    hdvIds.forEach((hdvId, hdvIdx) => {
      const rowIdx = hdvIdx + 2;
      const tours = assignedTours
        .filter((t) => t.assigned_hdv_id === hdvId)
        .sort((a, b) => a.ngay_di.localeCompare(b.ngay_di));
      tours.forEach((tour) => {
        const startIdx = dayStrs.indexOf(tour.ngay_di);
        const endIdx = dayStrs.indexOf(tour.ngay_ve);
        if (startIdx >= 0 && endIdx > startIdx)
          merges.push({ s: { r: rowIdx, c: startIdx + 3 }, e: { r: rowIdx, c: endIdx + 3 } });
      });
    });
    ws["!merges"] = merges;

    // Column widths
    ws["!cols"] = [
      { wch: 5 },
      { wch: 26 },
      { wch: 6 },
      ...days.map(() => ({ wch: 4 })),
    ];

    const wb = XLSX.utils.book_new();
    const titleMonth = format(parseISO(minStr), "M");
    const titleYear = format(parseISO(minStr), "yyyy");
    XLSX.utils.book_append_sheet(wb, ws, "Lịch HDV");
    XLSX.writeFile(wb, `lich_hdv_t${titleMonth}_${titleYear}.xlsx`);
  }

  function exportAssignmentToExcel() {
    if (!result) return;
    const today = format(new Date(), "yyyy-MM-dd");

    // Thứ tự cột theo file mẫu: ten_doan · hdv · agent · ngay_di · ngay_ve · chuyen_bay_tien · chuyen_bay_don · dia_diem
    const HEADERS = ["ten_doan", "hdv", "agent", "ngay_di", "ngay_ve", "chuyen_bay_tien", "chuyen_bay_don", "dia_diem"];
    const aoa: (string | number)[][] = [HEADERS];
    const merges: XLSX.Range[] = [];

    // Nhóm: assigned trước, unassigned cuối
    const assignedIds = [...new Set<number>(result.filter((t) => t.assigned_hdv_id !== null).map((t) => t.assigned_hdv_id!))]
      .sort((a, b) => (hdvMap.get(a) ?? "").localeCompare(hdvMap.get(b) ?? "", "vi"));

    const addGroup = (hdvId: number | null, tours: TourInput[]) => {
      const hdvName = hdvId ? (hdvMap.get(hdvId) ?? `HDV #${hdvId}`) : "Chưa xếp được";
      const groupRowIdx = aoa.length;
      aoa.push([`${hdvName.toUpperCase()} — ${tours.length} đoàn`, ...Array(HEADERS.length - 1).fill("")]);
      merges.push({ s: { r: groupRowIdx, c: 0 }, e: { r: groupRowIdx, c: HEADERS.length - 1 } });

      for (const tour of [...tours].sort((a, b) => a.ngay_di.localeCompare(b.ngay_di))) {
        aoa.push([
          tour.ten_doan,
          (tour.is_chained ? "⚡ " : "") + hdvName,
          tour.agent_ten ?? "",
          formatDate(tour.ngay_di),
          formatDate(tour.ngay_ve),
          tour.chuyen_bay_tien ?? "",
          tour.chuyen_bay_don ?? "",
          tour.dia_diem_ten ?? "",
        ]);
      }
    };

    for (const hdvId of assignedIds) {
      addGroup(hdvId, result.filter((t) => t.assigned_hdv_id === hdvId));
    }
    const unassigned = result.filter((t) => t.assigned_hdv_id === null);
    if (unassigned.length > 0) addGroup(null, unassigned);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!merges"] = merges;
    ws["!cols"] = [
      { wch: 30 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Phân công HDV");
    XLSX.writeFile(wb, `phan_cong_hdv_${today}.xlsx`);
  }

  function exportByDateToExcel() {
    if (!result) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const HEADERS = ["ten_doan", "hdv", "agent", "ngay_di", "ngay_ve", "chuyen_bay_tien", "chuyen_bay_don", "dia_diem"];
    const rows = [...result]
      .sort((a, b) => a.ngay_di.localeCompare(b.ngay_di) || a.ten_doan.localeCompare(b.ten_doan));
    const aoa: (string | number)[][] = [HEADERS];
    for (const tour of rows) {
      const hdvId = tour.assigned_hdv_id;
      const hdvName = hdvId ? (hdvMap.get(hdvId) ?? `HDV #${hdvId}`) : "";
      const changed = tour._prev_hdv_id !== undefined && tour._prev_hdv_id !== tour.assigned_hdv_id;
      aoa.push([
        tour.ten_doan + (changed ? " ✱" : ""),
        (tour.is_chained ? "⚡ " : "") + hdvName,
        tour.agent_ten ?? "",
        formatDate(tour.ngay_di),
        formatDate(tour.ngay_ve),
        tour.chuyen_bay_tien ?? "",
        tour.chuyen_bay_don ?? "",
        tour.dia_diem_ten ?? "",
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 32 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Phân công theo ngày");
    XLSX.writeFile(wb, `phan_cong_theo_ngay_${today}.xlsx`);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-sm">Xếp hướng dẫn viên</h1>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <>
              {/* Main view toggle */}
              <div className="flex items-center border rounded-md overflow-hidden h-8">
                <button
                  onClick={() => setViewMode("cards")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 h-full text-xs transition-colors",
                    viewMode === "cards" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"
                  )}
                >
                  <List className="h-3.5 w-3.5" /> Phân công
                </button>
                <button
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 h-full text-xs transition-colors border-l",
                    viewMode === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"
                  )}
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Lịch
                </button>
              </div>
              {/* Sub-toggle chỉ hiện ở view Phân công */}
              {viewMode === "cards" && (
                <div className="flex items-center border rounded-md overflow-hidden h-8">
                  <button
                    onClick={() => setAssignView("byhdv")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 h-full text-xs transition-colors",
                      assignView === "byhdv" ? "bg-muted font-medium" : "hover:bg-muted/60"
                    )}
                  >
                    Theo HDV
                  </button>
                  <button
                    onClick={() => setAssignView("bydate")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 h-full text-xs transition-colors border-l",
                      assignView === "bydate" ? "bg-muted font-medium" : "hover:bg-muted/60"
                    )}
                  >
                    Theo ngày
                  </button>
                </div>
              )}
            </>
          )}
          {result && viewMode === "cards" && (
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5"
              onClick={assignView === "byhdv" ? exportAssignmentToExcel : exportByDateToExcel}
            >
              <Download className="h-3.5 w-3.5" /> Tải Excel
            </Button>
          )}
          {result && viewMode === "grid" && (
            <Button
              size="sm" variant="outline" className="h-8 text-xs gap-1.5"
              onClick={exportScheduleToExcel}
            >
              <Download className="h-3.5 w-3.5" /> Tải Excel
            </Button>
          )}
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

      <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
        {/* ── Left panel ── */}
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
                      <Checkbox checked={hideWithHdv} onCheckedChange={(v) => setHideWithHdv(!!v)} />
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
                  {displayDbTours.length > 0 && (
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {displayDbTours.map((tour) => {
                        const key = `db-${tour.doan_id}`;
                        const checked = selectedDoanIds.has(key);
                        return (
                          <label key={key} className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors",
                            checked ? "bg-primary/10" : "hover:bg-muted/50"
                          )}>
                            <Checkbox checked={checked} onCheckedChange={() => toggleDbTour(tour.doan_id!)} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium truncate">{tour.ten_doan}</span>
                                {tour.locked_hdv_id && (
                                  <Badge variant="secondary" className="text-[9px] h-3.5 px-1 gap-0.5 shrink-0">
                                    <Lock className="h-2.5 w-2.5" />
                                    {hdvList.find((h) => h.id === tour.locked_hdv_id)?.ten.split(/\s+/).pop() ?? "HDV"}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-muted-foreground text-[10px]">
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

                {/* Upload Excel */}
                <div className="border rounded-md p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">Upload file Excel</p>
                    <Button
                      size="sm" variant="ghost" className="h-6 text-[11px] gap-1 text-muted-foreground"
                      onClick={downloadTemplate}
                    >
                      <Download className="h-3 w-3" /> Tải file mẫu
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Cột: ten_doan · hdv · agent · ngay_di · ngay_ve · chuyen_bay_tien · chuyen_bay_don · dia_diem
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button
                    size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Chọn file (.xlsx / .xls)
                  </Button>

                  {/* Danh sách đoàn từ file */}
                  {fileTours.length > 0 && (
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {fileTours.map((tour) => {
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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium">{tour.ten_doan}</span>
                                {tour.locked_hdv_id && (
                                  <Badge variant="secondary" className="text-[9px] h-3.5 px-1 gap-0.5 shrink-0">
                                    <Lock className="h-2.5 w-2.5" />
                                    {hdvList.find((h) => h.id === tour.locked_hdv_id)?.ten.split(/\s+/).pop() ?? "HDV"}
                                  </Badge>
                                )}
                              </div>
                              <span className="text-muted-foreground text-[10px]">
                                {formatDate(tour.ngay_di)}→{formatDate(tour.ngay_ve)}
                                {tour.dia_diem_ten ? ` · ${tour.dia_diem_ten}` : ""}
                              </span>
                            </div>
                            <button
                              onClick={() => removeFileTour(tour._key)}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
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
                          <label key={hdv.id} className={cn(
                            "flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors",
                            checked ? "bg-primary/10" : "hover:bg-muted/50"
                          )}>
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
                  <p className="text-[10px] text-muted-foreground">Pool: {poolHdvs.length} HDV</p>
                </div>
              </div>

              {/* Section: Giới hạn đoàn */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Giới hạn xếp
                </p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs shrink-0 w-28">Đoàn tối đa / HDV</Label>
                  <Input
                    className="h-7 text-xs w-20"
                    type="number"
                    min={1}
                    placeholder="∞"
                    value={maxToursPerHDV ?? ""}
                    onChange={(e) => setMaxToursPerHDV(e.target.valueAsNumber > 0 ? e.target.valueAsNumber : null)}
                  />
                </div>
              </div>

              {/* Section: Khóa đoàn — hiện khi có đoàn được chọn */}
              {selectedDoanIds.size > 0 && (() => {
                // Dùng result nếu đã chạy, ngược lại dùng danh sách đang chọn
                const lockList: TourInput[] = result
                  ? [...result].sort((a, b) => a.ngay_di.localeCompare(b.ngay_di))
                  : getSelectedTours().sort((a, b) => a.ngay_di.localeCompare(b.ngay_di));

                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex-1">
                        Khóa đoàn
                      </p>
                      {lockedTourKeys.size > 0 && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5 normal-case">
                          {lockedTourKeys.size} đoàn khóa
                        </Badge>
                      )}
                    </div>
                    <div className="border rounded-md p-2.5 space-y-2">
                      {/* Quick-lock theo agent */}
                      {(() => {
                        const agentsInList = agents.filter((ag) =>
                          lockList.some((t) => t.agent_id === ag.id)
                        );
                        if (agentsInList.length === 0) return null;
                        return (
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted-foreground">Khóa nhanh theo agent:</p>
                            <div className="flex flex-wrap gap-1">
                              {agentsInList.map((ag) => {
                                const tourKeysOfAgent = lockList
                                  .filter((t) => t.agent_id === ag.id)
                                  .map(tourResultKey);
                                const allLocked = tourKeysOfAgent.length > 0 &&
                                  tourKeysOfAgent.every((k) => lockedTourKeys.has(k));
                                return (
                                  <button
                                    key={ag.id}
                                    onClick={() => {
                                      setLockedTourKeys((prev) => {
                                        const next = new Set(prev);
                                        if (allLocked) {
                                          tourKeysOfAgent.forEach((k) => next.delete(k));
                                        } else {
                                          tourKeysOfAgent.forEach((k) => next.add(k));
                                        }
                                        return next;
                                      });
                                    }}
                                    className={cn(
                                      "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors",
                                      allLocked
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-background hover:bg-muted/60 border-border"
                                    )}
                                  >
                                    {allLocked && <Lock className="h-2.5 w-2.5" />}
                                    {ag.ten}
                                    <span className="opacity-60">({tourKeysOfAgent.length})</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Danh sách đoàn */}
                      <div className="space-y-0.5 max-h-64 overflow-y-auto">
                        {lockList.map((tour) => {
                          const key = tourResultKey(tour);
                          const isLocked = lockedTourKeys.has(key);
                          const hdvId = result ? tour.assigned_hdv_id : tour.locked_hdv_id;
                          const hdvName = hdvId
                            ? (hdvMap.get(hdvId) ?? hdvList.find((h) => h.id === hdvId)?.ten ?? `HDV #${hdvId}`)
                            : null;
                          return (
                            <label
                              key={key}
                              className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors",
                                isLocked ? "bg-primary/10" : "hover:bg-muted/40"
                              )}
                            >
                              <Checkbox
                                checked={isLocked}
                                onCheckedChange={() => {
                                  setLockedTourKeys((prev) => {
                                    const next = new Set(prev);
                                    next.has(key) ? next.delete(key) : next.add(key);
                                    return next;
                                  });
                                }}
                              />
                              {isLocked && <Lock className="h-3 w-3 text-primary shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <span className="font-medium truncate block">{tour.ten_doan}</span>
                                <span className="text-muted-foreground text-[10px]">
                                  {formatDate(tour.ngay_di)}→{formatDate(tour.ngay_ve)}
                                  {hdvName && (
                                    <span className="ml-1 text-primary font-medium">· {hdvName}</span>
                                  )}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      {/* Nút Xếp lại — chỉ sau khi có kết quả */}
                      {result && (
                        <Button
                          size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5"
                          onClick={handleRerun}
                        >
                          <Play className="h-3.5 w-3.5" /> Xếp lại
                          {lockedTourKeys.size > 0 && ` (${lockList.length - lockedTourKeys.size} đoàn còn lại)`}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </ScrollArea>
        </Panel>

        <PanelResizeHandle className="w-1 bg-border hover:bg-primary/30 transition-colors" />

        {/* ── Right panel: kết quả ── */}
        <Panel minSize={40}>
          {/* View lịch cần scroll cả 2 chiều → dùng div thường thay ScrollArea */}
          {result && viewMode === "grid" ? (
            <div className="h-full overflow-auto p-3">
              <ScheduleGrid result={result} hdvList={activeHdvs} />
            </div>
          ) : (
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {!result ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2">
                  <CalendarCheck className="h-10 w-10 opacity-20" />
                  <p className="text-sm">Chọn đoàn và HDV, rồi bấm "Chạy xếp"</p>
                </div>
              ) : assignView === "bydate" ? (
                /* ── View theo ngày ── */
                <div className="border rounded-md overflow-hidden">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-[#E6F1FB] text-left">
                        <th className="border px-2 py-1.5 min-w-[160px]">Tên đoàn</th>
                        <th className="border px-2 py-1.5 min-w-[120px]">HDV</th>
                        <th className="border px-2 py-1.5 min-w-[80px]">Agent</th>
                        <th className="border px-2 py-1.5 w-24">Ngày đi</th>
                        <th className="border px-2 py-1.5 w-24">Ngày về</th>
                        <th className="border px-2 py-1.5 w-20">Bay tiễn</th>
                        <th className="border px-2 py-1.5 w-20">Bay đón</th>
                        <th className="border px-2 py-1.5 min-w-[80px]">Địa điểm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...result]
                        .sort((a, b) => a.ngay_di.localeCompare(b.ngay_di) || a.ten_doan.localeCompare(b.ten_doan))
                        .map((tour, idx) => {
                          const hdvId = tour.assigned_hdv_id;
                          const hdvName = hdvId ? (hdvMap.get(hdvId) ?? `HDV #${hdvId}`) : null;
                          const changed = tour._prev_hdv_id !== undefined && tour._prev_hdv_id !== tour.assigned_hdv_id;
                          return (
                            <tr key={idx} className={cn(
                              idx % 2 === 0 ? "bg-white" : "bg-gray-50/50",
                              changed && "bg-amber-50"
                            )}>
                              <td className="border px-2 py-1 font-medium">
                                <div className="flex items-center gap-1">
                                  {changed && (
                                    <span className="text-amber-600 font-bold text-[10px] shrink-0" title="Đã thay đổi HDV">✱</span>
                                  )}
                                  {tour.ten_doan}
                                  {!tour.doan_id && (
                                    <span className="text-[9px] border rounded px-1 text-muted-foreground ml-1">File</span>
                                  )}
                                </div>
                              </td>
                              <td className="border px-1 py-0.5">
                                {(() => {
                                  const resultIdx = result.findIndex((t) => t === tour);
                                  return (
                                    <Popover
                                      open={openPopoverIdx === resultIdx}
                                      onOpenChange={(open) => setOpenPopoverIdx(open ? resultIdx : null)}
                                    >
                                      <PopoverTrigger asChild>
                                        <button className={cn(
                                          "flex items-center gap-1 w-full px-1.5 py-1 rounded hover:bg-muted/60 text-left text-xs",
                                          hdvName ? "text-primary font-medium" : "text-destructive"
                                        )}>
                                          {tour.is_chained && <Zap className="h-3 w-3 text-amber-500 shrink-0" />}
                                          <span className="flex-1 truncate">{hdvName ?? "— Chưa xếp —"}</span>
                                          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-52 p-0" align="start">
                                        <Command>
                                          <CommandInput placeholder="Tìm HDV..." className="h-8 text-xs" />
                                          <CommandList>
                                            <CommandEmpty className="py-2 text-xs text-center text-muted-foreground">
                                              Không tìm thấy
                                            </CommandEmpty>
                                            <CommandGroup>
                                              <CommandItem
                                                value="__unassign__"
                                                onSelect={() => {
                                                  handleReassign(resultIdx, null);
                                                  setOpenPopoverIdx(null);
                                                }}
                                                className="text-xs text-muted-foreground"
                                              >
                                                <Check className={cn("h-3 w-3 mr-2", hdvId === null ? "opacity-100" : "opacity-0")} />
                                                — Chưa xếp —
                                              </CommandItem>
                                              {poolHdvs.map((hdv) => (
                                                <CommandItem
                                                  key={hdv.id}
                                                  value={hdv.ten}
                                                  onSelect={() => {
                                                    handleReassign(resultIdx, hdv.id);
                                                    setOpenPopoverIdx(null);
                                                  }}
                                                  className="text-xs"
                                                >
                                                  <Check className={cn("h-3 w-3 mr-2", hdvId === hdv.id ? "opacity-100" : "opacity-0")} />
                                                  {hdv.ten}
                                                </CommandItem>
                                              ))}
                                            </CommandGroup>
                                          </CommandList>
                                        </Command>
                                      </PopoverContent>
                                    </Popover>
                                  );
                                })()}
                              </td>
                              <td className="border px-2 py-1 text-muted-foreground">{tour.agent_ten ?? ""}</td>
                              <td className="border px-2 py-1">{formatDate(tour.ngay_di)}</td>
                              <td className="border px-2 py-1">{formatDate(tour.ngay_ve)}</td>
                              <td className="border px-2 py-1 text-muted-foreground">{tour.chuyen_bay_tien ?? ""}</td>
                              <td className="border px-2 py-1 text-muted-foreground">{tour.chuyen_bay_don ?? ""}</td>
                              <td className="border px-2 py-1 text-muted-foreground">{tour.dia_diem_ten ?? ""}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* ── View theo HDV ── */
                <>
                  {/* Stats bar */}
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
                    {result.some((t) => t._prev_hdv_id !== undefined && t._prev_hdv_id !== t.assigned_hdv_id) && (
                      <span className="text-amber-600 font-medium">
                        · ✱ {result.filter((t) => t._prev_hdv_id !== undefined && t._prev_hdv_id !== t.assigned_hdv_id).length} thay đổi
                      </span>
                    )}
                  </div>

                  {unassignedCount > 0 && groupedResult!.has(null) && (
                    <HDVResultCard
                      hdvId={null}
                      hdvName="Chưa xếp được"
                      tours={groupedResult!.get(null)!}
                      allHdvs={activeHdvs}
                      onReassign={(idx, newHdvId) => {
                        const unassigned = result.filter((t) => t.assigned_hdv_id === null);
                        const globalIdx = result.findIndex((t) => t === unassigned[idx]);
                        handleReassign(globalIdx, newHdvId);
                      }}
                      getSuggestionsForTour={(tour) => getSuggestions(tour, result, poolHdvs)}
                    />
                  )}

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
                          const globalIdx = result.findIndex((t) => t === tours[idx]);
                          handleReassign(globalIdx, newHdvId);
                        }}
                      />
                    ))}
                </>
              )}
            </div>
          </ScrollArea>
          )}
        </Panel>
      </PanelGroup>

      {/* Review Dialog */}
      {reviewRows && (
        <ReviewDialog
          rows={reviewRows}
          onConfirm={confirmImport}
          onCancel={() => setReviewRows(null)}
        />
      )}
    </div>
  );
}
