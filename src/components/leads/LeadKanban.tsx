import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import {
  LEAD_TRANG_THAI_OPTS,
  useUpdateLeadStatus,
  type Lead,
  type LeadTrangThai,
} from "@/hooks/use-leads";
import { LeadCard } from "./LeadCard";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";

interface Props {
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
}

// Column colors for terminal states
const COLUMN_BG: Partial<Record<LeadTrangThai, string>> = {
  chot_deal: "bg-green-50/60",
  mat_khach: "bg-gray-50/80",
};

// ── Draggable card ──────────────────────────────────────────
function DraggableCard({ lead, onLeadClick }: { lead: Lead; onLeadClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id.toString(),
    data: { lead },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={cn(isDragging && "opacity-40")}>
      <LeadCard lead={lead} onClick={onLeadClick} />
    </div>
  );
}

// ── Droppable column ────────────────────────────────────────
function KanbanColumn({
  status, label, leads, onLeadClick,
}: {
  status: LeadTrangThai;
  label: string;
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div className="flex flex-col min-w-[230px] max-w-[240px] shrink-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">{label}</span>
        <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-medium">{leads.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 rounded-xl p-2 space-y-2 min-h-[120px] transition-colors",
          COLUMN_BG[status] ?? "bg-muted/30",
          isOver && "ring-2 ring-primary/40 bg-primary/5"
        )}
      >
        {leads.map((lead) => (
          <DraggableCard key={lead.id} lead={lead} onLeadClick={() => onLeadClick(lead)} />
        ))}
      </div>
    </div>
  );
}

// ── Main Kanban ─────────────────────────────────────────────
export function LeadKanban({ leads, onLeadClick }: Props) {
  const { user } = useAuth();
  const updateStatus = useUpdateLeadStatus();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [matKhachDialog, setMatKhachDialog] = useState<{
    leadId: number;
    targetStatus: LeadTrangThai;
  } | null>(null);
  const [lyDoMat, setLyDoMat] = useState("");

  const activeLead = activeId ? leads.find((l) => l.id.toString() === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const leadId = parseInt(active.id as string);
    const newStatus = over.id as LeadTrangThai;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.trang_thai === newStatus) return;

    if (newStatus === "mat_khach") {
      setLyDoMat("");
      setMatKhachDialog({ leadId, targetStatus: newStatus });
      return;
    }

    // chot_deal: just update status (full conversion flow in LeadDrawer)
    updateStatus.mutate(
      { id: leadId, trang_thai_moi: newStatus, created_by: user?.user_id },
      { onSuccess: () => toast.success(`Đã chuyển sang: ${LEAD_TRANG_THAI_OPTS.find((o) => o.value === newStatus)?.label}`),
        onError: (e: any) => toast.error(e?.message ?? "Lỗi khi đổi trạng thái") }
    );
  };

  const confirmMatKhach = () => {
    if (!matKhachDialog) return;
    updateStatus.mutate(
      {
        id: matKhachDialog.leadId,
        trang_thai_moi: "mat_khach",
        ly_do_mat: lyDoMat.trim() || null,
        created_by: user?.user_id,
      },
      {
        onSuccess: () => { toast.success("Đã ghi nhận mất khách"); setMatKhachDialog(null); },
        onError: (e: any) => toast.error(e?.message ?? "Lỗi"),
      }
    );
  };

  const grouped = LEAD_TRANG_THAI_OPTS.reduce((acc, s) => {
    acc[s.value] = leads.filter((l) => l.trang_thai === s.value);
    return acc;
  }, {} as Record<string, Lead[]>);

  return (
    <>
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={closestCenter}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 pt-1">
          {LEAD_TRANG_THAI_OPTS.map((s) => (
            <KanbanColumn
              key={s.value}
              status={s.value}
              label={s.label}
              leads={grouped[s.value] ?? []}
              onLeadClick={onLeadClick}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead ? <LeadCard lead={activeLead} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {/* Dialog: Mất khách — bắt buộc nhập lý do */}
      <AlertDialog open={!!matKhachDialog} onOpenChange={(v) => !v && setMatKhachDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ghi nhận mất khách</AlertDialogTitle>
            <AlertDialogDescription>
              Nhập lý do để ghi lại và cải thiện quy trình sales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={lyDoMat}
            onChange={(e) => setLyDoMat(e.target.value)}
            placeholder="VD: Khách chọn đơn vị khác, giá cao hơn đối thủ..."
            rows={3}
            className="resize-none"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmMatKhach}
              disabled={updateStatus.isPending}
              className="bg-red-500 hover:bg-red-600"
            >
              Xác nhận mất khách
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
