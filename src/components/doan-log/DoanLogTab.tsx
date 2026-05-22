import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Plus, CheckCircle2, Circle, FileText, AlertTriangle, StickyNote, History, Edit2, Trash2, CheckCheck, XCircle, CreditCard, PlusCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useDoanLogList, useCreateDoanLog, useToggleResolved, useDeleteDoanLog, useUpdateDoanLog } from "@/hooks/use-doan-log";
import { useDoanActivityLog, type ActivityAction } from "@/hooks/use-activity-log";
import { useAuth } from "@/hooks/use-auth";
import { useDoanList } from "@/hooks/use-doan";
import { cn } from "@/lib/utils";

const ACTION_CONFIG: Record<ActivityAction, { label: string; icon: React.ElementType; cls: string }> = {
  tao:       { label: "Tạo mới",   icon: PlusCircle,  cls: "text-green-600" },
  sua:       { label: "Cập nhật",  icon: Edit2,       cls: "text-blue-600"  },
  xoa:       { label: "Xóa",       icon: Trash2,      cls: "text-red-600"   },
  duyet:     { label: "Duyệt",     icon: CheckCheck,  cls: "text-emerald-600" },
  tu_choi:   { label: "Từ chối",   icon: XCircle,     cls: "text-orange-600" },
  thanh_toan:{ label: "Thanh toán",icon: CreditCard,  cls: "text-purple-600" },
};

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
  const { data: activityLogs = [], isLoading: isLoadingActivity } = useDoanActivityLog(doanId);
  const { data: doanList = [] } = useDoanList();
  const createMut = useCreateDoanLog();
  const toggleMut = useToggleResolved();
  const deleteMut = useDeleteDoanLog();
  const updateMut = useUpdateDoanLog();

  const doan = doanList.find((d) => d.id === doanId);

  const [showForm, setShowForm] = useState(false);
  const [loai, setLoai] = useState<"gia" | "su_co" | "ghi_chu">("gia");
  const [tieuDe, setTieuDe] = useState("");
  const [noiDung, setNoiDung] = useState("");

  // edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editTieuDe, setEditTieuDe] = useState("");
  const [editNoiDung, setEditNoiDung] = useState("");

  const resetForm = () => {
    setLoai("gia");
    setTieuDe("");
    setNoiDung("");
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
        so_tien: null,
        created_by: user?.user_id ?? undefined,
        created_by_ten: user?.ho_ten ?? undefined,
      });
      toast.success("Đã thêm log");
      resetForm();
    } catch {
      toast.error("Lỗi khi thêm log");
    }
  };

  const handleConfirm = async (id: number, currentLoai: string) => {
    try {
      await toggleMut.mutateAsync({
        id,
        doan_id: doanId,
        loai: currentLoai,
        is_resolved: true,
        user_id: user?.user_id ?? null,
        user_ten: user?.ho_ten ?? null,
      });
    } catch {
      toast.error("Lỗi cập nhật");
    }
  };

  const handleDelete = async (id: number, currentLoai: string) => {
    if (!window.confirm("Xóa phát sinh này?")) return;
    try {
      await deleteMut.mutateAsync({ id, doan_id: doanId, loai: currentLoai });
      toast.success("Đã xóa");
    } catch {
      toast.error("Lỗi khi xóa");
    }
  };

  const startEdit = (id: number, tieu_de: string, noi_dung: string | null) => {
    setEditId(id);
    setEditTieuDe(tieu_de);
    setEditNoiDung(noi_dung ?? "");
  };

  const handleUpdate = async (id: number, currentLoai: string) => {
    if (!editTieuDe.trim()) {
      toast.warning("Vui lòng nhập tiêu đề");
      return;
    }
    try {
      await updateMut.mutateAsync({
        id,
        doan_id: doanId,
        loai: currentLoai,
        tieu_de: editTieuDe.trim(),
        noi_dung: editNoiDung.trim() || null,
      });
      toast.success("Đã cập nhật");
      setEditId(null);
    } catch {
      toast.error("Lỗi khi cập nhật");
    }
  };

  return (
    <div className="max-w-3xl">
      <Tabs defaultValue="phat_sinh">
        <TabsList className="mb-4">
          <TabsTrigger value="phat_sinh">
            Nhật ký phát sinh
            {logs.length > 0 && <span className="ml-1.5 text-[10px] bg-amber-500 text-white rounded-full px-1.5 py-0.5">{logs.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="lich_su">
            <History className="h-3.5 w-3.5 mr-1" />
            Lịch sử thay đổi
            {activityLogs.length > 0 && <span className="ml-1.5 text-[10px] bg-slate-500 text-white rounded-full px-1.5 py-0.5">{activityLogs.length}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="phat_sinh" className="space-y-4">
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
                <Select value={loai} onValueChange={(v) => setLoai(v as "gia" | "su_co" | "ghi_chu")}>
                  <SelectTrigger className="h-8 text-sm mt-1">
                    <span>{loai === "gia" ? "Phát sinh giá" : loai === "su_co" ? "Phát sinh sự cố" : "Ghi chú"}</span>
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
              const isEditing = editId === log.id;
              return (
                <div
                  key={log.id}
                  className="border rounded-lg p-3 flex gap-3 items-start"
                >
                  <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", cfg.iconCls)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded border", cfg.color)}>
                        {cfg.label}
                      </span>
                      {log.is_resolved && (
                        <Badge variant="outline" className="text-[11px] text-green-700 border-green-300 gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Xác nhận bởi {log.resolved_by_ten ?? "—"}
                          {log.resolved_at && ` · ${format(new Date(log.resolved_at), "dd/MM HH:mm", { locale: vi })}`}
                        </Badge>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <Input
                          value={editTieuDe}
                          onChange={(e) => setEditTieuDe(e.target.value)}
                          className="h-8 text-sm"
                          placeholder="Tiêu đề..."
                        />
                        <Textarea
                          value={editNoiDung}
                          onChange={(e) => setEditNoiDung(e.target.value)}
                          className="text-sm min-h-[60px]"
                          placeholder="Nội dung chi tiết..."
                        />
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Hủy</Button>
                          <Button size="sm" onClick={() => handleUpdate(log.id, log.loai)} disabled={updateMut.isPending}>Lưu</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium mt-1">{log.tieu_de}</p>
                        {log.so_tien != null && (
                          <p className="text-sm text-amber-700 font-medium">{log.so_tien.toLocaleString("vi-VN")} VND</p>
                        )}
                        {log.noi_dung && <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{log.noi_dung}</p>}
                      </>
                    )}

                    <p className="text-xs text-muted-foreground mt-1">
                      {log.created_by_ten ?? "—"} · {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                    </p>
                  </div>

                  <div className="shrink-0 flex items-center gap-1">
                    {!log.is_resolved && !isEditing && (
                      <>
                        <button
                          onClick={() => startEdit(log.id, log.tieu_de, log.noi_dung)}
                          className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                          title="Sửa"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(log.id, log.loai)}
                          className="text-muted-foreground hover:text-red-600 transition-colors p-0.5"
                          title="Xóa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        {log.loai !== "gia" && (
                          <button
                            onClick={() => handleConfirm(log.id, log.loai)}
                            className="text-muted-foreground hover:text-green-600 transition-colors p-0.5"
                            title="Xác nhận đã xử lý"
                          >
                            <Circle className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                    {log.is_resolved && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                    {!log.is_resolved && log.loai === "gia" && (
                      <span className="text-[10px] text-amber-600 italic">Chờ invoice</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="lich_su" className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Lịch sử thay đổi</h3>
          <Separator />
          {isLoadingActivity && <p className="text-sm text-muted-foreground">Đang tải...</p>}
          {!isLoadingActivity && activityLogs.length === 0 && (
            <p className="text-sm text-muted-foreground italic">Chưa có thay đổi nào được ghi lại.</p>
          )}
          <div className="space-y-1.5">
            {activityLogs.map((entry) => {
              const cfg = ACTION_CONFIG[entry.action] ?? { label: entry.action, icon: Edit2, cls: "text-gray-500" };
              const Icon = cfg.icon;
              return (
                <div key={entry.id} className="flex gap-3 items-start py-2 border-b border-border/50 last:border-0">
                  <Icon className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", cfg.cls)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{entry.mo_ta}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-medium">{entry.ho_ten ?? "—"}</span>
                      {" · "}
                      {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
