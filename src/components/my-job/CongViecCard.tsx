import { format, isBefore, parseISO } from "date-fns";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CongViecRow } from "@/hooks/use-cong-viec";
import { t, useTranslate } from "@/lib/i18n";

// Labels kept as keys; t() applied at render to pick up language switch.
const UU_TIEN_CFG: Record<string, { labelKey: string; cls: string }> = {
  khan_cap:    { labelKey: "🔴 Khẩn cấp",   cls: "bg-red-100 text-red-700" },
  cao:         { labelKey: "🟠 Cao",         cls: "bg-orange-100 text-orange-700" },
  binh_thuong: { labelKey: "🟡 Bình thường", cls: "bg-yellow-100 text-yellow-700" },
  thap:        { labelKey: "🟢 Thấp",        cls: "bg-green-100 text-green-700" },
};

const TRANG_THAI_CFG: Record<string, { labelKey: string; cls: string }> = {
  cho_nhan:   { labelKey: "Chờ nhận",   cls: "bg-blue-100 text-blue-700" },
  dang_lam:   { labelKey: "Đang làm",   cls: "bg-amber-100 text-amber-700" },
  hoan_thanh: { labelKey: "Hoàn thành", cls: "bg-green-100 text-green-700" },
  tu_choi:    { labelKey: "Từ chối",    cls: "bg-red-100 text-red-700" },
};

const LOAI_LABEL: Record<string, string> = {
  booking_ks: "Booking KS",
  booking_nh: "Booking NH",
  visa:       "Visa",
  thanh_toan: "Thanh toán",
  lien_he:    "Liên hệ",
  khac:       "Khác",
  huy_doan:   "Huỷ đoàn",
  pv_phancong: "Phân công",
};

interface Props {
  task: CongViecRow;
  viewMode: "received" | "sent";
  onClick: () => void;
}

export default function CongViecCard({ task, viewMode, onClick }: Props) {
  useTranslate();
  const uu = UU_TIEN_CFG[task.do_uu_tien] ?? { labelKey: task.do_uu_tien, cls: "bg-muted text-muted-foreground" };
  const tt = TRANG_THAI_CFG[task.trang_thai] ?? { labelKey: task.trang_thai, cls: "bg-muted text-muted-foreground" };
  const isOverdue =
    task.han_xu_ly &&
    task.trang_thai !== "hoan_thanh" &&
    task.trang_thai !== "tu_choi" &&
    isBefore(parseISO(task.han_xu_ly), new Date());

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card hover:bg-muted/30 transition-colors px-4 py-3 space-y-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", uu.cls)}>{t(uu.labelKey)}</span>
          <span className="text-[10px] text-muted-foreground">{t(LOAI_LABEL[task.loai_viec] ?? task.loai_viec)}</span>
        </div>
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", tt.cls)}>{t(tt.labelKey)}</span>
      </div>

      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{task.tieu_de}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground overflow-hidden">
          {viewMode === "received" ? (
            <span>{t("Giao")}: <span className="text-foreground">{task.ten_nguoi_giao ?? "—"}</span></span>
          ) : (
            <span>{t("Nhận")}: <span className="text-foreground">{task.ten_nguoi_nhan ?? "—"}</span></span>
          )}
          {task.ten_doan && (
            <span className="truncate max-w-[140px]">📋 {task.ten_doan}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {task.comment_count > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <MessageSquare className="h-3 w-3" />
              {task.comment_count}
            </span>
          )}
          {task.han_xu_ly && (
            <span className={cn("text-[10px]", isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground")}>
              {format(parseISO(task.han_xu_ly), "dd/MM/yy")}
              {isOverdue && " ⚠"}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
