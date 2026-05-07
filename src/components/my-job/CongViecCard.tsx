import { format, isBefore, parseISO } from "date-fns";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CongViecRow } from "@/hooks/use-cong-viec";

const UU_TIEN_CFG: Record<string, { label: string; cls: string }> = {
  khan_cap:    { label: "🔴 Khẩn cấp",   cls: "bg-red-100 text-red-700" },
  cao:         { label: "🟠 Cao",         cls: "bg-orange-100 text-orange-700" },
  binh_thuong: { label: "🟡 Bình thường", cls: "bg-yellow-100 text-yellow-700" },
  thap:        { label: "🟢 Thấp",        cls: "bg-green-100 text-green-700" },
};

const TRANG_THAI_CFG: Record<string, { label: string; cls: string }> = {
  cho_nhan:   { label: "Chờ nhận",   cls: "bg-blue-100 text-blue-700" },
  dang_lam:   { label: "Đang làm",   cls: "bg-amber-100 text-amber-700" },
  hoan_thanh: { label: "Hoàn thành", cls: "bg-green-100 text-green-700" },
  tu_choi:    { label: "Từ chối",    cls: "bg-red-100 text-red-700" },
};

const LOAI_LABEL: Record<string, string> = {
  booking_ks: "Booking KS",
  booking_nh: "Booking NH",
  visa:       "Visa",
  thanh_toan: "Thanh toán",
  lien_he:    "Liên hệ",
  khac:       "Khác",
};

interface Props {
  task: CongViecRow;
  viewMode: "received" | "sent";
  onClick: () => void;
}

export default function CongViecCard({ task, viewMode, onClick }: Props) {
  const uu = UU_TIEN_CFG[task.do_uu_tien] ?? { label: task.do_uu_tien, cls: "bg-muted text-muted-foreground" };
  const tt = TRANG_THAI_CFG[task.trang_thai] ?? { label: task.trang_thai, cls: "bg-muted text-muted-foreground" };
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
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", uu.cls)}>{uu.label}</span>
          <span className="text-[10px] text-muted-foreground">{LOAI_LABEL[task.loai_viec] ?? task.loai_viec}</span>
        </div>
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0", tt.cls)}>{tt.label}</span>
      </div>

      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{task.tieu_de}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground overflow-hidden">
          {viewMode === "received" ? (
            <span>Giao: <span className="text-foreground">{task.ten_nguoi_giao ?? "—"}</span></span>
          ) : (
            <span>Nhận: <span className="text-foreground">{task.ten_nguoi_nhan ?? "—"}</span></span>
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
