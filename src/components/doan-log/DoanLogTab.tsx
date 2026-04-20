import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Plus, CheckCircle2, Circle, FileText, AlertTriangle, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useDoanLogList, useCreateDoanLog, useToggleResolved } from "@/hooks/use-doan-log";
import { useAuth } from "@/hooks/use-auth";
import { useDoanList } from "@/hooks/use-doan";
import { cn } from "@/lib/utils";

interface Props {
  doanId: number;
}

const LOAI_CONFIG = {
  gia:     { label: "Phát sinh giá",   color: "bg-amber-100 text-amber-800 border-amber-200",  icon: FileText,      iconCls: "text-amber-600" },
  su_co:   { label: "Phát sinh sự cố", color: "bg-red-100 text-red-800 border-red-200",        icon: AlertTriangle, iconCls: "text-red-600"   },
  ghi_chu: { label: "Ghi chú",          color: "bg-blue-100 text-blue-800 border-blue-200",     icon: StickyNote,    iconCls: "text-blue-600"  },
};

export default function DoanLogTab({ doanId }: Props) {
  const { user } = useAuth();
  const { data: logs = [], isLoading } = useDoanLogList(doanId);
  const { data: doanList = [] } = useDoanList();
  const createMut = useCreateDoanLog();
  const toggleMut = useToggleResolved();

  const doan = (doanList as any[]).find((d) => d.id === doanId);

  const [showForm, setShowForm] = useState(false);
  const [loai, setLoai] = useState<"gia" | "su_co" | "ghi_chu">("gia");
  const [tieuDe, setTieuDe] = useState("");
  const [noiDung, setNoiDung] = useState("");
  const [soTien, setSoTien] = useState("");

  const resetForm = () => {
    setLoai("gia");
    setTieuDe("");
    setNoiDung("");
    setSoTien("");
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!tieuDe.trim()) {
      toast.warning("Vui lòng nhập tiêu đề");
      return;
    }
    try {
      await createMut.mutateAsync({
        doan_id: doanId,
        doan_ten: doan?.ten_doan ?? undefined,
        loai,
        tieu_de: tieuDe.trim(),
        noi_dung: noiDung.trim() || undefined,
        so_tien: loai === "gia" && soTien ? Number(soTien) : null,
        created_by: user?.user_id ?? undefined,
        created_by_ten: user?.ho_ten ?? undefined,
      });
      toast.success("Đã thêm log");
      resetForm();
    } catch {
      toast.error("Lỗi khi thêm log");
    }
  };

  const handleToggle = async (id: number, currentLoai: string, current: boolean) => {
    try {
      await toggleMut.mutateAsync({ id, doan_id: doanId, loai: currentLoai, is_resolved: !current });
    } catch {
      toast.error("Lỗi cập nhật");
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Nhật ký phát sinh</h3>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Thêm
          </Button>
        )}
      </div>

      {showForm && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div>
            <Label className="text-xs">Loại phát sinh</Label>
            <Select value={loai} onValueChange={(v) => setLoai(v as any)}>
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gia">Phát sinh giá</SelectItem>
                <SelectItem value="su_co">Phát sinh sự cố</SelectItem>
                <SelectItem value="ghi_chu">Ghi chú</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tiêu đề *</Label>
            <Input
              value={tieuDe}
              onChange={(e) => setTieuDe(e.target.value)}
              className="h-8 text-sm mt-1"
              placeholder="Tóm tắt phát sinh..."
            />
          </div>
          {loai === "gia" && (
            <div>
              <Label className="text-xs">Số tiền (VND)</Label>
              <Input
                type="number"
                value={soTien}
                onChange={(e) => setSoTien(e.target.value)}
                className="h-8 text-sm mt-1"
                placeholder="0"
              />
            </div>
          )}
          <div>
            <Label className="text-xs">Nội dung chi tiết</Label>
            <Textarea
              value={noiDung}
              onChange={(e) => setNoiDung(e.target.value)}
              className="text-sm mt-1 min-h-[80px]"
              placeholder="Mô tả chi tiết..."
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={resetForm}>Hủy</Button>
            <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending}>
              Lưu
            </Button>
          </div>
        </div>
      )}

      <Separator />

      {isLoading && <p className="text-sm text-muted-foreground">Đang tải...</p>}
      {!isLoading && logs.length === 0 && (
        <p className="text-sm text-muted-foreground italic">Chưa có phát sinh nào.</p>
      )}

      <div className="space-y-2">
        {logs.map((log) => {
          const cfg = LOAI_CONFIG[log.loai];
          const Icon = cfg.icon;
          return (
            <div
              key={log.id}
              className={cn(
                "border rounded-lg p-3 flex gap-3 items-start",
                log.is_resolved && "opacity-50"
              )}
            >
              <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", cfg.iconCls)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded border", cfg.color)}>
                    {cfg.label}
                  </span>
                  {log.is_resolved && (
                    <Badge variant="outline" className="text-[11px] text-green-700 border-green-300">Đã xử lý</Badge>
                  )}
                </div>
                <p className="text-sm font-medium mt-1">{log.tieu_de}</p>
                {log.so_tien != null && (
                  <p className="text-sm text-amber-700 font-medium">{log.so_tien.toLocaleString("vi-VN")} VND</p>
                )}
                {log.noi_dung && <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{log.noi_dung}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  {log.created_by_ten ?? "—"} · {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                </p>
              </div>
              <button
                onClick={() => handleToggle(log.id, log.loai, log.is_resolved)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title={log.is_resolved ? "Đánh dấu chưa xử lý" : "Đánh dấu đã xử lý"}
              >
                {log.is_resolved
                  ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                  : <Circle className="h-4 w-4" />
                }
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
