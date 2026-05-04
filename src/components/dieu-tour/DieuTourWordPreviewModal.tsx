import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileDown } from "lucide-react";
import { computeExportCells, exportDieuTourWordFromCells } from "@/lib/export-dieu-tour-word";
import type { DieuTourExportData, DayExportCell } from "@/lib/export-dieu-tour-word";

interface Props {
  open: boolean;
  data: DieuTourExportData | null;
  onClose: () => void;
  onGhiChuSave: (text: string) => void;
}

const COL_HEADERS = ["Ngày", "Chương trình", "Ăn trưa", "Ăn tối", "Khách sạn"];
const COL_WIDTHS  = ["w-16", "w-64", "w-48", "w-48", "w-52"];
const ROW_HEIGHTS: Record<string, number> = {};

function CellTextarea({
  value, onChange, rows = 3,
}: { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="text-xs font-mono resize-y min-h-[56px] w-full border-0 focus-visible:ring-0 bg-transparent p-1"
    />
  );
}

export default function DieuTourWordPreviewModal({ open, data, onClose, onGhiChuSave }: Props) {
  const [cells, setCells] = useState<DayExportCell[]>([]);
  const [ghiChu, setGhiChu] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open && data) {
      setCells(computeExportCells(data));
      setGhiChu(data.ghiChuDieuTour ?? "");
    }
  }, [open, data]);

  const updateCell = (i: number, field: keyof Omit<DayExportCell, "ngay_date" | "thu">, val: string) => {
    setCells((prev) => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  };

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      onGhiChuSave(ghiChu);
      await exportDieuTourWordFromCells(data, cells, ghiChu);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  function formatDateLabel(dc: DayExportCell) {
    const d = new Date(dc.ngay_date + "T00:00:00");
    return `${d.getDate()}/${d.getMonth() + 1}\n${dc.thu}`;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm">Xem trước bảng điều tour — có thể chỉnh sửa trước khi xuất</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-4">
          {/* Schedule table */}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {COL_HEADERS.map((h, i) => (
                  <th
                    key={h}
                    className={`border border-gray-300 bg-gray-100 px-2 py-1 text-center font-semibold ${COL_WIDTHS[i]}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cells.map((dc, i) => (
                <tr key={i} className="align-top">
                  <td className="border border-gray-300 px-1 py-1 text-center text-[11px] font-medium whitespace-pre-line leading-tight">
                    {formatDateLabel(dc)}
                  </td>
                  <td className="border border-gray-300 p-0">
                    <CellTextarea value={dc.chuongTrinh} onChange={(v) => updateCell(i, "chuongTrinh", v)} rows={4} />
                  </td>
                  <td className="border border-gray-300 p-0">
                    <CellTextarea value={dc.anTrua} onChange={(v) => updateCell(i, "anTrua", v)} rows={3} />
                  </td>
                  <td className="border border-gray-300 p-0">
                    <CellTextarea value={dc.anToi} onChange={(v) => updateCell(i, "anToi", v)} rows={3} />
                  </td>
                  <td className="border border-gray-300 p-0">
                    <CellTextarea value={dc.khachSan} onChange={(v) => updateCell(i, "khachSan", v)} rows={3} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Ghi chú */}
          <div className="mt-4 space-y-1">
            <p className="text-xs font-semibold">Ghi chú</p>
            <Textarea
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              rows={5}
              className="text-xs font-mono resize-y"
              placeholder="Nhập ghi chú..."
            />
          </div>
        </div>

        <DialogFooter className="px-4 py-3 shrink-0 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>Hủy</Button>
          <Button size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting}>
            <FileDown className="h-3.5 w-3.5" />
            {exporting ? "Đang xuất..." : "Xuất Word"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
