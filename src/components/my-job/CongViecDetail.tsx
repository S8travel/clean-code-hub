import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useCongViecComments,
  useUpdateCongViecStatus,
  useCreateCongViecComment,
  type CongViecRow,
} from "@/hooks/use-cong-viec";

const UU_TIEN_LABEL: Record<string, string> = {
  khan_cap: "🔴 Khẩn cấp", cao: "🟠 Cao",
  binh_thuong: "🟡 Bình thường", thap: "🟢 Thấp",
};

const LOAI_LABEL: Record<string, string> = {
  booking_ks: "Booking KS", booking_nh: "Booking NH",
  visa: "Visa", thanh_toan: "Thanh toán",
  lien_he: "Liên hệ / Xác nhận", khac: "Khác",
  pv_ks: "Phụ trách Khách sạn", pv_nh_dv: "Phụ trách Nhà hàng & DV",
  pv_xe: "Phụ trách Xe", pv_visa: "Phụ trách Visa",
  pv_ve_mb: "Phụ trách Vé máy bay", pv_phancong: "Phân công người phụ trách",
};
const PV_TT_LABEL: Record<string, string> = {
  cho_nhan: "Chờ xác nhận", dang_lam: "Đã nhận",
  hoan_thanh: "Đã nhận", tu_choi: "Từ chối",
};

const TRANG_THAI_CFG: Record<string, { label: string; cls: string }> = {
  cho_nhan:   { label: "Chờ nhận",   cls: "text-blue-600" },
  dang_lam:   { label: "Đang làm",   cls: "text-amber-600" },
  hoan_thanh: { label: "Hoàn thành", cls: "text-green-600" },
  tu_choi:    { label: "Từ chối",    cls: "text-red-600" },
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-medium leading-snug">{value}</p>
    </div>
  );
}

interface Props {
  task: CongViecRow | null;
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

export default function CongViecDetail({ task, open, onClose, userId, userName }: Props) {
  const { data: comments = [] } = useCongViecComments(task?.id ?? null);
  const updateStatus = useUpdateCongViecStatus();
  const createComment = useCreateCongViecComment();

  const [ghiChu, setGhiChu] = useState("");
  const [commentText, setCommentText] = useState("");
  const [actionMode, setActionMode] = useState<"hoan_thanh" | "tu_choi" | null>(null);

  const handleClose = () => {
    setActionMode(null);
    setGhiChu("");
    setCommentText("");
    onClose();
  };

  if (!task) return null;

  const isRecipient = task.nguoi_nhan === userId;
  const isAssigner = task.nguoi_giao === userId;
  const isPv = task.loai_viec.startsWith("pv_");
  const ttCfg = TRANG_THAI_CFG[task.trang_thai] ?? { label: task.trang_thai, cls: "text-muted-foreground" };
  const ttLabel = isPv ? (PV_TT_LABEL[task.trang_thai] ?? ttCfg.label) : ttCfg.label;

  const handleUpdateStatus = async (newStatus: "dang_lam" | "hoan_thanh" | "tu_choi") => {
    const needsNote = newStatus === "hoan_thanh" || newStatus === "tu_choi";
    if (needsNote && !ghiChu.trim()) {
      toast.error("Vui lòng nhập ghi chú");
      return;
    }
    try {
      await updateStatus.mutateAsync({
        id: task.id,
        trang_thai: newStatus,
        ghi_chu_ket_qua: ghiChu.trim() || undefined,
        userId,
        nguoi_giao: task.nguoi_giao,
        nguoi_nhan: task.nguoi_nhan,
        tieu_de: task.tieu_de,
        ten_nguoi_nhan: task.ten_nguoi_nhan ?? userName,
      });
      toast.success("Đã cập nhật trạng thái");
      setGhiChu("");
      setActionMode(null);
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message ?? ""));
    }
  };

  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    const notifyId = userId === task.nguoi_giao ? task.nguoi_nhan : task.nguoi_giao;
    try {
      await createComment.mutateAsync({
        cong_viec_id: task.id,
        user_id: userId,
        noi_dung: commentText.trim(),
        ho_ten: userName,
        notify_user_id: notifyId,
        tieu_de_task: task.tieu_de,
      });
      setCommentText("");
    } catch (err: any) {
      toast.error("Lỗi: " + (err?.message ?? ""));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        {/* Header */}
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <div className="flex items-start gap-2 pr-6">
            <SheetTitle className="text-sm font-semibold leading-snug flex-1">{task.tieu_de}</SheetTitle>
            <span className={cn("text-xs font-semibold shrink-0 mt-0.5", ttCfg.cls)}>{ttLabel}</span>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-xs">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <InfoRow label="Loại việc" value={LOAI_LABEL[task.loai_viec] ?? task.loai_viec} />
            <InfoRow label="Độ ưu tiên" value={UU_TIEN_LABEL[task.do_uu_tien] ?? task.do_uu_tien} />
            <InfoRow label="Người giao" value={task.ten_nguoi_giao ?? "—"} />
            <InfoRow label="Người nhận" value={task.ten_nguoi_nhan ?? "—"} />
            {task.han_xu_ly && (
              <InfoRow label="Hạn xử lý" value={format(parseISO(task.han_xu_ly), "dd/MM/yyyy")} />
            )}
            {task.ten_doan && <InfoRow label="Đoàn" value={task.ten_doan} />}
          </div>

          {/* Description */}
          {task.mo_ta && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium">Mô tả</p>
              <p className="whitespace-pre-wrap leading-relaxed">{task.mo_ta}</p>
            </div>
          )}

          {/* Result notes */}
          {task.ghi_chu_ket_qua && (
            <div className="rounded-md bg-muted/40 px-3 py-2 space-y-1">
              <p className="text-[10px] text-muted-foreground font-medium">Kết quả / Ghi chú</p>
              <p className="whitespace-pre-wrap leading-relaxed">{task.ghi_chu_ket_qua}</p>
            </div>
          )}

          {/* Phân việc đoàn (pv_*) — chỉ Xác nhận / Không nhận + lý do */}
          {isPv && isRecipient && task.trang_thai === "cho_nhan" && (
            <div className="space-y-2">
              {!actionMode && (
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs flex-1"
                    disabled={updateStatus.isPending}
                    onClick={() => handleUpdateStatus("dang_lam")}>
                    {updateStatus.isPending ? "..." : "Xác nhận"}
                  </Button>
                  <Button size="sm" variant="outline"
                    className="text-xs flex-1 text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => setActionMode("tu_choi")}>
                    Không nhận
                  </Button>
                </div>
              )}
              {actionMode === "tu_choi" && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="font-medium text-xs">Lý do không nhận *</p>
                  <Textarea
                    className="text-xs min-h-[72px]"
                    placeholder="Vì sao bạn không nhận việc này..."
                    value={ghiChu}
                    onChange={(e) => setGhiChu(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="text-xs flex-1 bg-red-600 hover:bg-red-700"
                      disabled={updateStatus.isPending}
                      onClick={() => handleUpdateStatus("tu_choi")}>
                      {updateStatus.isPending ? "Đang lưu..." : "Xác nhận không nhận"}
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs"
                      onClick={() => { setActionMode(null); setGhiChu(""); }}>
                      Hủy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recipient actions */}
          {!isPv && isRecipient && task.trang_thai === "cho_nhan" && (
            <Button
              size="sm"
              className="text-xs w-full"
              onClick={() => handleUpdateStatus("dang_lam")}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? "Đang xử lý..." : "Nhận việc"}
            </Button>
          )}

          {!isPv && isRecipient && task.trang_thai === "dang_lam" && (
            <div className="space-y-2">
              {!actionMode && (
                <div className="flex gap-2">
                  <Button size="sm" className="text-xs flex-1" onClick={() => setActionMode("hoan_thanh")}>
                    Hoàn thành
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="text-xs flex-1 text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => setActionMode("tu_choi")}
                  >
                    Không thể làm
                  </Button>
                </div>
              )}
              {actionMode && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="font-medium text-xs">
                    {actionMode === "hoan_thanh" ? "Ghi chú kết quả *" : "Lý do từ chối *"}
                  </p>
                  <Textarea
                    className="text-xs min-h-[72px]"
                    placeholder={actionMode === "hoan_thanh" ? "Mô tả kết quả đã hoàn thành..." : "Lý do không thể thực hiện..."}
                    value={ghiChu}
                    onChange={(e) => setGhiChu(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className={cn("text-xs flex-1", actionMode === "tu_choi" && "bg-red-600 hover:bg-red-700")}
                      onClick={() => handleUpdateStatus(actionMode)}
                      disabled={updateStatus.isPending}
                    >
                      {updateStatus.isPending ? "Đang lưu..." : actionMode === "hoan_thanh" ? "Xác nhận hoàn thành" : "Xác nhận từ chối"}
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs"
                      onClick={() => { setActionMode(null); setGhiChu(""); }}>
                      Hủy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Assigner force-close */}
          {!isPv && isAssigner && task.trang_thai !== "hoan_thanh" && task.trang_thai !== "tu_choi" && (
            <div className="space-y-2">
              {!actionMode && (
                <Button
                  size="sm" variant="outline"
                  className="text-xs w-full text-muted-foreground"
                  onClick={() => setActionMode("hoan_thanh")}
                >
                  Đóng task (force hoàn thành)
                </Button>
              )}
              {actionMode && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="font-medium text-xs">Ghi chú (tùy chọn)</p>
                  <Textarea
                    className="text-xs min-h-[60px]"
                    value={ghiChu}
                    onChange={(e) => setGhiChu(e.target.value)}
                    placeholder="Lý do đóng sớm..."
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="text-xs flex-1"
                      onClick={() => handleUpdateStatus("hoan_thanh")} disabled={updateStatus.isPending}>
                      {updateStatus.isPending ? "Đang lưu..." : "Xác nhận đóng"}
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs"
                      onClick={() => { setActionMode(null); setGhiChu(""); }}>
                      Hủy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comment thread */}
          <div className="space-y-2 border-t pt-3">
            <p className="text-[10px] text-muted-foreground font-medium">
              Bình luận ({comments.length})
            </p>
            {comments.length === 0 && (
              <p className="text-[11px] text-muted-foreground/60">Chưa có bình luận</p>
            )}
            {comments.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "rounded-md px-3 py-2 space-y-0.5",
                  c.user_id === userId ? "bg-primary/10 ml-6" : "bg-muted/40 mr-6",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold">{c.ho_ten ?? "—"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(c.created_at), "dd/MM HH:mm", { locale: vi })}
                  </span>
                </div>
                <p className="text-xs whitespace-pre-wrap leading-snug">{c.noi_dung}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Comment input */}
        <div className="border-t px-4 py-3 flex gap-2 items-end">
          <Textarea
            className="text-xs min-h-[36px] max-h-[96px] resize-none flex-1"
            placeholder="Nhập bình luận... (Enter để gửi)"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendComment();
              }
            }}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSendComment}
            disabled={createComment.isPending || !commentText.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
