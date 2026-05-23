import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileDown } from "lucide-react";
import { computeExportCells, exportDieuTourWordFromCells } from "@/lib/export-dieu-tour-word";
import type { DieuTourExportData, DayExportCell } from "@/lib/export-dieu-tour-word";
import { t, useTranslate } from "@/lib/i18n";

function fmtDateInfo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  return `${d.toLocaleDateString("vi-VN")} (${WD[d.getDay()]})`;
}

interface XeLabelInfo {
  nha_xe?: { ten?: string | null } | null;
  ten_xe?: string | null;
  so_cho?: number | null;
}

function xeLabelInfo(xe: XeLabelInfo | null | undefined): string {
  if (!xe) return "—";
  const parts = [xe.nha_xe?.ten, xe.ten_xe, xe.so_cho ? `${xe.so_cho} ${t("chỗ")}` : ""].filter(Boolean);
  return parts.join(" · ") || "—";
}

function InfoTable({ data }: { data: DieuTourExportData }) {
  useTranslate();
  const shopStr = data.shopping === true ? "YES" : data.shopping === false ? "NO" : "—";
  // Tip — cùng công thức với export Word (150 NT nếu có T/L, ngược lại 300 NT)
  const effTipRate = data.tipRate ?? (data.soKhachTl > 0 ? 150 : 300);
  const tipText = data.thuTip
    ? `${t("Có")} – ${effTipRate.toLocaleString("vi-VN")} ${t("NT/khách/ngày")}`
    : t("Không");
  return (
    <table className="w-full border-collapse text-xs mb-3">
      <tbody>
        <tr>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 w-24 whitespace-nowrap">{t("Code đoàn")}</td>
          <td className="border border-gray-300 px-2 py-1 font-semibold text-blue-700">{data.tenDoan}</td>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 w-24 whitespace-nowrap">{t("Bảng đón")}</td>
          <td className="border border-gray-300 px-2 py-1">{data.bangDon || "—"}</td>
        </tr>
        <tr>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">{t("HDV")}</td>
          <td className="border border-gray-300 px-2 py-1">{data.hdv || "—"}</td>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">Shopping</td>
          <td className="border border-gray-300 px-2 py-1">{shopStr}</td>
        </tr>
        <tr>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">{t("Xe")}</td>
          <td className="border border-gray-300 px-2 py-1">{xeLabelInfo(data.xe)}</td>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">T/L</td>
          <td className="border border-gray-300 px-2 py-1">{data.truongDoan || "—"}</td>
        </tr>
        <tr>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">{t("Ngày đón")}</td>
          <td className="border border-gray-300 px-2 py-1">
            {fmtDateInfo(data.ngayDi)}
            {data.chuyenBayDon && <span className="text-gray-500 ml-3">{data.chuyenBayDon}</span>}
          </td>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">{t("Quà tặng")}</td>
          <td className="border border-gray-300 px-2 py-1">
            {data.gifts && data.gifts.length > 0 ? data.gifts.join(", ") : "—"}
          </td>
        </tr>
        <tr>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">{t("Ngày tiễn")}</td>
          <td className="border border-gray-300 px-2 py-1">
            {fmtDateInfo(data.ngayVe)}
            {data.chuyenBayTien && <span className="text-gray-500 ml-3">{data.chuyenBayTien}</span>}
          </td>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">Tip</td>
          <td className="border border-gray-300 px-2 py-1">{tipText}</td>
        </tr>
        <tr>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">{t("Số khách")}</td>
          <td colSpan={3} className="border border-gray-300 px-2 py-1">
            <span className="font-semibold">NL:</span> {data.soKhachLon}&nbsp;&nbsp;
            <span className="font-semibold">TE 50%:</span> {data.soKhachEm1}&nbsp;&nbsp;
            <span className="font-semibold">TE free:</span> {data.soKhachEm2}&nbsp;&nbsp;
            <span className="font-semibold">T/L:</span> {data.soKhachTl}&nbsp;&nbsp;
            <span className="font-semibold">{t("Tổng")}: <span className="text-blue-700">{data.totalKhach}</span></span>
          </td>
        </tr>
        <tr>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap align-top">{t("Chú thích")}</td>
          <td colSpan={3} className="border border-gray-300 px-2 py-1 whitespace-pre-line">{data.chuThichKhach || "—"}</td>
        </tr>
        <tr>
          <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-100 whitespace-nowrap">{t("T/L ăn NH")}</td>
          <td colSpan={3} className="border border-gray-300 px-2 py-1">
            {data.coTinhSuatTLNhaHang ? t("Có tính suất ăn T/L") : t("Không tính")}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

interface Props {
  open: boolean;
  data: DieuTourExportData | null;
  onClose: () => void;
  onGhiChuSave: (text: string) => void;
}

const COL_HEADER_KEYS = ["Ngày", "Chương trình", "Ăn trưa", "Ăn tối", "Khách sạn"];
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
  useTranslate();
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
          <DialogTitle className="text-sm">{t("Xem trước bảng điều tour — có thể chỉnh sửa trước khi xuất")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-4">
          {/* Thông tin chung */}
          {data && <InfoTable data={data} />}

          {/* Schedule table */}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {COL_HEADER_KEYS.map((h, i) => (
                  <th
                    key={h}
                    className={`border border-gray-300 bg-gray-100 px-2 py-1 text-center font-semibold ${COL_WIDTHS[i]}`}
                  >
                    {t(h)}
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
            <p className="text-xs font-semibold">{t("Ghi chú")}</p>
            <Textarea
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              rows={5}
              className="text-xs font-mono resize-y"
              placeholder={t("Nhập ghi chú...")}
            />
          </div>
        </div>

        <DialogFooter className="px-4 py-3 shrink-0 border-t">
          <Button variant="outline" size="sm" onClick={onClose}>{t("Hủy")}</Button>
          <Button size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting}>
            <FileDown className="h-3.5 w-3.5" />
            {exporting ? t("Đang xuất...") : t("Xuất Word")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
