import { Fragment } from "react";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import KSServiceRowInput from "./KSServiceRowInput";
import { dayLabel, type LocalKSRow } from "./ks-section-shared";

// ── Dịch vụ KS sub-section ──
// Render flat table với group rows theo ngày. Nút "+ Thêm DV" trong mỗi day group
// cho phép thêm thêm dịch vụ cùng ngày. Nút "+ Dịch vụ" cho ngày mới nằm ở day
// header của Phòng table phía trên.
export default function KSServicesSection({
  serviceDayEntries,
  ngayDateToNgaySo,
  ngayDateToDoanNgayId,
  localRows,
  onAddMore,
  onFieldChange,
  onBlurSave,
  onDelete,
  onToggleNguoiTt,
  disabled = false,
}: {
  serviceDayEntries: [string, LocalKSRow[]][];
  ngayDateToNgaySo: Record<string, number>;
  ngayDateToDoanNgayId: Record<string, number>;
  localRows: LocalKSRow[];
  onAddMore: (doanNgayId: number, ngayDate: string, refItemId?: number) => void;
  onFieldChange: (idx: number, field: string, value: any) => void;
  onBlurSave: (idx: number) => void;
  onDelete: (idx: number) => void;
  onToggleNguoiTt?: (idx: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 border-t border-border pt-2">
      <div className="flex items-center gap-2 px-1 py-0.5 mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          🍽️ Dịch vụ KS
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="w-[180px] h-auto py-1 px-2">Tên dịch vụ</TableHead>
            <TableHead className="w-[80px] h-auto py-1 px-2">Loại</TableHead>
            <TableHead className="w-[60px] h-auto py-1 px-2">SL</TableHead>
            <TableHead className="w-[60px] h-auto py-1 px-2">FOC</TableHead>
            <TableHead className="w-[110px] h-auto py-1 px-2">Đơn giá</TableHead>
            <TableHead className="w-[110px] h-auto py-1 px-2">Thành tiền</TableHead>
            <TableHead className="w-[32px] h-auto py-1 px-2" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {serviceDayEntries.map(([dateStr, dayRows]) => {
            const ngaySo = ngayDateToNgaySo[dateStr];
            const doanNgayId = ngayDateToDoanNgayId[dateStr] ?? dayRows[0]?.doan_ngay_id;
            const label =
              dateStr !== "unknown"
                ? `Ngày ${ngaySo ?? "?"} · ${format(new Date(dateStr), "dd/MM")} (${dayLabel(dateStr)})`
                : "Không xác định";
            return (
              <Fragment key={dateStr}>
                <TableRow className="bg-[#E6F1FB] hover:bg-[#E6F1FB]">
                  <TableCell colSpan={6} className="py-1 px-2 text-xs font-medium">
                    {label}
                  </TableCell>
                  <TableCell className="py-1 px-2 text-right">
                    {!disabled && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-1.5 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                        onClick={() => onAddMore(doanNgayId, dateStr, dayRows.find((r) => r.ref_doan_ngay_item_id != null)?.ref_doan_ngay_item_id ?? undefined)}
                      >
                        <Plus className="h-3 w-3 mr-0.5" />
                        Thêm
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {dayRows.map((row) => {
                  const globalIdx = localRows.indexOf(row);
                  return (
                    <KSServiceRowInput
                      key={`svc-${row.doan_ngay_id}-${globalIdx}`}
                      row={row}
                      globalIdx={globalIdx}
                      onFieldChange={onFieldChange}
                      onBlurSave={onBlurSave}
                      onDelete={onDelete}
                      onToggleNguoiTt={onToggleNguoiTt}
                      disabled={disabled}
                    />
                  );
                })}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
