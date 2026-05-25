import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { isKSRoomRow, calcRowFocBreakdown, calcFocSuggestion } from "@/lib/foc-calc";
import KSRowInput from "./KSRowInput";
import { dayLabel, type LocalKSRow } from "./ks-section-shared";
import { t, useTranslate } from "@/lib/i18n";

/* ── Add buttons cụm (Phòng + Dịch vụ) cho header ngày ── */
export function DayAddButtons({ onAddRoom, onAddService }: { onAddRoom: () => void; onAddService: () => void }) {
  useTranslate();
  return (
    <div className="inline-flex items-center gap-0.5 whitespace-nowrap">
      <Button variant="ghost" size="sm" className="h-6 text-xs px-1.5" onClick={onAddRoom}>
        <Plus className="h-3 w-3 mr-0.5" />
        {t("Phòng")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs px-1.5 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
        onClick={onAddService}
      >
        <Plus className="h-3 w-3 mr-0.5" />
        {t("Dịch vụ")}
      </Button>
    </div>
  );
}

/* ── Day group header + rows ── */
export function DayGroup({
  dateStr,
  ngaySo,
  dayRows,
  localRows,
  focKhach,
  focMien,
  onFieldChange,
  onBlurSave,
  onDelete,
  onAddRoom,
  onAddService,
  disabled = false,
  cpCommittedById,
}: {
  dateStr: string;
  ngaySo?: number;
  dayRows: LocalKSRow[];
  localRows: LocalKSRow[];
  focKhach: number | null;
  focMien: number | null;
  onFieldChange: (idx: number, field: string, value: string | number) => void;
  onBlurSave: (idx: number) => void;
  onDelete: (idx: number) => void;
  onAddRoom: () => void;
  onAddService: () => void;
  disabled?: boolean;
  /** Row có chi_phi_id thuộc map = đã commit vào DNTT → khoá inline-edit dù
   *  card đang ở chế độ thêm phát sinh. Row mới (id == null) hoặc id chưa
   *  có DNTT → editable. */
  cpCommittedById?: Record<number, boolean>;
}) {
  useTranslate();
  const label =
    dateStr !== "unknown"
      ? `${t("Ngày")} ${ngaySo ?? "?"} · ${format(new Date(dateStr), "dd/MM")} (${dayLabel(dateStr)})`
      : t("Không xác định");

  // Gợi ý FOC theo 16免1 cho header (info-only, OP tự gán vào row giá thấp nhất)
  const roomDayRows = dayRows.filter(isKSRoomRow);
  const suggest = calcFocSuggestion(roomDayRows, focKhach, focMien);
  const assignedFoc = roomDayRows.reduce((s, r) => s + (Number(r.foc_count) || 0), 0);

  return (
    <>
      <TableRow className="bg-[#E6F1FB] hover:bg-[#E6F1FB]">
        <TableCell colSpan={8} className="py-1 px-2 text-xs font-medium">
          <span>{label}</span>
          {focKhach && focMien && suggest.totalRooms > 0 && (
            <span
              className="ml-2 text-[10px] font-normal text-muted-foreground"
              title={`${t("Tổng")} ${suggest.totalRooms} ${t("phòng")} · ${focKhach}免${focMien} → ${t("gợi ý FOC")} ${suggest.suggestedFoc}. ${t("OP tự gán cho row phòng giá thấp nhất.")}`}
            >
              · {focKhach}免{focMien}: <span className={cn(
                "font-medium",
                assignedFoc === suggest.suggestedFoc ? "text-emerald-700" : "text-orange-700",
              )}>
                {t("gợi ý")} {suggest.suggestedFoc} / {t("đã gán")} {assignedFoc}
              </span>
            </span>
          )}
        </TableCell>
        <TableCell className="py-1 px-2 text-right">
          <DayAddButtons onAddRoom={onAddRoom} onAddService={onAddService} />
        </TableCell>
      </TableRow>
      {dayRows.map((row) => {
        const globalIdx = localRows.indexOf(row);
        const { rowFocDeduction } = calcRowFocBreakdown(row, dayRows, focKhach, focMien);
        // Row mới (id == null) hoặc row chưa commit vào DNTT → editable.
        // Row đã commit (so_tien_da_dntt > 0) → khoá theo lock của card.
        const rowDisabled =
          disabled && row.id != null && !!cpCommittedById?.[row.id];
        return (
          <KSRowInput
            key={`${row.doan_ngay_id}-${globalIdx}`}
            row={row}
            globalIdx={globalIdx}
            rowFocDeduction={rowFocDeduction}
            onFieldChange={onFieldChange}
            onBlurSave={onBlurSave}
            onDelete={onDelete}
            disabled={rowDisabled}
          />
        );
      })}
    </>
  );
}

/* ── Empty day header ── */
export function EmptyDayHeader({
  dateStr, ngaySo, isDayUse, onAddRoom, onAddService,
}: {
  dateStr: string;
  ngaySo?: number;
  isDayUse?: boolean;
  onAddRoom: () => void;
  onAddService: () => void;
}) {
  useTranslate();
  const label = `${t("Ngày")} ${ngaySo ?? "?"} · ${format(new Date(dateStr), "dd/MM")} (${dayLabel(dateStr)})`;
  return (
    <TableRow className="bg-[#E6F1FB] hover:bg-[#E6F1FB]">
      <TableCell colSpan={8} className="py-1 px-2 text-xs font-medium">
        {label}
        {isDayUse && (
          <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
            Day Use
          </span>
        )}
      </TableCell>
      <TableCell className="py-1 px-2 text-right">
        <DayAddButtons onAddRoom={onAddRoom} onAddService={onAddService} />
      </TableCell>
    </TableRow>
  );
}
