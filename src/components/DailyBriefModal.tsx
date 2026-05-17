import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, Clock, ClipboardList, Eye, Bell,
  Users, CreditCard, Phone, ChevronRight, Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCongViecList } from "@/hooks/use-cong-viec";
import { useThongBaoCount } from "@/hooks/use-thong-bao";
import { useDNTTNeedingApproval } from "@/hooks/use-dntt";
import { useMyOverdueCount } from "@/hooks/use-lead-next-action";
import {
  useMyDeadlines, useMyCreatedBookingDeadlines, type DeadlineItem,
} from "@/hooks/use-my-job";
import { useMyPhanViecScope } from "@/hooks/use-phan-viec";

function todayStr() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function addDaysStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

interface Section {
  key: string;
  icon: typeof AlertTriangle;
  label: string;
  count: number;
  detail?: string;
  cls: string;
  to: string;
}

export function DailyBriefModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.user_id ?? null;
  const hoTen = user?.ho_ten ?? null;

  const dayKey = uid ? `db_brief_${uid}_${todayStr()}` : null;
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(true);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || !dayKey) return;
    decided.current = true;
    if (!localStorage.getItem(dayKey)) setOpen(true);
  }, [dayKey]);

  // ── Dữ liệu (tái dùng hook sẵn có) ──────────────────────────────────────────
  const { data: scope } = useMyPhanViecScope(uid);
  const pvDoanIds = useMemo(() => [...(scope?.keys() ?? [])], [scope]);
  const { data: pvDl = [] } = useMyDeadlines(pvDoanIds);
  const { data: createdDl = [] } = useMyCreatedBookingDeadlines(hoTen);
  const { data: tasks = [] } = useCongViecList(uid);
  const { data: unread = 0 } = useThongBaoCount(uid);
  const { data: dnttList = [] } = useDNTTNeedingApproval(uid);
  const { data: leadOverdue = 0 } = useMyOverdueCount(uid);

  const deadlines = useMemo(() => {
    const seen = new Set<string>();
    const out: DeadlineItem[] = [];
    for (const d of [...pvDl, ...createdDl]) {
      const k = `${d.type}-${d.bookingId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(d);
    }
    return out;
  }, [pvDl, createdDl]);

  const sections = useMemo<Section[]>(() => {
    const t0 = todayStr();
    const t3 = addDaysStr(3);

    const myActive = tasks.filter(
      (r) => r.nguoi_nhan === uid && (r.trang_thai === "cho_nhan" || r.trang_thai === "dang_lam"),
    );
    const overdueTasks = myActive.filter((r) => r.han_xu_ly && r.han_xu_ly < t0);
    const overdueDl = deadlines.filter((d) => d.deadline < t0);
    const dueSoonDl = deadlines.filter((d) => d.deadline >= t0 && d.deadline <= t3);
    const normalTasks = myActive.filter((r) => r.loai_viec !== "pv_phancong");
    const pvUnconfirmed = myActive.filter(
      (r) => r.loai_viec.startsWith("pv_") && r.loai_viec !== "pv_phancong" && r.trang_thai === "cho_nhan",
    ).length;
    const phanCong = myActive.filter((r) => r.loai_viec === "pv_phancong").length;
    const doanCount = scope?.size ?? 0;

    const overdueCount = overdueDl.length + overdueTasks.length;

    const all: Section[] = [
      {
        key: "overdue",
        icon: AlertTriangle,
        label: "Quá hạn",
        count: overdueCount,
        detail: overdueDl.slice(0, 2).map((d) => `${d.doanName} · ${d.label}`).join(" — ")
          || (overdueTasks.length ? `${overdueTasks.length} việc trễ hạn` : ""),
        cls: "text-red-600 bg-red-50 border-red-200",
        to: "/my-job",
      },
      {
        key: "due",
        icon: Clock,
        label: "Deadline hôm nay / 3 ngày tới",
        count: dueSoonDl.length,
        detail: dueSoonDl.slice(0, 2).map((d) => `${d.doanName} · ${d.label} (${d.deadline})`).join(" — "),
        cls: "text-amber-600 bg-amber-50 border-amber-200",
        to: "/my-job",
      },
      {
        key: "tasks",
        icon: ClipboardList,
        label: "Việc cần xử lý",
        count: normalTasks.length,
        detail: pvUnconfirmed > 0 ? `${pvUnconfirmed} phân việc chưa xác nhận` : normalTasks.slice(0, 2).map((r) => r.tieu_de).join(" — "),
        cls: "text-blue-600 bg-blue-50 border-blue-200",
        to: "/my-job",
      },
      {
        key: "follow",
        icon: Eye,
        label: "Đoàn đang phụ trách",
        count: doanCount,
        detail: doanCount > 0 ? "Theo dõi tiến độ booking" : "",
        cls: "text-teal-600 bg-teal-50 border-teal-200",
        to: "/theo-doi",
      },
      {
        key: "noti",
        icon: Bell,
        label: "Thông báo chưa đọc",
        count: unread,
        detail: "",
        cls: "text-violet-600 bg-violet-50 border-violet-200",
        to: "/my-job",
      },
      {
        key: "phancong",
        icon: Users,
        label: "Đoàn chưa phân người (điều phối)",
        count: phanCong,
        detail: phanCong > 0 ? "Cần phân người phụ trách" : "",
        cls: "text-orange-600 bg-orange-50 border-orange-200",
        to: "/theo-doi",
      },
      {
        key: "dntt",
        icon: CreditCard,
        label: "ĐNTT chờ duyệt",
        count: dnttList.length,
        detail: dnttList.slice(0, 2).map((d) => `${d.ten_doan} · ${d.so_tien.toLocaleString("vi-VN")}đ`).join(" — "),
        cls: "text-emerald-600 bg-emerald-50 border-emerald-200",
        to: "/de-nghi-thanh-toan",
      },
      {
        key: "lead",
        icon: Phone,
        label: "Lead quá hạn follow-up",
        count: leadOverdue,
        detail: "",
        cls: "text-pink-600 bg-pink-50 border-pink-200",
        to: "/viec-lead",
      },
    ];
    return all.filter((s) => s.count > 0);
  }, [tasks, deadlines, scope, unread, dnttList, leadOverdue, uid]);

  if (!uid) return null;

  const close = () => {
    if (dontShow && dayKey) localStorage.setItem(dayKey, "1");
    setOpen(false);
  };
  const go = (to: string) => {
    if (dontShow && dayKey) localStorage.setItem(dayKey, "1");
    setOpen(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Chào {hoTen?.split(" ").slice(-1)[0] || "bạn"} — việc hôm nay
          </DialogTitle>
        </DialogHeader>

        {sections.length === 0 ? (
          <div className="rounded-lg border bg-green-50 border-green-100 px-4 py-8 text-center">
            <p className="text-sm text-green-700 font-medium">Hôm nay không có việc gấp 🎉</p>
            <p className="text-xs text-green-600 mt-0.5">Mọi thứ đang trong tầm kiểm soát</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => go(s.to)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left hover:opacity-80 transition-opacity",
                  s.cls,
                )}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    {s.label}
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-white/70 text-[11px] font-bold">
                      {s.count}
                    </span>
                  </p>
                  {s.detail && (
                    <p className="text-[11px] opacity-80 truncate mt-0.5">{s.detail}</p>
                  )}
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
              </button>
            ))}
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(!!v)} />
            Hôm nay không hiện lại
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={close}>
              Để sau
            </Button>
            <Button size="sm" className="text-xs" onClick={() => go("/my-job")}>
              Vào Việc của tôi
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
