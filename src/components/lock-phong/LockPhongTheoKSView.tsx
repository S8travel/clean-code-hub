import { useMemo, useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ChevronDown, ChevronRight, Hotel, Mail, MapPin, MailPlus, X as XIcon } from "lucide-react";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type LockPhongDisplay, type LockPhongKSDisplay,
  useUpdateLockPhongKSOutcome,
} from "@/hooks/use-lock-phong";
import LockPhongEmailModal from "./LockPhongEmailModal";
import LockPhongBatchEmailModal, { type KSGroupForBatch } from "./LockPhongBatchEmailModal";

function fmtDate(d: string) {
  try {
    return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return d;
  }
}


interface KSGroup {
  khach_san_id: number;
  khach_san_ten: string;
  khach_san_email: string | null;
  khach_san_dia_diem: string | null;
  entries: { lockPhong: LockPhongDisplay; ksRow: LockPhongKSDisplay }[];
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
    ksRowId: number;
    tenDoan: string;
    currentCode: string;
  } | null>(null);
  const updateOutcome = useUpdateLockPhongKSOutcome();

  const handleStatusChange = (ksRow: LockPhongKSDisplay, lpTenDoan: string, value: string) => {
    if (value === "cho_xu_ly") {
      updateOutcome.mutate({ id: ksRow.id, outcome_status: null });
    } else if (value === "da_huy") {
      updateOutcome.mutate({ id: ksRow.id, outcome_status: "da_huy" });
    } else if (value === "thanh_doan") {
      // Mở dialog yêu cầu code đoàn chính thức
      setThanhDoanTarget({
        ksRowId: ksRow.id,
        tenDoan: lpTenDoan,
        currentCode: ksRow.code_doan_thanh || "",
      });
    }
  };

  const groups = useMemo<KSGroup[]>(() => {
    const map = new Map<number, KSGroup>();
    for (const lp of data) {
      for (const ks of lp.hotels) {
        if (!map.has(ks.khach_san_id)) {
          map.set(ks.khach_san_id, {
            khach_san_id: ks.khach_san_id,
            khach_san_ten: ks.khach_san_ten,
            khach_san_email: ks.khach_san_email,
            khach_san_dia_diem: ks.khach_san_dia_diem,
            entries: [],
          });
        }
        map.get(ks.khach_san_id)!.entries.push({ lockPhong: lp, ksRow: ks });
      }
    }
    // Sort by hotel name, then sort each group's entries by check_in
    return Array.from(map.values())
      .sort((a, b) => a.khach_san_ten.localeCompare(b.khach_san_ten))
      .map((g) => ({
        ...g,
        entries: [...g.entries].sort((a, b) =>
          a.ksRow.check_in.localeCompare(b.ksRow.check_in)
        ),
      }));
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

              {/* Batch email button */}
              <div className="px-3 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  title="Gửi 1 email gộp cho tất cả đoàn tại khách sạn này"
                  onClick={(e) => {
                    e.stopPropagation();
                    setBatchTarget({
                      khach_san_id: group.khach_san_id,
                      khach_san_ten: group.khach_san_ten,
                      khach_san_email: group.khach_san_email,
                      entries: group.entries,
                    });
                  }}
                >
                  <MailPlus className="h-3.5 w-3.5" />
                  Gửi gộp
                </Button>
              </div>
            </div>

            {/* Entries table */}
            {isOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Tên đoàn</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Seri</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Check-in</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Check-out</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground w-14">Đêm</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Số phòng</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Code NCC</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground w-[200px]">Trạng thái</th>
                      <th className="px-4 py-2 text-xs font-medium text-muted-foreground" />
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map(({ lockPhong, ksRow }) => {
                      const outcomeValue = ksRow.outcome_status ?? "cho_xu_ly";
                      return (
                        <tr
                          key={`${lockPhong.id}-${ksRow.id}`}
                          className={cn(
                            "border-b border-border last:border-0 hover:bg-muted/10 transition-colors",
                            ksRow.outcome_status === "da_huy" && "opacity-50"
                          )}
                        >
                          <td className="px-4 py-2.5 font-medium">{lockPhong.ten_doan}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">
                            {lockPhong.ten_seri}
                          </td>
                          <td className="px-4 py-2.5 text-xs">{fmtDate(ksRow.check_in)}</td>
                          <td className="px-4 py-2.5 text-xs">{fmtDate(ksRow.check_out)}</td>
                          <td className="px-4 py-2.5 text-xs text-center font-medium">{ksRow.so_dem || 0}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {ksRow.so_phong || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                            {ksRow.code_ncc || "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={outcomeValue}
                                onValueChange={(v) => handleStatusChange(ksRow, lockPhong.ten_doan, v)}
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
                          <td className="px-4 py-2.5">
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
          updateOutcome.mutate(
            { id: thanhDoanTarget.ksRowId, outcome_status: "thanh_doan", code_doan_thanh: trimmed },
            {
              onSuccess: () => {
                toast.success(`Đã đánh dấu thành đoàn (${trimmed})`);
                setThanhDoanTarget(null);
              },
              onError: (e: any) => toast.error("Lỗi: " + (e?.message || "")),
            },
          );
        }}
      />
    </div>
  );
}

function ThanhDoanDialog({
  target, onClose, onSubmit,
}: {
  target: { ksRowId: number; tenDoan: string; currentCode: string } | null;
  onClose: () => void;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  // Re-init khi mở target khác
  useMemo(() => { setCode(target?.currentCode ?? ""); }, [target?.ksRowId]);

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
