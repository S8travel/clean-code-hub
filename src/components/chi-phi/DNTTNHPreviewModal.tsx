import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FileDown } from "lucide-react";
import { exportDNTTNHWordFromData, type NHDocData, type NHDocEntry } from "@/lib/export-dntt-nh-word";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  open: boolean;
  data: NHDocData | null;
  onClose: () => void;
}

type EditableItem = { so_luong: number; don_gia: number; ghi_chu: string };
type EditableEntry = Omit<NHDocEntry, "items"> & { items: EditableItem[] };

function computeConTT(entry: EditableEntry): number {
  const total = entry.items.reduce((s, i) => s + i.so_luong * i.don_gia, 0);
  return Math.max(0, total - entry.so_tien_coc - entry.can_tru);
}

export default function DNTTNHPreviewModal({ open, data, onClose }: Props) {
  const [editEntries, setEditEntries] = useState<EditableEntry[]>([]);
  const [nguoiDeNghi, setNguoiDeNghi] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open && data) {
      setEditEntries(
        data.entries.map((e) => ({
          ...e,
          items: e.items.map((i) => ({ ...i, ghi_chu: i.ghi_chu ?? "" })),
        }))
      );
      setNguoiDeNghi(data.nguoiDeNghi ?? "");
    }
  }, [open, data]);

  const updateEntry = (i: number, patch: Partial<EditableEntry>) => {
    setEditEntries((prev) =>
      prev.map((e, idx) => {
        if (idx !== i) return e;
        const updated = { ...e, ...patch };
        // auto-recalc so_tien_con_tt when items/coc/can_tru change
        if ("items" in patch || "so_tien_coc" in patch || "can_tru" in patch) {
          updated.so_tien_con_tt = computeConTT(updated);
        }
        return updated;
      })
    );
  };

  const updateItem = (entryIdx: number, itemIdx: number, patch: Partial<EditableItem>) => {
    setEditEntries((prev) =>
      prev.map((e, i) => {
        if (i !== entryIdx) return e;
        const items = e.items.map((it, j) => (j === itemIdx ? { ...it, ...patch } : it));
        const updated = { ...e, items };
        updated.so_tien_con_tt = computeConTT(updated);
        return updated;
      })
    );
  };

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      await exportDNTTNHWordFromData({
        doan: data.doan,
        entries: editEntries,
        nguoiDeNghi,
      });
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm">Xem trước ĐNTT — có thể chỉnh sửa trước khi xuất</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-5 space-y-5">
          {editEntries.map((entry, i) => {
            const itemsTotal = entry.items.reduce((s, it) => s + it.so_luong * it.don_gia, 0);
            return (
              <div key={i} className="border rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-blue-700">{entry.ten_nh}</p>

                {/* Basic info row */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Tên NH / Dịch vụ</label>
                    <Input value={entry.ten_nh} onChange={(e) => updateEntry(i, { ten_nh: e.target.value })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Ngày</label>
                    <Input value={entry.ngay_date} onChange={(e) => updateEntry(i, { ngay_date: e.target.value })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Số khách</label>
                    <Input type="number" min={0} value={entry.so_khach} onChange={(e) => updateEntry(i, { so_khach: parseInt(e.target.value) || 0 })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">FOC (mỗi X miễn Y)</label>
                    <div className="flex items-center gap-1">
                      <Input type="number" min={0} value={entry.foc_khach ?? ""} onChange={(e) => updateEntry(i, { foc_khach: e.target.value === "" ? null : parseInt(e.target.value) || 0 })} className="text-xs h-8" placeholder="—" />
                      <span className="text-xs text-muted-foreground">免</span>
                      <Input type="number" min={0} value={entry.foc ?? ""} onChange={(e) => updateEntry(i, { foc: e.target.value === "" ? null : parseInt(e.target.value) || 0 })} className="text-xs h-8" placeholder="—" />
                    </div>
                  </div>
                </div>

                {/* Items table */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Bảng chi tiết</label>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-gray-100">
                          {["Số lượng", "Đơn giá", "Thành tiền", "Ghi chú"].map((h) => (
                            <th key={h} className="border border-gray-300 px-2 py-1 text-center font-semibold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {entry.items.map((item, j) => (
                          <tr key={j}>
                            <td className="border border-gray-300 p-0.5 w-20">
                              <Input type="number" min={0} value={item.so_luong} onChange={(e) => updateItem(i, j, { so_luong: parseInt(e.target.value) || 0 })} className="h-7 text-xs border-0 px-1 text-center" />
                            </td>
                            <td className="border border-gray-300 p-0.5 w-32">
                              <Input type="number" min={0} value={item.don_gia} onChange={(e) => updateItem(i, j, { don_gia: parseInt(e.target.value) || 0 })} className="h-7 text-xs border-0 px-1 text-right" />
                            </td>
                            <td className="border border-gray-300 px-2 py-1 text-right font-medium whitespace-nowrap w-32">
                              {fmt(item.so_luong * item.don_gia)}
                            </td>
                            <td className="border border-gray-300 p-0.5">
                              <Input value={item.ghi_chu} onChange={(e) => updateItem(i, j, { ghi_chu: e.target.value })} className="h-7 text-xs border-0 px-1" placeholder="Ghi chú..." />
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold">
                          <td colSpan={2} className="border border-gray-300 px-2 py-1 text-right text-[11px]">Tổng</td>
                          <td className="border border-gray-300 px-2 py-1 text-right text-[11px]">{fmt(itemsTotal)}</td>
                          <td className="border border-gray-300" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cọc / cấn trừ / còn TT */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Tiền cọc đã TT</label>
                    <Input type="number" min={0} value={entry.so_tien_coc} onChange={(e) => updateEntry(i, { so_tien_coc: parseInt(e.target.value) || 0 })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Cấn trừ</label>
                    <Input type="number" min={0} value={entry.can_tru} onChange={(e) => updateEntry(i, { can_tru: parseInt(e.target.value) || 0 })} className="text-xs h-8" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Còn lại phải TT</label>
                    <Input type="number" min={0} value={entry.so_tien_con_tt} onChange={(e) => updateEntry(i, { so_tien_con_tt: parseInt(e.target.value) || 0 })} className="text-xs h-8 font-semibold text-red-700" />
                  </div>
                </div>

                {/* Tài khoản thanh toán */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Tài khoản thanh toán</label>
                  <Textarea
                    value={entry.tai_khoan_thanh_toan ?? ""}
                    onChange={(e) => updateEntry(i, { tai_khoan_thanh_toan: e.target.value || null })}
                    rows={2}
                    className="text-xs resize-none"
                    placeholder="Tên, số TK, ngân hàng..."
                  />
                </div>
              </div>
            );
          })}

          {/* Người đề nghị */}
          <div className="space-y-1 pb-1">
            <label className="text-[11px] text-muted-foreground">Người đề nghị</label>
            <Input value={nguoiDeNghi} onChange={(e) => setNguoiDeNghi(e.target.value)} className="text-xs h-8 max-w-xs" />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 shrink-0 border-t">
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
