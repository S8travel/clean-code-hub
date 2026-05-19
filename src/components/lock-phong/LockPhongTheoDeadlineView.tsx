import { useEffect, useMemo, useState } from "react";
import { format, differenceInDays, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { Mail, X as XIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type LockPhongDisplay, type LockPhongKSDisplay,
  useUpdateLockPhongKSOutcome, useUpdateLockPhongKSFields,
} from "@/hooks/use-lock-phong";
import LockPhongEmailModal from "./LockPhongEmailModal";

// ── Inline editable cells (duplicated from KS view) ─────────────────────────
function EditableTextCell({
  value, onSave, className, placeholder,
}: { value: string | null; onSave: (v: string | null) => void; className?: string; placeholder?: string }) {
  const [local, setLocal] = useState(value ?? "");
  useEffect(() => { setLocal(value ?? ""); }, [value]);
  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const next = local.trim() || null;
        if (next !== (value ?? null)) onSave(next);
      }}
      placeholder={placeholder}
      className={cn("h-7 text-xs px-1.5", className)}
    />
  );
}

function EditableDateCell({
  value, onSave,
}: { value: string; onSave: (v: string) => void }) {
  return (
    <DatePicker
      value={value}
      onChange={(v) => { if (v && v !== value) onSave(v); }}
      className="h-7 text-xs px-1.5"
    />
  );
}

// Format deadline với màu + countdown.
// outcome thanh_doan/da_huy → đã chốt, deadline hết ý nghĩa: hiện ngày mờ +
// gạch ngang, KHÔNG báo "Quá hạn"/đếm ngược (tránh hiểu nhầm còn phải xử lý).
function deadlineDisplay(deadline: string | null, outcome?: string | null) {
  if (!deadline) return { text: "—", cls: "text-muted-foreground", subtext: "" };
  try {
    const dl = parseISO(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = differenceInDays(dl, today);
    const dateStr = format(dl, "dd/MM/yyyy", { locale: vi });
    if (outcome === "thanh_doan" || outcome === "da_huy") {
      return {
        text: dateStr,
        cls: "text-muted-foreground line-through",
        subtext: outcome === "thanh_doan" ? "Đã thành đoàn" : "Đã hủy",
      };
    }
    if (diff < 0) {
      return {
        text: dateStr,
        cls: "text-red-700 font-semibold",
        subtext: `Quá hạn ${Math.abs(diff)} ngày`,
      };
    }
    if (diff === 0) {
      return { text: dateStr, cls: "text-orange-700 font-semibold", subtext: "Hôm nay" };
    }
    if (diff <= 3) {
      return { text: dateStr, cls: "text-orange-600 font-medium", subtext: `Còn ${diff} ngày` };
    }
    if (diff <= 7) {
      return { text: dateStr, cls: "text-amber-600", subtext: `Còn ${diff} ngày` };
    }
    return { text: dateStr, cls: "text-foreground", subtext: `Còn ${diff} ngày` };
  } catch {
    return { text: deadline, cls: "text-muted-foreground", subtext: "" };
  }
}

interface FlatRow {
  lockPhong: LockPhongDisplay;
  ksRow: LockPhongKSDisplay;
}

interface Props {
  data: LockPhongDisplay[];
}

export default function LockPhongTheoDeadlineView({ data }: Props) {
  const [emailTarget, setEmailTarget] = useState<{
    lockPhong: LockPhongDisplay;
    ksRow: LockPhongKSDisplay;
  } | null>(null);
  const [thanhDoanTarget, setThanhDoanTarget] = useState<{
    ksRowIds: number[];
    tenDoan: string;
    currentCode: string;
  } | null>(null);
  const updateOutcome = useUpdateLockPhongKSOutcome();
  const updateFields = useUpdateLockPhongKSFields();

  const saveField = (
    id: number,
    fields: Parameters<typeof updateFields.mutate>[0]["fields"],
  ) => {
    updateFields.mutate(
      { id, fields },
      { onError: (e: any) => toast.error("Lỗi cập nhật: " + (e?.message || "")) },
    );
  };

  const handleStatusChange = (ksRow: LockPhongKSDisplay, lpTenDoan: string, value: string) => {
    if (value === "cho_xu_ly") {
      updateOutcome.mutate({ id: ksRow.id, outcome_status: null });
    } else if (value === "da_huy") {
      updateOutcome.mutate({ id: ksRow.id, outcome_status: "da_huy" });
    } else if (value === "thanh_doan") {
      setThanhDoanTarget({
        ksRowIds: [ksRow.id],
        tenDoan: lpTenDoan,
        currentCode: ksRow.code_doan_thanh || "",
      });
    }
  };

  // Flatten + sort by deadline ASC (NULL xuống cuối). Tiebreak theo check_in.
  // "Theo deadline" = danh sách cần xử lý theo hạn → dòng đã THÀNH ĐOÀN không
  // còn deadline để theo, ẩn hẳn (không chỉ làm mờ). Đã hủy vẫn để
  // page-level outcomeFilter điều khiển.
  const rows = useMemo<FlatRow[]>(() => {
    const flat = data.flatMap((lp) =>
      lp.hotels
        .filter((ksRow) => ksRow.outcome_status !== "thanh_doan")
        .map((ksRow) => ({ lockPhong: lp, ksRow })),
    );
    return flat.sort((a, b) => {
      const da = a.lockPhong.deadline || "9999-12-31";
      const db = b.lockPhong.deadline || "9999-12-31";
      if (da !== db) return da.localeCompare(db);
      return (a.ksRow.check_in || "").localeCompare(b.ksRow.check_in || "");
    });
  }, [data]);

  // Pagination
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  // Reset page về 1 khi data đổi → tránh page out-of-range
  useEffect(() => { setPage(1); }, [rows.length]);
  const pageRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  if (rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu lock phòng
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[130px]">Deadline</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[180px]">Tên đoàn</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[90px]">Seri</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground min-w-[180px]">Khách sạn</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[130px]">Check-in</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[130px]">Check-out</th>
              <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground w-14">Đêm</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[180px]">Số phòng</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[120px]">Code NCC</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[200px]">Trạng thái</th>
              <th className="px-2 py-2 w-[90px]" />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(({ lockPhong, ksRow }) => {
              const dl = deadlineDisplay(lockPhong.deadline, ksRow.outcome_status);
              const outcomeValue = ksRow.outcome_status ?? "cho_xu_ly";
              return (
                <tr
                  key={`${lockPhong.id}-${ksRow.id}`}
                  className={cn(
                    "border-b border-border last:border-0 hover:bg-muted/10 transition-colors",
                    ksRow.outcome_status === "da_huy" && "opacity-50",
                  )}
                >
                  <td className="px-3 py-2 align-top">
                    <div className={cn("text-xs", dl.cls)}>{dl.text}</div>
                    {dl.subtext && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">{dl.subtext}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-xs">{lockPhong.ten_doan}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{lockPhong.ten_seri}</td>
                  <td className="px-3 py-2 text-xs">{ksRow.khach_san_ten}</td>
                  <td className="px-2 py-2">
                    <EditableDateCell
                      value={ksRow.check_in}
                      onSave={(v) => saveField(ksRow.id, { check_in: v })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <EditableDateCell
                      value={ksRow.check_out}
                      onSave={(v) => saveField(ksRow.id, { check_out: v })}
                    />
                  </td>
                  <td className="px-2 py-2 text-xs text-center font-medium">{ksRow.so_dem || 0}</td>
                  <td className="px-2 py-2">
                    <EditableTextCell
                      value={ksRow.so_phong}
                      onSave={(v) => saveField(ksRow.id, { so_phong: v })}
                      placeholder="—"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <EditableTextCell
                      value={ksRow.code_ncc}
                      onSave={(v) => saveField(ksRow.id, { code_ncc: v })}
                      placeholder="—"
                      className="font-mono"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={outcomeValue}
                        onValueChange={(v) => handleStatusChange(ksRow, lockPhong.ten_doan, v)}
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs">
                          <span>
                            {outcomeValue === "cho_xu_ly"
                              ? "Chờ xử lý"
                              : outcomeValue === "da_huy"
                              ? "Đã hủy"
                              : "Thành đoàn"}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cho_xu_ly">Chờ xử lý</SelectItem>
                          <SelectItem value="da_huy">Đã hủy</SelectItem>
                          <SelectItem value="thanh_doan">Thành đoàn</SelectItem>
                        </SelectContent>
                      </Select>
                      {ksRow.outcome_status === "thanh_doan" && (
                        <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">
                          {ksRow.code_doan_thanh || "(chưa code)"}
                        </Badge>
                      )}
                      {ksRow.outcome_status === "da_huy" && (
                        <XIcon className="h-3 w-3 text-red-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
                      onClick={() => setEmailTarget({ lockPhong, ksRow })}
                    >
                      <Mail className="h-3 w-3" />
                      Email
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-muted/10 text-xs">
          <span className="text-muted-foreground">
            Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} / {rows.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 tabular-nums">
              Trang {page}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {emailTarget && (
        <LockPhongEmailModal
          open={true}
          onOpenChange={(v) => { if (!v) setEmailTarget(null); }}
          lockPhong={emailTarget.lockPhong}
          ksRow={emailTarget.ksRow}
        />
      )}

      <ThanhDoanDialog
        target={thanhDoanTarget}
        onClose={() => setThanhDoanTarget(null)}
        onSubmit={(code) => {
          if (!thanhDoanTarget) return;
          const trimmed = code.trim();
          if (!trimmed) {
            toast.warning("Cần nhập code đoàn chính thức");
            return;
          }
          let pending = thanhDoanTarget.ksRowIds.length;
          let hadError = false;
          for (const id of thanhDoanTarget.ksRowIds) {
            updateOutcome.mutate(
              { id, outcome_status: "thanh_doan", code_doan_thanh: trimmed },
              {
                onSuccess: () => {
                  pending -= 1;
                  if (pending === 0 && !hadError) {
                    toast.success(`Đã đánh dấu thành đoàn (${trimmed})`);
                    setThanhDoanTarget(null);
                  }
                },
                onError: (e: any) => {
                  hadError = true;
                  toast.error("Lỗi: " + (e?.message || ""));
                },
              },
            );
          }
        }}
      />
    </div>
  );
}

function ThanhDoanDialog({
  target, onClose, onSubmit,
}: {
  target: { ksRowIds: number[]; tenDoan: string; currentCode: string } | null;
  onClose: () => void;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const targetKey = target?.ksRowIds.join(",") ?? null;
  useMemo(() => { setCode(target?.currentCode ?? ""); }, [targetKey]);

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Đoàn lock thành đoàn chính thức</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          {target && (
            <p className="text-muted-foreground">
              Lock: <span className="font-medium text-foreground">{target.tenDoan}</span>
            </p>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Code đoàn chính thức *</Label>
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="vd: TQ250501-FY"
              className="h-9 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") onSubmit(code); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => onSubmit(code)} disabled={!code.trim()}>
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
