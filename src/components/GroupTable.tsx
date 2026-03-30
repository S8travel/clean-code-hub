import { useState } from "react";
import { format } from "date-fns";
import { Pencil, Trash2, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { TravelGroup } from "@/hooks/use-travel-groups";
import { Skeleton } from "@/components/ui/skeleton";

const transition = { duration: 0.2, ease: [0.2, 0, 0, 1] as const };

function formatDate(d: string | null) {
  if (!d) return "—";
  return format(new Date(d), "MMM dd, yyyy");
}

interface Props {
  groups: TravelGroup[] | undefined;
  isLoading: boolean;
  onEdit: (g: TravelGroup) => void;
  onDelete: (g: TravelGroup) => void;
}

export function GroupTable({ groups, isLoading, onEdit, onDelete }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!groups?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-body">No travel groups found.</p>
        <p className="text-label mt-1">Start by adding your first tour.</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1.2fr_1.2fr_2fr_80px] gap-x-3 px-4 py-2 text-label uppercase text-muted-foreground">
          <span>Tên Đoàn</span>
          <span>HDV</span>
          <span className="text-center">Số Khách</span>
          <span>Ngày Đi</span>
          <span>Ngày Về</span>
          <span>Ghi Chú</span>
          <span />
        </div>
        <AnimatePresence initial={false}>
          {groups.map((g) => (
            <motion.div
              key={g.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={transition}
              className="grid grid-cols-[2fr_1.5fr_1fr_1.2fr_1.2fr_2fr_80px] gap-x-3 items-center px-4 py-3 hover:bg-muted/50 transition-colors duration-150 border-b border-border/40"
            >
              <span className="font-semibold text-body truncate">{g.ten_doan}</span>
              <span className="text-muted-foreground text-[13px] truncate">{g.hdv || "—"}</span>
              <span className="text-body tabular-nums text-center">{g.so_khach ?? 0}</span>
              <span className="text-body tabular-nums">{formatDate(g.ngay_di)}</span>
              <span className="text-body tabular-nums">{formatDate(g.ngay_ve)}</span>
              <span className="text-muted-foreground text-[12px] truncate">{g.ghi_chu || "—"}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => onEdit(g)}
                  className="p-2 rounded-md hover:bg-muted transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => onDelete(g)}
                  className="p-2 rounded-md hover:bg-destructive/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        <AnimatePresence initial={false}>
          {groups.map((g) => (
            <MobileCard key={g.id} group={g} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

function MobileCard({ group: g, onEdit, onDelete }: { group: TravelGroup; onEdit: (g: TravelGroup) => void; onDelete: (g: TravelGroup) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={transition}
      className="rounded-xl bg-card shadow-card p-4"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-body truncate">{g.ten_doan}</p>
          <p className="text-muted-foreground text-[13px]">{g.hdv || "No guide"} · {g.so_khach ?? 0} guests</p>
        </div>
        <div className="flex gap-1 ml-2 shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="p-2 rounded-md hover:bg-muted transition-colors">
            <Eye className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={() => onEdit(g)} className="p-2 rounded-md hover:bg-muted transition-colors">
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </button>
          <button onClick={() => onDelete(g)} className="p-2 rounded-md hover:bg-destructive/10 transition-colors">
            <Trash2 className="h-4 w-4 text-destructive" />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-border/40 grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <span className="text-label text-muted-foreground block">NGÀY ĐI</span>
                <span className="tabular-nums">{formatDate(g.ngay_di)}</span>
              </div>
              <div>
                <span className="text-label text-muted-foreground block">NGÀY VỀ</span>
                <span className="tabular-nums">{formatDate(g.ngay_ve)}</span>
              </div>
              {g.ghi_chu && (
                <div className="col-span-2">
                  <span className="text-label text-muted-foreground block">GHI CHÚ</span>
                  <span className="text-muted-foreground">{g.ghi_chu}</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
