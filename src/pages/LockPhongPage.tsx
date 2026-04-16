import { useState } from "react";
import { Plus, Lock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLockPhongList, useLockPhongDeadlineAlerts, type LockPhongDisplay } from "@/hooks/use-lock-phong";
import { useCurrentSession } from "@/hooks/use-current-user";
import LockPhongTheoSeriView from "@/components/lock-phong/LockPhongTheoSeriView";
import LockPhongTheoKSView from "@/components/lock-phong/LockPhongTheoKSView";
import LockPhongFormDialog from "@/components/lock-phong/LockPhongFormDialog";
import { format, parseISO, differenceInDays } from "date-fns";

export default function LockPhongPage() {
  const [view, setView] = useState<"doan" | "ks">("doan");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LockPhongDisplay | null>(null);

  const { session } = useCurrentSession();
  const { data = [], isLoading } = useLockPhongList();
  const deadlineAlerts = useLockPhongDeadlineAlerts(session?.user?.id ?? null);

  const handleEdit = (entry: LockPhongDisplay) => {
    setEditTarget(entry);
    setFormOpen(true);
  };

  const handleAddNew = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 space-y-4">
      {/* Deadline alerts */}
      {deadlineAlerts.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-orange-700">
              {deadlineAlerts.length} lock phòng sắp đến deadline
            </p>
            <ul className="mt-1 space-y-0.5">
              {deadlineAlerts.map((lp) => {
                const dl = parseISO(lp.deadline!);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diff = differenceInDays(dl, today);
                return (
                  <li key={lp.id} className="text-xs text-orange-600">
                    <span className="font-medium">{lp.ten_doan}</span>
                    {" — deadline "}
                    <span className="font-medium">{format(dl, "dd/MM/yyyy")}</span>
                    {diff === 0 ? " (hôm nay)" : diff < 0 ? ` (quá hạn ${Math.abs(diff)} ngày)` : ` (còn ${diff} ngày)`}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Lock Phòng</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Đặt phòng trước theo seri, trước khi booking chính thức
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs value={view} onValueChange={(v) => setView(v as "doan" | "ks")}>
          <TabsList className="h-8">
            <TabsTrigger value="doan" className="text-xs h-7 px-3">
              Theo Đoàn
            </TabsTrigger>
            <TabsTrigger value="ks" className="text-xs h-7 px-3">
              Theo Khách Sạn
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={handleAddNew}>
          <Plus className="h-3.5 w-3.5" />
          Thêm Lock Phòng
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="py-16 text-center space-y-2">
          <Lock className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Chưa có lock phòng nào</p>
          <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={handleAddNew}>
            <Plus className="h-3.5 w-3.5" />
            Tạo lock phòng đầu tiên
          </Button>
        </div>
      ) : view === "doan" ? (
        <LockPhongTheoSeriView data={data} onEdit={handleEdit} />
      ) : (
        <LockPhongTheoKSView data={data} />
      )}

      <LockPhongFormDialog
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditTarget(null);
        }}
        initialData={editTarget}
      />
    </div>
  );
}
