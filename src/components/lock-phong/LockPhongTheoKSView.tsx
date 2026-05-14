import { useEffect, useMemo, useState } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import { vi } from "date-fns/locale";
import { Check, ChevronDown, ChevronRight, Hotel, Mail, MapPin, MailPlus, X as XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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
  useUpdateLockPhongDeadline, useUpdateLockPhongKSEmail,
} from "@/hooks/use-lock-phong";
import LockPhongEmailModal from "./LockPhongEmailModal";
import LockPhongBatchEmailModal, { type KSGroupForBatch } from "./LockPhongBatchEmailModal";
import { isLockPhongDirty } from "./LockPhongCard";

function EmailStatusBadge({ status }: { status: string }) {
  if (status === "da_xac_nhan")
    return <Badge className="text-[10px] bg-teal-100 text-teal-700 border-0">Đã xác nhận</Badge>;
  if (status === "cho_xac_nhan")
    return <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">Chờ xác nhận</Badge>;
  if (status === "da_huy")
    return <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Đã hủy</Badge>;
  return <Badge className="text-[10px] bg-muted text-muted-foreground border-0">Chưa gửi</Badge>;
}

// ── Inline editable cells ─────────────────────────────────────────────────────
// Pattern blur-save: local state mirror DB value, sync khi data refetch (useEffect),
// chỉ fire mutation khi value thực sự thay đổi.
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

function fmtDate(d: string) {
  try {
    return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return d;
  }
}

// Deadline display với màu + countdown (giống deadline view)
function deadlineDisplay(deadline: string | null) {
  if (!deadline) return { text: "—", cls: "text-muted-foreground", subtext: "" };
  try {
    const dl = parseISO(deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = differenceInDays(dl, today);
    const dateStr = format(dl, "dd/MM/yyyy", { locale: vi });
    if (diff < 0) return { text: dateStr, cls: "text-red-700 font-semibold", subtext: `Quá hạn ${Math.abs(diff)} ngày` };
    if (diff === 0) return { text: dateStr, cls: "text-orange-700 font-semibold", subtext: "Hôm nay" };
    if (diff <= 3) return { text: dateStr, cls: "text-orange-600 font-medium", subtext: `Còn ${diff} ngày` };
    if (diff <= 7) return { text: dateStr, cls: "text-amber-600", subtext: `Còn ${diff} ngày` };
    return { text: dateStr, cls: "text-foreground", subtext: `Còn ${diff} ngày` };
  } catch {
    return { text: deadline, cls: "text-muted-foreground", subtext: "" };
  }
}


interface MergedEntry {
  lockPhong: LockPhongDisplay;
  ksRows: LockPhongKSDisplay[]; // 1 hoặc nhiều stay của cùng đoàn ở cùng KS
}

interface KSGroup {
  khach_san_id: number;
  khach_san_ten: string;
  khach_san_email: string | null;
  khach_san_dia_diem: string | null;
  entries: MergedEntry[];
}

interface Props {
  data: LockPhongDisplay[];
}

export default function LockPhongTheoKSView({ data }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [emailTarget, setEmailTarget] = useState<{
    lockPhong: LockPhongDisplay;
    ksRow: LockPhongKSDisplay;
  } | null>(null);
  const [batchTarget, setBatchTarget] = useState<KSGroupForBatch | null>(null);
  const [thanhDoanTarget, setThanhDoanTarget] = useState<{
    ksRowIds: number[]; // all ksRows của đoàn ở KS này — apply code cho tất cả
    tenDoan: string;
    currentCode: string;
  } | null>(null);
  const updateOutcome = useUpdateLockPhongKSOutcome();
  const updateFields = useUpdateLockPhongKSFields();
  const updateDeadline = useUpdateLockPhongDeadline();
  const updateEmail = useUpdateLockPhongKSEmail();
  const [confirmingKsId, setConfirmingKsId] = useState<number | null>(null);

  const handleConfirmAll = async (
    khachSanId: number,
    khachSanTen: string,
    pendingIds: number[],
  ) => {
    if (pendingIds.length === 0) return;
    const ok = window.confirm(
      `Xác nhận lock phòng cho ${pendingIds.length} đoàn tại ${khachSanTen}?`,
    );
    if (!ok) return;
    setConfirmingKsId(khachSanId);
    try {
      const confirmAt = new Date().toISOString();
      await Promise.all(
        pendingIds.map((id) =>
          updateEmail.mutateAsync({
            id,
            fields: { email_status: "da_xac_nhan", email_confirm_at: confirmAt },
          }),
        ),
      );
      toast.success(`Đã xác nhận ${pendingIds.length} đoàn`);
    } catch (e: any) {
      toast.error("Lỗi xác nhận: " + (e?.message || ""));
    } finally {
      setConfirmingKsId(null);
    }
  };

  const saveField = (
    id: number,
    fields: Parameters<typeof updateFields.mutate>[0]["fields"],
  ) => {
    updateFields.mutate(
      { id, fields },
      {
        onError: (e: any) => toast.error("Lỗi cập nhật: " + (e?.message || "")),
      },
    );
  };

  const handleStatusChange = (ksRows: LockPhongKSDisplay[], lpTenDoan: string, value: string) => {
    if (value === "cho_xu_ly") {
      for (const r of ksRows) updateOutcome.mutate({ id: r.id, outcome_status: null });
    } else if (value === "da_huy") {
      for (const r of ksRows) updateOutcome.mutate({ id: r.id, outcome_status: "da_huy" });
    } else if (value === "thanh_doan") {
      // Mở dialog yêu cầu code đoàn chính thức (apply cho tất cả ksRows của đoàn ở KS này)
      setThanhDoanTarget({
        ksRowIds: ksRows.map((r) => r.id),
        tenDoan: lpTenDoan,
        currentCode: ksRows[0].code_doan_thanh || "",
      });
    }
  };

  const groups = useMemo<KSGroup[]>(() => {
    // Step 1: gom ksRows theo (khach_san_id, lockPhong.ten_doan) — merge stays cùng code đoàn ở cùng KS
    // (kể cả khi 2 stay đó được tạo ở 2 lock_phong record khác nhau)
    type MergeKey = string;
    const ksMap = new Map<number, {
      khach_san_id: number;
      khach_san_ten: string;
      khach_san_email: string | null;
      khach_san_dia_diem: string | null;
      mergedMap: Map<MergeKey, MergedEntry>;
    }>();
    for (const lp of data) {
      for (const ks of lp.hotels) {
        if (!ksMap.has(ks.khach_san_id)) {
          ksMap.set(ks.khach_san_id, {
            khach_san_id: ks.khach_san_id,
            khach_san_ten: ks.khach_san_ten,
            khach_san_email: ks.khach_san_email,
            khach_san_dia_diem: ks.khach_san_dia_diem,
            mergedMap: new Map(),
          });
        }
        // Key dùng ten_doan (code đoàn) để gộp các stay cùng code dù khác lock_phong_id
        const key: MergeKey = `${ks.khach_san_id}::${lp.ten_doan}`;
        const grp = ksMap.get(ks.khach_san_id)!;
        if (!grp.mergedMap.has(key)) {
          grp.mergedMap.set(key, { lockPhong: lp, ksRows: [] });
        }
        grp.mergedMap.get(key)!.ksRows.push(ks);
      }
    }
    // Step 2: sort + finalize
    return Array.from(ksMap.values())
      .sort((a, b) => a.khach_san_ten.localeCompare(b.khach_san_ten))
      .map((g) => {
        const entries: MergedEntry[] = Array.from(g.mergedMap.values())
          .map((m) => ({
            lockPhong: m.lockPhong,
            ksRows: [...m.ksRows].sort((a, b) => a.check_in.localeCompare(b.check_in)),
          }))
          .sort((a, b) =>
            a.ksRows[0].check_in.localeCompare(b.ksRows[0].check_in),
          );
        return {
          khach_san_id: g.khach_san_id,
          khach_san_ten: g.khach_san_ten,
          khach_san_email: g.khach_san_email,
          khach_san_dia_diem: g.khach_san_dia_diem,
          entries,
        };
      });
  }, [data]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (groups.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu lock phòng
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isOpen = expandedIds.has(group.khach_san_id);
        return (
          <div
            key={group.khach_san_id}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Hotel header — clickable to expand/collapse */}
            <div className="flex items-center bg-muted/20 border-b border-border">
              <button
                type="button"
                className="flex-1 min-w-0 px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                onClick={() => toggleExpand(group.khach_san_id)}
              >
                <Hotel className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{group.khach_san_ten}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {group.entries.length} đoàn
                    </Badge>
                    {group.khach_san_dia_diem && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {group.khach_san_dia_diem}
                      </span>
                    )}
                    {group.khach_san_email && (
                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        {group.khach_san_email}
                      </span>
                    )}
                  </div>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Batch action buttons */}
              {(() => {
                const pendingIds = group.entries.flatMap(({ ksRows }) =>
                  ksRows.filter((r) => r.email_status === "cho_xac_nhan").map((r) => r.id),
                );
                const isConfirming = confirmingKsId === group.khach_san_id;
                return (
                  <div className="px-3 shrink-0 flex items-center gap-2">
                    {pendingIds.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-teal-700 border-teal-300 hover:bg-teal-50"
                        title={`Xác nhận lock phòng cho ${pendingIds.length} đoàn đang chờ xác nhận`}
                        disabled={isConfirming}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConfirmAll(group.khach_san_id, group.khach_san_ten, pendingIds);
                        }}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {isConfirming ? "Đang xác nhận..." : `Xác nhận all (${pendingIds.length})`}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      title="Gửi 1 email gộp cho tất cả đoàn tại khách sạn này"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Flatten merged entries → 1 entry per ksRow để batch modal vẫn nhận đúng shape
                        const flatEntries = group.entries.flatMap(({ lockPhong, ksRows }) =>
                          ksRows.map((ksRow) => ({ lockPhong, ksRow }))
                        );
                        setBatchTarget({
                          khach_san_id: group.khach_san_id,
                          khach_san_ten: group.khach_san_ten,
                          khach_san_email: group.khach_san_email,
                          entries: flatEntries,
                        });
                      }}
                    >
                      <MailPlus className="h-3.5 w-3.5" />
                      Gửi gộp
                    </Button>
                  </div>
                );
              })()}
            </div>

            {/* Entries table */}
            {isOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">Tên đoàn</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">Seri</th>
                      <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground w-[130px]">Deadline</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">Check-in</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">Check-out</th>
                      <th className="px-4 py-1.5 text-center text-xs font-medium text-muted-foreground w-14">Đêm</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">Số phòng</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">Code NCC</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground w-[200px]">Trạng thái</th>
                      <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground w-[130px]">TT mail</th>
                      <th className="px-4 py-1.5 text-xs font-medium text-muted-foreground" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map(({ lockPhong, ksRows }) =>
                      ksRows.map((ksRow, callIdx) => {
                        const outcomeValue = ksRow.outcome_status ?? "cho_xu_ly";
                        const isFirstCall = callIdx === 0;
                        const callCount = ksRows.length;
                        return (
                          <tr
                            key={`${lockPhong.id}-${ksRow.id}`}
                            className={cn(
                              "hover:bg-muted/10 transition-colors",
                              // Đường border ngăn giữa các đoàn (chỉ ở row cuối cùng của entry)
                              callIdx === callCount - 1 && "border-b border-border last:border-0",
                              // Sub-rows của cùng 1 đoàn — bỏ border giữa các call
                              !isFirstCall && "bg-muted/5",
                              ksRow.outcome_status === "da_huy" && "opacity-50",
                            )}
                          >
                            {isFirstCall && (
                              <>
                                <td
                                  rowSpan={callCount}
                                  className="px-4 py-1 font-medium align-top border-r border-border/40"
                                >
                                  {lockPhong.ten_doan}
                                  {callCount > 1 && (
                                    <Badge className="ml-1.5 text-[9px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">
                                      {callCount} call
                                    </Badge>
                                  )}
                                </td>
                                <td
                                  rowSpan={callCount}
                                  className="px-4 py-1 text-muted-foreground text-xs align-top border-r border-border/40"
                                >
                                  {lockPhong.ten_seri}
                                </td>
                                {(() => {
                                  const dl = deadlineDisplay(lockPhong.deadline);
                                  return (
                                    <td
                                      rowSpan={callCount}
                                      className="px-3 py-1 align-top border-r border-border/40"
                                    >
                                      <DatePicker
                                        value={lockPhong.deadline ?? ""}
                                        onChange={(v) => {
                                          const next = v || null;
                                          if (next !== (lockPhong.deadline ?? null)) {
                                            updateDeadline.mutate(
                                              { id: lockPhong.id, deadline: next },
                                              { onError: (e: any) => toast.error("Lỗi sửa deadline: " + (e?.message || "")) },
                                            );
                                          }
                                        }}
                                        className={cn("h-7 text-xs px-1.5", dl.cls)}
                                      />
                                      {dl.subtext && (
                                        <div className="text-[10px] text-muted-foreground mt-0.5">{dl.subtext}</div>
                                      )}
                                    </td>
                                  );
                                })()}
                              </>
                            )}
                            <td className="px-2 py-1 text-xs">
                              <EditableDateCell
                                value={ksRow.check_in}
                                onSave={(v) => saveField(ksRow.id, { check_in: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-xs">
                              <EditableDateCell
                                value={ksRow.check_out}
                                onSave={(v) => saveField(ksRow.id, { check_out: v })}
                              />
                            </td>
                            <td className="px-4 py-1 text-xs text-center font-medium">{ksRow.so_dem || 0}</td>
                            <td className="px-2 py-1 text-xs">
                              <EditableTextCell
                                value={ksRow.so_phong}
                                onSave={(v) => saveField(ksRow.id, { so_phong: v })}
                                placeholder="—"
                              />
                            </td>
                            <td className="px-2 py-1 text-xs font-mono">
                              <EditableTextCell
                                value={ksRow.code_ncc}
                                onSave={(v) => saveField(ksRow.id, { code_ncc: v })}
                                placeholder="—"
                                className="font-mono"
                              />
                            </td>
                            <td className="px-4 py-1">
                              <div className="flex items-center gap-1.5">
                                <Select
                                  value={outcomeValue}
                                  onValueChange={(v) => handleStatusChange([ksRow], lockPhong.ten_doan, v)}
                                >
                                  <SelectTrigger className="h-7 w-[140px] text-xs">
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
                            <td className="px-3 py-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                <EmailStatusBadge status={ksRow.email_status} />
                                {isLockPhongDirty(ksRow) && (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 flex items-center gap-1"
                                    title="Có thay đổi sau khi gửi mail"
                                  >
                                    <span className="w-1 h-1 rounded-full bg-orange-500" />
                                    Đổi
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-1">
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
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {emailTarget && (
        <LockPhongEmailModal
          open={true}
          onOpenChange={(v) => { if (!v) setEmailTarget(null); }}
          lockPhong={emailTarget.lockPhong}
          ksRow={emailTarget.ksRow}
        />
      )}

      {batchTarget && (
        <LockPhongBatchEmailModal
          open={true}
          onOpenChange={(v) => { if (!v) setBatchTarget(null); }}
          group={batchTarget}
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
          // Apply cho tất cả ksRows (đoàn có thể stay nhiều lần ở cùng KS)
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
  // Re-init khi mở target khác
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
