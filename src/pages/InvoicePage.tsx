import { useEffect } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useRoleAtLeast } from "@/hooks/use-permissions";
import { AccessDenied } from "@/components/PermissionGate";
import { useAuth } from "@/hooks/use-auth";
import { useDoanLogGia, useToggleResolved } from "@/hooks/use-doan-log";
import { useMarkThongBaoRead } from "@/hooks/use-thong-bao";
import { cn } from "@/lib/utils";

function fmtDatetime(d: string) {
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: vi }); } catch { return d; }
}

export default function InvoicePage() {
  const canView = useRoleAtLeast("giam_doc");
  const { user } = useAuth();
  const { data: logs = [], isLoading } = useDoanLogGia();
  const toggleMut = useToggleResolved();
  const markRead = useMarkThongBaoRead();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.user_id) {
      markRead.mutate({ userId: user.user_id, loai: "gia" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.user_id]);

  if (!canView) return <AccessDenied />;

  const handleToggle = async (id: number, doan_id: number, is_resolved: boolean) => {
    try {
      await toggleMut.mutateAsync({ id, doan_id, loai: "gia", is_resolved: !is_resolved });
    } catch {
      toast.error("Lỗi cập nhật");
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-amber-600" />
        <h1 className="text-lg font-semibold">Invoice — Phát sinh giá</h1>
        <span className="text-sm text-muted-foreground">({logs.filter((l) => !l.is_resolved).length} chưa xử lý)</span>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {!isLoading && logs.length === 0 && (
        <p className="text-sm text-muted-foreground italic">Chưa có phát sinh nào.</p>
      )}

      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className={cn(
              "border rounded-lg p-3 flex gap-3 items-start bg-white hover:bg-muted/20 transition-colors",
              log.is_resolved && "opacity-50"
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <button
                  onClick={() => navigate(`/doan/${log.doan_id}?tab=log`)}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  {log.doan_ten ?? `Đoàn #${log.doan_id}`}
                </button>
                {log.is_resolved && (
                  <Badge variant="outline" className="text-[11px] text-green-700 border-green-300">Đã xử lý</Badge>
                )}
              </div>
              <p className="text-sm font-medium">{log.tieu_de}</p>
              {log.so_tien != null && (
                <p className="text-sm font-semibold text-amber-700">{log.so_tien.toLocaleString("vi-VN")} VND</p>
              )}
              {log.noi_dung && <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{log.noi_dung}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                {log.created_by_ten ?? "—"} · {fmtDatetime(log.created_at)}
              </p>
            </div>
            <button
              onClick={() => handleToggle(log.id, log.doan_id, log.is_resolved)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              title={log.is_resolved ? "Đánh dấu chưa xử lý" : "Đánh dấu đã xử lý"}
            >
              {log.is_resolved
                ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                : <Circle className="h-4 w-4" />
              }
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
