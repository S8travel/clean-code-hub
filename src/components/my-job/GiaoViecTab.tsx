import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Inbox, SendHorizonal } from "lucide-react";
import { useCongViecList, type CongViecRow } from "@/hooks/use-cong-viec";
import CongViecCard from "./CongViecCard";
import CongViecDetail from "./CongViecDetail";
import TaoViecModal from "./TaoViecModal";

interface Props {
  userId: string;
  userName: string;
}

export default function GiaoViecTab({ userId, userName }: Props) {
  const { data: tasks = [], isLoading } = useCongViecList(userId);

  const [view, setView] = useState<"received" | "sent">("received");
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterPriority, setFilterPriority] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Always derive from fresh tasks so detail reflects latest state after mutations
  const selectedTask: CongViecRow | null =
    selectedId != null ? (tasks.find((t) => t.id === selectedId) ?? null) : null;

  const displayed = tasks
    .filter((t) => (view === "received" ? t.nguoi_nhan === userId : t.nguoi_giao === userId))
    .filter((t) => {
      if (filterStatus === "active") return t.trang_thai === "cho_nhan" || t.trang_thai === "dang_lam";
      if (filterStatus === "done") return t.trang_thai === "hoan_thanh" || t.trang_thai === "tu_choi";
      return true;
    })
    .filter((t) => filterPriority === "all" || t.do_uu_tien === filterPriority);

  const receivedPending = tasks.filter(
    (t) => t.nguoi_nhan === userId && (t.trang_thai === "cho_nhan" || t.trang_thai === "dang_lam"),
  ).length;

  const sentPending = tasks.filter(
    (t) => t.nguoi_giao === userId && (t.trang_thai === "cho_nhan" || t.trang_thai === "dang_lam"),
  ).length;

  return (
    <div className="space-y-3 mt-4">
      {/* Sub-tab toggle + Create button */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex rounded-md border overflow-hidden text-xs">
          <button
            onClick={() => setView("received")}
            className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
              view === "received" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
            }`}
          >
            <Inbox className="h-3.5 w-3.5" />
            Được giao cho tôi
            {receivedPending > 0 && (
              <span className="ml-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 leading-4">
                {receivedPending}
              </span>
            )}
          </button>
          <button
            onClick={() => setView("sent")}
            className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors border-l ${
              view === "sent" ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
            }`}
          >
            <SendHorizonal className="h-3.5 w-3.5" />
            Tôi đã giao
            {sentPending > 0 && (
              <span className="ml-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold px-1.5 leading-4">
                {sentPending}
              </span>
            )}
          </button>
        </div>

        <Button size="sm" className="text-xs h-8 gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          Tạo việc
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-7 text-xs w-32">
            <span>{filterStatus === "active" ? "Đang xử lý" : filterStatus === "done" ? "Đã xong" : "Tất cả"}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Đang xử lý</SelectItem>
            <SelectItem value="done">Đã xong</SelectItem>
            <SelectItem value="all">Tất cả</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-7 text-xs w-36">
            <span>{filterPriority === "all" ? "Mọi ưu tiên" : filterPriority === "khan_cap" ? "🔴 Khẩn cấp" : filterPriority === "cao" ? "🟠 Cao" : filterPriority === "binh_thuong" ? "🟡 Bình thường" : "🟢 Thấp"}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi ưu tiên</SelectItem>
            <SelectItem value="khan_cap">🔴 Khẩn cấp</SelectItem>
            <SelectItem value="cao">🟠 Cao</SelectItem>
            <SelectItem value="binh_thuong">🟡 Bình thường</SelectItem>
            <SelectItem value="thap">🟢 Thấp</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{displayed.length} việc</span>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground font-medium">Không có việc nào</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {view === "received" ? "Bạn chưa được giao việc nào" : "Bạn chưa giao việc cho ai"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((task) => (
            <CongViecCard
              key={task.id}
              task={task}
              viewMode={view}
              onClick={() => setSelectedId(task.id)}
            />
          ))}
        </div>
      )}

      <CongViecDetail
        task={selectedTask}
        open={selectedId != null}
        onClose={() => setSelectedId(null)}
        userId={userId}
        userName={userName}
      />

      <TaoViecModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        userId={userId}
        userName={userName}
      />
    </div>
  );
}
