import { useEffect, useMemo, useState } from "react";
import { format, parseISO, differenceInDays, addDays, formatDistanceToNow } from "date-fns";
import { errMsg } from "@/lib/error";
import { vi } from "date-fns/locale";
import { Check, ChevronDown, ChevronRight, ChevronLeft, Hotel, Mail, MapPin, MailPlus, X as XIcon } from "lucide-react";
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
import { t, useTranslate } from "@/lib/i18n";

function EmailStatusBadge({ status }: { status: string }) {
  if (status === "da_xac_nhan")
    return <Badge className="text-[10px] bg-teal-100 text-teal-700 border-0">{t("Đã xác nhận")}</Badge>;
  if (status === "cho_xac_nhan")
    return <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">{t("Chờ xác nhận")}</Badge>;
  if (status === "da_huy")
    return <Badge className="text-[10px] bg-red-100 text-red-700 border-0">{t("Đã hủy")}</Badge>;
  return <Badge className="text-[10px] bg-muted text-muted-foreground border-0">{t("Chưa gửi")}</Badge>;
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

// Deadline display với màu + countdown (giống deadline view).
// outcome thanh_doan/da_huy → đã chốt: ngày mờ + gạch ngang, KHÔNG báo quá hạn.
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
        subtext: outcome === "thanh_doan" ? t("Đã thành đoàn") : t("Đã hủy"),
      };
    }
    if (diff < 0) return { text: dateStr, cls: "text-red-700 font-semibold", subtext: `${t("Quá hạn")} ${Math.abs(diff)} ${t("ngày")}` };
    if (diff === 0) return { text: dateStr, cls: "text-orange-700 font-semibold", subtext: t("Hôm nay") };
    if (diff <= 3) return { text: dateStr, cls: "text-orange-600 font-medium", subtext: `${t("Còn")} ${diff} ${t("ngày")}` };
    if (diff <= 7) return { text: dateStr, cls: "text-amber-600", subtext: `${t("Còn")} ${diff} ${t("ngày")}` };
    return { text: dateStr, cls: "text-foreground", subtext: `${t("Còn")} ${diff} ${t("ngày")}` };
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
  useTranslate();
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
  const [lpPage, setLpPage] = useState(1);
  const [lpPageSize, setLpPageSize] = useState(5);
  // Phân trang nội bộ từng card khách sạn (số đoàn) — 5/trang
  const [entryPage, setEntryPage] = useState<Record<number, number>>({});

  const handleConfirmAll = async (
    khachSanId: number,
    khachSanTen: string,
    pendingIds: number[],
  ) => {
    if (pendingIds.length === 0) return;
    const ok = window.confirm(
      `${t("Xác nhận lock phòng cho")} ${pendingIds.length} ${t("đoàn tại")} ${khachSanTen}?`,
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
      toast.success(`${t("Đã xác nhận")} ${pendingIds.length} ${t("đoàn")}`);
    } catch (e: unknown) {
      toast.error(t("Lỗi xác nhận") + ": " + (errMsg(e) || ""));
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
        onError: (e: unknown) => toast.error(t("Lỗi cập nhật") + ": " + (errMsg(e) || "")),
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

  const TODAY = format(new Date(), "yyyy-MM-dd");
  const TODAY3 = format(addDays(new Date(), 3), "yyyy-MM-dd");

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
        {t("Chưa có dữ liệu lock phòng")}
      </p>
    );
  }

  const lpTotalPages = Math.max(1, Math.ceil(groups.length / lpPageSize));
  const lpCur = Math.min(lpPage, lpTotalPages);
  const pageGroups = groups.slice((lpCur - 1) * lpPageSize, lpCur * lpPageSize);

  return (
    <div className="space-y-3">
      {pageGroups.map((group) => {
        const isOpen = expandedIds.has(group.khach_san_id);
        const ePageSize = 5;
        const eTotalPages = Math.max(1, Math.ceil(group.entries.length / ePageSize));
        const eCur = Math.min(entryPage[group.khach_san_id] ?? 1, eTotalPages);
        const pageEntries = group.entries.slice((eCur - 1) * ePageSize, eCur * ePageSize);
        const allRows = group.entries.flatMap((e) =>
          e.ksRows.map((r) => ({ r, lp: e.lockPhong })),
        );
        const total = allRows.length;
        const daXN = allRows.filter((x) => x.r.email_status === "da_xac_nhan").length;
        const choXN = allRows.filter((x) => x.r.email_status === "cho_xac_nhan").length;
        const sapDen = allRows.filter(
          (x) => x.lp.deadline && x.lp.deadline >= TODAY && x.lp.deadline <= TODAY3 && x.r.email_status !== "da_xac_nhan",
        ).length;
        const quaHan = allRows.filter(
          (x) => x.lp.deadline && x.lp.deadline < TODAY && x.r.email_status !== "da_xac_nhan",
        ).length;
        const pct = total ? Math.round((daXN / total) * 100) : 0;
        const earliestDl = allRows
          .map((x) => x.lp.deadline)
          .filter((d): d is string => !!d)
          .sort()[0] ?? null;
        const dl = deadlineDisplay(earliestDl);
        const lastMailAt = allRows
          .map((x) => x.r.email_sent_at)
          .filter((d): d is string => !!d)
          .sort()
          .slice(-1)[0] ?? null;
        const lastMailRel = lastMailAt
          ? formatDistanceToNow(new Date(lastMailAt), { addSuffix: true, locale: vi })
          : t("Chưa gửi");
        const hotelStatus =
          quaHan > 0 ? { l: t("Quá hạn"), c: "bg-red-100 text-red-700" }
          : sapDen > 0 ? { l: t("Sắp đến hạn"), c: "bg-amber-100 text-amber-700" }
          : total > 0 && daXN === total ? { l: t("Đã xác nhận"), c: "bg-emerald-100 text-emerald-700" }
          : { l: t("Chờ xử lý"), c: "bg-blue-100 text-blue-700" };
        const pendingIds = group.entries.flatMap(({ ksRows }) =>
          ksRows.filter((r) => r.email_status === "cho_xac_nhan").map((r) => r.id),
        );
        const isConfirming = confirmingKsId === group.khach_san_id;
        return (
          <div
            key={group.khach_san_id}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            {/* Hotel summary header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/10 border-b border-border">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary grid place-items-center text-sm font-bold shrink-0">
                {group.khach_san_ten.slice(0, 1).toUpperCase()}
              </div>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => toggleExpand(group.khach_san_id)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{group.khach_san_ten}</span>
                  <Badge className={cn("text-[10px] border-0", hotelStatus.c)}>{hotelStatus.l}</Badge>
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Hotel className="h-3 w-3" />{group.entries.length} {t("đoàn")}
                  </span>
                  {group.khach_san_dia_diem && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />{group.khach_san_dia_diem}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 w-32 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{pct}% {t("đã xác nhận")}</span>
                </div>
              </button>

              <div className="hidden md:flex items-center gap-4 shrink-0 text-center">
                {[
                  { n: daXN, l: t("Đã xác nhận"), c: "text-emerald-600" },
                  { n: choXN, l: t("Chờ xác nhận"), c: "text-blue-600" },
                  { n: sapDen, l: t("Sắp đến hạn"), c: "text-amber-600" },
                  { n: quaHan, l: t("Quá hạn"), c: "text-red-600" },
                ].map((x) => (
                  <div key={x.l} className="w-16">
                    <div className={cn("text-base font-bold", x.c)}>{x.n}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">{x.l}</div>
                  </div>
                ))}
              </div>

              <div className="hidden xl:block shrink-0 w-44 text-xs border-l border-border pl-3">
                <div className="text-[10px] text-muted-foreground">{t("Deadline sớm nhất")}</div>
                <div className={dl.cls}>{dl.text}</div>
                {dl.subtext && <div className="text-[10px] text-muted-foreground">{dl.subtext}</div>}
                <div className="text-[10px] text-muted-foreground mt-0.5">{t("Last mail")}: {lastMailRel}</div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {pendingIds.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-teal-700 border-teal-300 hover:bg-teal-50"
                    title={`${t("Xác nhận lock phòng cho")} ${pendingIds.length} ${t("đoàn đang chờ xác nhận")}`}
                    disabled={isConfirming}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConfirmAll(group.khach_san_id, group.khach_san_ten, pendingIds);
                    }}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isConfirming ? t("Đang xác nhận...") : `${t("Xác nhận all")} (${pendingIds.length})`}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  title={t("Gửi 1 email gộp cho tất cả đoàn tại khách sạn này")}
                  onClick={(e) => {
                    e.stopPropagation();
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
                  {t("Gửi gộp")}
                </Button>
                <button
                  type="button"
                  onClick={() => toggleExpand(group.khach_san_id)}
                  className="h-7 w-7 grid place-items-center rounded hover:bg-muted/50 text-muted-foreground"
                  title={isOpen ? t("Thu gọn") : t("Mở chi tiết")}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Entries table */}
            {isOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/10">
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">{t("Tên đoàn")}</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">{t("Seri")}</th>
                      <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground w-[130px]">{t("Deadline")}</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">{t("Check-in")}</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">{t("Check-out")}</th>
                      <th className="px-4 py-1.5 text-center text-xs font-medium text-muted-foreground w-14">{t("Đêm")}</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">{t("Số phòng")}</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground">{t("Code NCC")}</th>
                      <th className="px-4 py-1.5 text-left text-xs font-medium text-muted-foreground w-[200px]">{t("Trạng thái")}</th>
                      <th className="px-3 py-1.5 text-left text-xs font-medium text-muted-foreground w-[130px]">{t("TT mail")}</th>
                      <th className="px-4 py-1.5 text-xs font-medium text-muted-foreground" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageEntries.map(({ lockPhong, ksRows }) =>
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
                                      {callCount} {t("call")}
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
                                  const dl = deadlineDisplay(lockPhong.deadline, ksRow.outcome_status);
                                  return (
                                    <td
                                      rowSpan={callCount}
                                      className="px-3 py-1 align-middle border-r border-border/40 text-center"
                                    >
                                      <div className={cn(
                                        "inline-flex flex-col items-center gap-0.5 rounded-md border px-2 py-1",
                                        dl.cls.includes("red") ? "border-red-200 bg-red-50"
                                          : dl.cls.includes("orange") ? "border-orange-200 bg-orange-50"
                                          : dl.cls.includes("green") ? "border-green-200 bg-green-50"
                                          : "border-border bg-muted/30",
                                      )}>
                                        <DatePicker
                                          value={lockPhong.deadline ?? ""}
                                          onChange={(v) => {
                                            const next = v || null;
                                            if (next !== (lockPhong.deadline ?? null)) {
                                              updateDeadline.mutate(
                                                { id: lockPhong.id, deadline: next },
                                                { onError: (e: unknown) => toast.error(t("Lỗi sửa deadline") + ": " + (errMsg(e) || "")) },
                                              );
                                            }
                                          }}
                                          className={cn("h-6 text-xs px-1 border-0 bg-transparent text-center font-medium", dl.cls)}
                                        />
                                        {dl.subtext && (
                                          <div className="text-[10px] text-muted-foreground">{dl.subtext}</div>
                                        )}
                                      </div>
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
                                        ? t("Chờ xử lý")
                                        : outcomeValue === "da_huy"
                                        ? t("Đã hủy")
                                        : t("Thành đoàn")}
                                    </span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cho_xu_ly">{t("Chờ xử lý")}</SelectItem>
                                    <SelectItem value="da_huy">{t("Đã hủy")}</SelectItem>
                                    <SelectItem value="thanh_doan">{t("Thành đoàn")}</SelectItem>
                                  </SelectContent>
                                </Select>
                                {ksRow.outcome_status === "thanh_doan" && (
                                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">
                                    {ksRow.code_doan_thanh || t("(chưa code)")}
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
                                    title={t("Có thay đổi sau khi gửi mail")}
                                  >
                                    <span className="w-1 h-1 rounded-full bg-orange-500" />
                                    {t("Đổi")}
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
                                {t("Email")}
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                {group.entries.length > ePageSize && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-4 py-2 border-t border-border">
                    <span>
                      {t("Hiển thị")} {(eCur - 1) * ePageSize + 1}–{Math.min(eCur * ePageSize, group.entries.length)} / {group.entries.length} {t("đoàn")}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2"
                        disabled={eCur <= 1}
                        onClick={() => setEntryPage((m) => ({ ...m, [group.khach_san_id]: eCur - 1 }))}>
                        <ChevronLeft className="h-3 w-3 mr-0.5" /> {t("Trước")}
                      </Button>
                      <span className="px-2">{t("Trang")} {eCur}/{eTotalPages}</span>
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2"
                        disabled={eCur >= eTotalPages}
                        onClick={() => setEntryPage((m) => ({ ...m, [group.khach_san_id]: eCur + 1 }))}>
                        {t("Sau")} <ChevronRight className="h-3 w-3 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {groups.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 flex-wrap gap-2">
          <span>
            {t("Hiển thị")} {(lpCur - 1) * lpPageSize + 1}–{Math.min(lpCur * lpPageSize, groups.length)} / {groups.length} {t("khách sạn")}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs"
              disabled={lpCur <= 1} onClick={() => setLpPage(lpCur - 1)}>
              <ChevronLeft className="h-3 w-3 mr-0.5" /> {t("Trước")}
            </Button>
            <span className="px-2">{t("Trang")} {lpCur}/{lpTotalPages}</span>
            <Button variant="outline" size="sm" className="h-7 text-xs"
              disabled={lpCur >= lpTotalPages} onClick={() => setLpPage(lpCur + 1)}>
              {t("Sau")} <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
          <Select value={String(lpPageSize)} onValueChange={(v) => { setLpPageSize(Number(v)); setLpPage(1); }}>
            <SelectTrigger className="h-7 text-xs w-[140px]">
              <span>{t("Hiển thị")} {lpPageSize}/{t("trang")}</span>
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 20, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} {t("khách sạn / trang")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            toast.warning(t("Cần nhập code đoàn chính thức"));
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
                    toast.success(`${t("Đã đánh dấu thành đoàn")} (${trimmed})`);
                    setThanhDoanTarget(null);
                  }
                },
                onError: (e: unknown) => {
                  hadError = true;
                  toast.error(t("Lỗi") + ": " + (errMsg(e) || ""));
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
  useTranslate();
  const [code, setCode] = useState("");
  const targetKey = target?.ksRowIds.join(",") ?? null;
  // Re-init code khi mở target khác — pattern "adjust state during render".
  const [prevTargetKey, setPrevTargetKey] = useState<string | null | undefined>(undefined);
  if (targetKey !== prevTargetKey) {
    setPrevTargetKey(targetKey);
    setCode(target?.currentCode ?? "");
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Đoàn lock thành đoàn chính thức")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 text-sm">
          {target && (
            <p className="text-muted-foreground">
              {t("Lock")}: <span className="font-medium text-foreground">{target.tenDoan}</span>
            </p>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Code đoàn chính thức")} *</Label>
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("vd: TQ250501-FY")}
              className="h-9 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") onSubmit(code); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("Hủy")}</Button>
          <Button onClick={() => onSubmit(code)} disabled={!code.trim()}>
            {t("Xác nhận")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
