import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Textarea } from "@/components/ui/textarea";
import { FileDown } from "lucide-react";
import { exportDNTTKSWordFromData, exportDNTTKSBatchWordFromData } from "@/lib/export-dntt-ks-word";
import type { EdgeFunctionData } from "@/lib/export-dntt-ks-word";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  open: boolean;
  items: EdgeFunctionData[];
  onClose: () => void;
}

type RoomEntry = EdgeFunctionData["roomEntries"][number];
type EditableItem = EdgeFunctionData & { roomEntries: RoomEntry[] };

function computeLyDo(item: EdgeFunctionData, isBatch: boolean): string {
  const suffix = item.doan.so_khach ? ` - ${item.doan.so_khach} khách` : "";
  if (item.la_coc) return `Đề nghị thanh toán tiền cọc khách sạn ${item.ks.ten} cho đoàn ${item.doan.ten_doan}${suffix}`;
  if (isBatch) return `Đề nghị thanh toán tiền khách sạn cho đoàn ${item.doan.ten_doan}${suffix}`;
  return `Đề nghị thanh toán tiền khách sạn ${item.ks.ten} cho đoàn ${item.doan.ten_doan}${suffix}`;
}

export default function DNTTKSPreviewModal({ open, items, onClose }: Props) {
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [nguoiDeNghi, setNguoiDeNghi] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (open && items.length > 0) {
      setEditItems(
        items.map((item) => ({
          ...item,
          lyDoText: computeLyDo(item, items.length > 1),
          roomEntries: item.roomEntries.map((r) => ({ ...r })),
        }))
      );
      setNguoiDeNghi(items[0]?.nguoiDeNghi ?? "");
    }
  }, [open, items]);

  const updateItem = (i: number, patch: Partial<EditableItem>) => {
    setEditItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  };

  const updateRoom = (itemIdx: number, roomIdx: number, patch: Partial<RoomEntry>) => {
    setEditItems((prev) =>
      prev.map((it, i) => i !== itemIdx ? it : {
        ...it,
        roomEntries: it.roomEntries.map((r, j) => j === roomIdx ? { ...r, ...patch } : r),
      })
    );
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const withNguoi = editItems.map((it) => ({ ...it, nguoiDeNghi }));
      if (withNguoi.length === 1) {
        await exportDNTTKSWordFromData(withNguoi[0]);
      } else {
        await exportDNTTKSBatchWordFromData(withNguoi, withNguoi[0]?.doan.ten_doan ?? "", nguoiDeNghi);
      }
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
          {editItems.map((item, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-3">
              {/* Hotel name header */}
              <p className="text-xs font-semibold text-blue-700">{item.ks.ten}{item.codeKS ? ` — Code: ${item.codeKS}` : ""}</p>

              {/* Lý do */}
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Lý do</label>
                <Input
                  value={item.lyDoText ?? ""}
                  onChange={(e) => updateItem(i, { lyDoText: e.target.value })}
                  className="text-xs h-8"
                />
              </div>

              {/* Room entries table */}
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Bảng phòng</label>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        {["Check in", "Check out", "Loại phòng", "Số đêm", "Số lượng", "FOC", "Đơn giá", "Thành tiền"].map((h) => (
                          <th key={h} className="border border-gray-300 px-2 py-1 text-center font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {item.roomEntries.map((room, j) => {
                        const soDem = room.so_dem ?? 1;
                        const focCount = Math.max(0, room.foc_count ?? 0);
                        const billedQty = Math.max(0, room.so_luong - focCount);
                        return (
                          <tr key={j}>
                            <td className="border border-gray-300 p-0.5">
                              <Input value={room.ci ?? ""} onChange={(e) => updateRoom(i, j, { ci: e.target.value })} className="h-7 text-xs border-0 px-1" />
                            </td>
                            <td className="border border-gray-300 p-0.5">
                              <Input value={room.co ?? ""} onChange={(e) => updateRoom(i, j, { co: e.target.value })} className="h-7 text-xs border-0 px-1" />
                            </td>
                            <td className="border border-gray-300 p-0.5">
                              <Input value={room.name} onChange={(e) => updateRoom(i, j, { name: e.target.value })} className="h-7 text-xs border-0 px-1" />
                            </td>
                            <td className="border border-gray-300 p-0.5 w-16">
                              <Input type="number" min={1} value={soDem} onChange={(e) => updateRoom(i, j, { so_dem: parseInt(e.target.value) || 1 })} className="h-7 text-xs border-0 px-1 text-center" />
                            </td>
                            <td className="border border-gray-300 p-0.5 w-16">
                              <Input type="number" min={0} value={room.so_luong} onChange={(e) => updateRoom(i, j, { so_luong: parseInt(e.target.value) || 0 })} className="h-7 text-xs border-0 px-1 text-center" />
                            </td>
                            <td className="border border-gray-300 p-0.5 w-14">
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={focCount}
                                onChange={(e) => updateRoom(i, j, { foc_count: Math.max(0, Number(e.target.value) || 0) })}
                                className="h-7 text-xs border-0 px-1 text-center"
                              />
                            </td>
                            <td className="border border-gray-300 p-0.5 w-28">
                              <DecimalInput value={room.don_gia} onChange={(v) => updateRoom(i, j, { don_gia: v })} className="h-7 text-xs border-0 px-1 text-right" />
                            </td>
                            <td
                              className="border border-gray-300 px-2 py-1 text-right font-medium text-[11px] whitespace-nowrap w-28"
                              title={focCount > 0 ? `${room.so_luong} − ${focCount} FOC = ${billedQty}` : undefined}
                            >
                              {fmt(room.don_gia * billedQty * soDem)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tóm tắt số tiền — hiển thị cọc / cấn trừ / thực TT */}
              {(() => {
                const tongPhong = item.roomEntries.reduce((s, r) => {
                  const foc = Math.max(0, r.foc_count ?? 0);
                  const billed = Math.max(0, r.so_luong - foc);
                  return s + r.don_gia * billed * (r.so_dem ?? 1);
                }, 0);
                const cocTotal = item.cocTotal || 0;
                const canTruTotal = item.canTruTotal ?? 0;
                const thucTT = Math.max(0, item.soTien - canTruTotal);
                const hasExtra = cocTotal > 0 || canTruTotal > 0 || item.la_coc;
                if (!hasExtra) return null;
                return (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs space-y-1">
                    {item.la_coc && (
                      <div className="text-amber-700 font-medium">
                        ★ ĐNTT này là khoản <span className="font-semibold">cọc</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tổng tiền phòng:</span>
                      <span className="font-medium">{fmt(tongPhong)} ₫</span>
                    </div>
                    {cocTotal > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Đã cọc trước:</span>
                        <span>− {fmt(cocTotal)} ₫</span>
                      </div>
                    )}
                    {canTruTotal > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>Cấn trừ công nợ:</span>
                        <span>− {fmt(canTruTotal)} ₫</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border pt-1 mt-1 font-semibold">
                      <span>{item.la_coc ? "Số tiền cọc" : (canTruTotal > 0 ? "Thực thanh toán" : "Số tiền ĐNTT")}:</span>
                      <span className="text-primary">{fmt(thucTT)} ₫</span>
                    </div>
                  </div>
                );
              })()}

              {/* Ghi chú per-item */}
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Ghi chú</label>
                <Textarea
                  value={item.ghiChu ?? ""}
                  onChange={(e) => updateItem(i, { ghiChu: e.target.value })}
                  rows={2}
                  className="text-xs resize-none"
                  placeholder="Ghi chú cho ĐNTT này..."
                />
              </div>
            </div>
          ))}

          {/* Người đề nghị (shared across all items in batch) */}
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
