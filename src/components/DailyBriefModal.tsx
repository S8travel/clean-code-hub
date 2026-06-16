import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, Clock, ClipboardList, Eye, CalendarDays,
  ChevronRight, Bot, Rocket, CreditCard, Wallet, Receipt,
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
import { useKeToanBrief } from "@/hooks/use-ke-toan-brief";
import { t, useTranslate } from "@/lib/i18n";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
function addDaysStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
}
function fmtVND(n: number) {
  return (n || 0).toLocaleString("vi-VN") + " đ";
}
function greet() {
  const h = new Date().getHours();
  if (h < 11) return t("Chào buổi sáng");
  if (h < 13) return t("Chào buổi trưa");
  if (h < 18) return t("Chào buổi chiều");
  return t("Chào buổi tối");
}
const BO_PHAN_LABEL: Record<string, string> = {
  dieu_hanh: "Điều hành", ke_toan: "Kế toán", sales: "Sales",
};

interface StatCard {
  key: string; label: string; count: number; unit: string;
  icon: typeof Clock; tile: string; to: string;
}

export function DailyBriefModal() {
  useTranslate();
  const { user } = useAuth();
  const navigate = useNavigate();
  const uid = user?.user_id ?? null;
  const hoTen = user?.ho_ten ?? null;
  // Tên gọi = 2 chữ cuối trong họ và tên (vd "Nguyễn Vũ Hà" → "Vũ Hà")
  const firstName =
    hoTen?.trim().split(/\s+/).filter(Boolean).slice(-2).join(" ") || t("bạn");

  const dayKey = uid ? `db_brief_v2_${uid}_${todayStr()}` : null;
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || !dayKey) return;
    decided.current = true;
    if (!localStorage.getItem(dayKey)) setOpen(true);
  }, [dayKey]);

  const { data: scope } = useMyPhanViecScope(uid);
  const pvDoanIds = useMemo(() => [...(scope?.keys() ?? [])], [scope]);
  const { data: pvDl = [] } = useMyDeadlines(pvDoanIds);
  const { data: createdDl = [] } = useMyCreatedBookingDeadlines(hoTen);
  const { data: tasks = [] } = useCongViecList(uid);
  const { data: unread = 0 } = useThongBaoCount(uid);
  const { data: dnttList = [] } = useDNTTNeedingApproval(uid);
  const { data: leadOverdue = 0 } = useMyOverdueCount(uid);
  const isKeToan = user?.bo_phan === "ke_toan";
  const { data: kt } = useKeToanBrief(uid, !!uid);

  const deadlines = useMemo(() => {
    const seen = new Set<string>();
    const out: DeadlineItem[] = [];
    for (const d of [...pvDl, ...createdDl]) {
      const k = `${d.rpcType}-${d.bookingId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(d);
    }
    return out;
  }, [pvDl, createdDl]);

  const m = useMemo(() => {
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
    const total = normalTasks.length + overdueCount + dueSoonDl.length + phanCong;
    return { overdueDl, dueSoonDl, normalTasks, pvUnconfirmed, phanCong, doanCount, overdueCount, total };
  }, [tasks, deadlines, scope, uid]);

  const statCards: StatCard[] = useMemo(() => ([
    { key: "due", label: t("Deadline sắp tới"), count: m.dueSoonDl.length, unit: t("deadline"),
      icon: Clock, tile: "bg-rose-500", to: "/my-job" },
    { key: "task", label: t("Việc cần xử lý"), count: m.normalTasks.length, unit: t("công việc"),
      icon: ClipboardList, tile: "bg-blue-500", to: "/my-job" },
    { key: "doan", label: t("Đoàn đang phụ trách"), count: m.doanCount, unit: t("đoàn"),
      icon: Eye, tile: "bg-emerald-500", to: "/theo-doi" },
    { key: "overdue", label: t("Việc quá hạn"), count: m.overdueCount, unit: t("việc"),
      icon: AlertTriangle, tile: "bg-orange-500", to: "/my-job" },
  ]), [m]);

  const attention = useMemo(() => {
    const out: { tone: string; title: string; sub: string; to: string }[] = [];
    if (m.overdueCount > 0)
      out.push({ tone: "bg-red-500", title: `${m.overdueCount} ${t("việc / deadline quá hạn")}`,
        sub: m.overdueDl.slice(0, 2).map((d) => d.doanName).join(", ") || t("Cần xử lý ngay"), to: "/my-job" });
    if (m.pvUnconfirmed > 0)
      out.push({ tone: "bg-amber-500", title: `${m.pvUnconfirmed} ${t("phân việc chưa xác nhận")}`,
        sub: t("Vào nhận hoặc từ chối"), to: "/my-job" });
    if (m.phanCong > 0)
      out.push({ tone: "bg-orange-500", title: `${m.phanCong} ${t("đoàn chưa phân người")}`,
        sub: t("Điều phối cần phân người phụ trách"), to: "/theo-doi" });
    if (dnttList.length > 0)
      out.push({ tone: "bg-emerald-600", title: `${dnttList.length} ${t("ĐNTT chờ bạn duyệt")}`,
        sub: dnttList.slice(0, 2).map((d) => d.ten_doan).join(", "), to: "/de-nghi-thanh-toan" });
    if (leadOverdue > 0)
      out.push({ tone: "bg-pink-500", title: `${leadOverdue} ${t("lead quá hạn follow-up")}`,
        sub: t("Liên hệ kẻo mất khách"), to: "/viec-lead" });
    if (unread > 0)
      out.push({ tone: "bg-violet-500", title: `${unread} ${t("thông báo chưa đọc")}`,
        sub: t("Xem trong Việc của tôi"), to: "/my-job" });
    return out;
  }, [m, dnttList, leadOverdue, unread]);

  const tips = useMemo(() => {
    const arr: string[] = [];
    if (m.overdueCount > 0) arr.push(`${t("Ưu tiên xử lý")} ${m.overdueCount} ${t("việc/deadline quá hạn ngay trong sáng nay.")}`);
    if (m.dueSoonDl.length > 0) arr.push(`${t("Có")} ${m.dueSoonDl.length} ${t("deadline trong 3 ngày tới — gửi/nhắc NCC sớm.")}`);
    if (m.pvUnconfirmed > 0) arr.push(`${t("Xác nhận")} ${m.pvUnconfirmed} ${t("phân việc đang chờ bạn nhận.")}`);
    if (m.phanCong > 0) arr.push(`${m.phanCong} ${t("đoàn chưa phân người — phân sớm để kịp đặt dịch vụ.")}`);
    if (leadOverdue > 0) arr.push(`${leadOverdue} ${t("lead quá hạn — gọi/nhắn ngay để giữ khách.")}`);
    if (dnttList.length > 0) arr.push(`${dnttList.length} ${t("đề nghị thanh toán đang chờ bạn duyệt.")}`);
    if (arr.length === 0) arr.push(t("Mọi việc đang trong tầm kiểm soát — giữ phong độ nhé! 🎯"));
    return arr.slice(0, 4);
  }, [m, leadOverdue, dnttList]);

  // ── Biến thể KẾ TOÁN ────────────────────────────────────────────────────────
  const dnttTotal = useMemo(
    () => dnttList.reduce((s, d) => s + (Number(d.so_tien) || 0), 0),
    [dnttList],
  );
  const ktCards: StatCard[] = useMemo(() => ([
    { key: "ktduyet", label: t("Chờ tôi duyệt"), count: dnttList.length, unit: "ĐNTT",
      icon: CreditCard, tile: "bg-orange-500", to: "/de-nghi-thanh-toan" },
    { key: "ktchi", label: t("Đã duyệt — cần chi"), count: kt?.choChi ?? 0, unit: "ĐNTT",
      icon: Wallet, tile: "bg-blue-500", to: "/de-nghi-thanh-toan" },
    { key: "kthan", label: t("Đến hạn / quá hạn TT"), count: kt?.dueSoon ?? 0, unit: "ĐNTT",
      icon: AlertTriangle, tile: "bg-rose-500", to: "/de-nghi-thanh-toan" },
    { key: "ktcongno", label: t("Công nợ còn dư"), count: kt?.congNoCount ?? 0, unit: t("khoản"),
      icon: Receipt, tile: "bg-emerald-500", to: "/cong-no" },
  ]), [dnttList, kt]);

  const ktAttention = useMemo(() => {
    const out: { tone: string; title: string; sub: string; to: string }[] = [];
    if (dnttList.length > 0)
      out.push({ tone: "bg-orange-500", title: `${dnttList.length} ${t("ĐNTT chờ bạn duyệt")}`,
        sub: `${t("Tổng")} ${fmtVND(dnttTotal)}`, to: "/de-nghi-thanh-toan" });
    if ((kt?.choChi ?? 0) > 0)
      out.push({ tone: "bg-blue-500", title: `${kt!.choChi} ${t("ĐNTT cần thanh toán")}`,
        sub: t("Đã duyệt, chưa chi"), to: "/de-nghi-thanh-toan" });
    if ((kt?.overdue ?? 0) > 0)
      out.push({ tone: "bg-red-500", title: `${kt!.overdue} ${t("ĐNTT quá hạn thanh toán")}`,
        sub: t("Cần chi gấp"), to: "/de-nghi-thanh-toan" });
    if ((kt?.chuaCoHoaDon ?? 0) > 0)
      out.push({ tone: "bg-amber-600", title: `${kt!.chuaCoHoaDon} ${t("ĐNTT chưa có hóa đơn")}`,
        sub: t("Cần thu hóa đơn"), to: "/hoa-don-unc" });
    if ((kt?.hoaDonThieu ?? 0) > 0)
      out.push({ tone: "bg-amber-500", title: `${kt!.hoaDonThieu} ${t("khoản đã chi thiếu hóa đơn/UNC")}`,
        sub: t("Bổ sung chứng từ"), to: "/hoa-don-unc" });
    if ((kt?.congNoCount ?? 0) > 0)
      out.push({ tone: "bg-emerald-600", title: `${kt!.congNoCount} ${t("công nợ còn dư")}`,
        sub: fmtVND(kt!.congNoSum), to: "/cong-no" });
    if (unread > 0)
      out.push({ tone: "bg-violet-500", title: `${unread} ${t("thông báo chưa đọc")}`,
        sub: t("Xem trong Việc của tôi"), to: "/my-job" });
    return out;
  }, [dnttList, dnttTotal, kt, unread]);

  const ktTips = useMemo(() => {
    const arr: string[] = [];
    if ((kt?.overdue ?? 0) > 0) arr.push(`${t("Ưu tiên chi")} ${kt!.overdue} ${t("ĐNTT đã quá hạn thanh toán.")}`);
    if (dnttList.length > 0) arr.push(`${t("Duyệt")} ${dnttList.length} ${t("ĐNTT đang chờ để kế toán kịp chi.")}`);
    if ((kt?.dueSoon ?? 0) > 0) arr.push(`${t("Có")} ${kt!.dueSoon} ${t("khoản đến hạn trong 3 ngày — chuẩn bị chi.")}`);
    if ((kt?.chuaCoHoaDon ?? 0) > 0) arr.push(`${t("Còn")} ${kt!.chuaCoHoaDon} ${t("ĐNTT chưa có hóa đơn — thu chứng từ.")}`);
    if ((kt?.hoaDonThieu ?? 0) > 0) arr.push(`${t("Thu thập hóa đơn/UNC cho")} ${kt!.hoaDonThieu} ${t("khoản đã chi.")}`);
    if ((kt?.congNoCount ?? 0) > 0) arr.push(`${t("Cấn trừ/hoàn")} ${kt!.congNoCount} ${t("công nợ còn dư.")}`);
    if (arr.length === 0) arr.push(t("Sổ sách gọn gàng — không có khoản nào gấp! 🎯"));
    return arr.slice(0, 4);
  }, [kt, dnttList]);

  const cards = isKeToan ? ktCards : statCards;
  const attn = isKeToan ? ktAttention : attention;
  const tipList = isKeToan ? ktTips : tips;

  if (!uid) return null;

  const persist = () => { if (dontShow && dayKey) localStorage.setItem(dayKey, "1"); };
  const close = () => { persist(); setOpen(false); };
  const go = (to: string) => { persist(); setOpen(false); navigate(to); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-br from-sky-100 via-blue-50 to-white px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-5 shrink-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <span>☀️</span> {greet()}, {firstName}! <Rocket className="h-5 w-5 text-primary" />
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t("Chúc bạn một ngày làm việc hiệu quả và nhiều booking nhé! 🚀")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="bg-white rounded-xl px-3 py-2 shadow-sm text-xs">
                <div className="flex items-center gap-1.5 font-medium">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  <span className="capitalize">{format(new Date(), "EEEE, dd/MM/yyyy", { locale: vi })}</span>
                </div>
                <div className="text-muted-foreground mt-0.5">
                  {isKeToan ? `${dnttList.length} ${t("ĐNTT chờ duyệt")}` : `${m.total} ${t("việc hôm nay")}`}
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 shadow-sm">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold">
                  {firstName.slice(0, 1).toUpperCase()}
                </div>
                <div className="text-xs leading-tight">
                  <p className="font-semibold">{hoTen}</p>
                  <p className="text-muted-foreground">
                    {BO_PHAN_LABEL[user?.bo_phan ?? ""] ?? (user?.role ?? "—")}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="text-sm mt-4">
            {isKeToan ? (
              <>
                {t("Tổng cần chi tuần này:")}{" "}
                <span className="text-xl font-bold text-blue-600">{fmtVND(kt?.totalWeek ?? 0)}</span>
                {dnttList.length > 0 && (
                  <span className="text-muted-foreground"> · {dnttList.length} {t("ĐNTT chờ bạn duyệt")}</span>
                )}
              </>
            ) : (
              <>
                {t("Hôm nay bạn có")}{" "}
                <span className="text-xl font-bold text-blue-600">{m.total}</span>{" "}
                {t("công việc cần xử lý")}
              </>
            )}
          </p>
        </div>

        {/* Body */}
        <div className="px-4 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-5 flex-1 min-h-0 overflow-y-auto">
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cards.map((s) => (
              <button
                key={s.key}
                onClick={() => go(s.to)}
                className="flex items-center gap-3 rounded-xl border bg-card px-4 py-4 text-left hover:shadow-md transition-shadow"
              >
                <div className={cn("h-12 w-12 rounded-xl grid place-items-center text-white shrink-0", s.tile)}>
                  <s.icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground leading-snug">{s.label}</p>
                  <p className="text-xl font-bold leading-tight mt-1">
                    {s.count}{" "}
                    <span className="text-xs font-normal text-muted-foreground">{s.unit}</span>
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Việc cần chú ý */}
            <div className="rounded-xl border p-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> {t("Việc cần chú ý")}
              </h3>
              {attn.length === 0 ? (
                <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-6 text-center">
                  <p className="text-sm text-green-700 font-medium">{t("Không có việc gấp 🎉")}</p>
                  <p className="text-xs text-green-600 mt-0.5">{t("Mọi thứ trong tầm kiểm soát")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attn.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => go(a.to)}
                      className="w-full flex items-center gap-3 rounded-lg bg-muted/40 hover:bg-muted/70 px-3 py-2 text-left transition-colors"
                    >
                      <span className={cn("h-6 w-6 rounded-full grid place-items-center text-white text-[11px] font-bold shrink-0", a.tone)}>
                        !
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">{a.title}</p>
                        <p className="text-xs text-muted-foreground leading-snug">{a.sub}</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Gợi ý cho bạn */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                <Bot className="h-4 w-4 text-blue-500" /> {t("Gợi ý cho bạn")}
              </h3>
              <ul className="space-y-2">
                {tipList.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5 sm:px-6 sm:py-3 flex items-center justify-between gap-2 flex-wrap shrink-0 bg-background">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(!!v)} />
            {t("Không hiển thị lại hôm nay")}
          </label>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="ghost" className="text-xs" onClick={close}>
              {t("Đóng")}
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => go("/my-job")}>
              {t("Xem toàn bộ task")}
            </Button>
            <Button size="sm" className="text-xs" onClick={() => go("/my-job")}>
              {t("Bắt đầu ngày mới 🚀")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
