import { useState } from "react";
import { nanoid } from "nanoid";
import { Plus, Trash2, Calculator, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ServiceCombobox } from "@/components/bao-gia/ServiceCombobox";
import { BaoGiaResultTable } from "@/components/bao-gia/BaoGiaResultTable";
import { useBangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";
import { calcBaoGia, type ManualItem } from "@/lib/bao-gia-calc";
import { exportBaoGiaWord } from "@/lib/export-bao-gia-word";
import type { BaoGiaKetQua } from "@/hooks/use-bao-gia";
import { toast } from "sonner";

const LOAI_OPTIONS = [
  { value: "hotel", label: "Khách sạn" },
  { value: "meal", label: "Bữa ăn" },
  { value: "ticket", label: "Cảnh điểm" },
  { value: "extra", label: "Phí khác" },
] as const;

const LOAI_BADGE: Record<string, { label: string; cls: string }> = {
  hotel:  { label: "KS",  cls: "bg-blue-100 text-blue-700" },
  meal:   { label: "Ăn",  cls: "bg-green-100 text-green-700" },
  ticket: { label: "Vé",  cls: "bg-orange-100 text-orange-700" },
  extra:  { label: "Khác", cls: "bg-gray-100 text-gray-600" },
};

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface BaoGiaManualProps {
  onSave: (ketQua: BaoGiaKetQua, exchangeRate: number, profitUsd: number, trangThai: "draft" | "final") => void;
}

export function BaoGiaManual({ onSave }: BaoGiaManualProps) {
  const [tenChuongTrinh, setTenChuongTrinh] = useState("");
  const [soNgay, setSoNgay] = useState(5);
  const [exchangeRate, setExchangeRate] = useState(26000);
  const [profitUsd, setProfitUsd] = useState(15);
  const [tienXe, setTienXe] = useState(0);
  const [tienPhuThu, setTienPhuThu] = useState(0);
  const [items, setItems] = useState<ManualItem[]>([]);
  const [ketQua, setKetQua] = useState<BaoGiaKetQua | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: bangGia = [] } = useBangGiaDichVu();

  const addRowForDay = (ngay: number) => {
    setItems((prev) => [
      ...prev,
      { id: nanoid(), ngay, loai: "meal", mo_ta: "", bang_gia_ten: "", gia: null },
    ]);
  };

  const removeRow = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const updateRow = (id: string, patch: Partial<ManualItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const handleTinhGia = () => {
    const priced = items.filter((i) => i.gia !== null && i.gia > 0);
    if (priced.length === 0 && tienXe === 0 && tienPhuThu === 0) {
      toast.error("Chưa có dịch vụ nào có giá");
      return;
    }
    setKetQua(calcBaoGia(items, tenChuongTrinh, soNgay, exchangeRate, profitUsd, tienXe, tienPhuThu));
  };

  const handleExport = async () => {
    if (!ketQua) return;
    setIsExporting(true);
    try {
      await exportBaoGiaWord(ketQua, exchangeRate, profitUsd);
      toast.success("Đã xuất file báo giá!");
    } catch {
      toast.error("Lỗi xuất file");
    } finally {
      setIsExporting(false);
    }
  };

  const days = Array.from({ length: soNgay }, (_, i) => i + 1);

  return (
    <div className="space-y-5">
      {/* Thông số */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Thông số
        </Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Tên chương trình</Label>
            <Input
              value={tenChuongTrinh}
              onChange={(e) => setTenChuongTrinh(e.target.value)}
              className="h-7 text-xs"
              placeholder="VD: Hà Nội 5N4Đ"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Số ngày</Label>
            <Input
              type="number"
              value={soNgay}
              onChange={(e) => setSoNgay(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-7 text-xs"
              min={1}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tỷ giá (VND/USD)</Label>
            <Input
              type="number"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(parseInt(e.target.value) || 26000)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lợi nhuận/khách (USD)</Label>
            <Input
              type="number"
              value={profitUsd}
              onChange={(e) => setProfitUsd(parseInt(e.target.value) || 0)}
              className="h-7 text-xs"
              min={0}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tiền xe — cả đoàn (VND)</Label>
            <Input
              type="number"
              value={tienXe || ""}
              onChange={(e) => setTienXe(parseInt(e.target.value) || 0)}
              className="h-7 text-xs"
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phụ thu — cả đoàn (VND)</Label>
            <Input
              type="number"
              value={tienPhuThu || ""}
              onChange={(e) => setTienPhuThu(parseInt(e.target.value) || 0)}
              className="h-7 text-xs"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      {/* Bảng chương trình theo ngày */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Chương trình
        </Label>
        <div className="border rounded-lg overflow-hidden">
          {days.map((ngayIdx) => {
            const dayItems = items.filter((item) => item.ngay === ngayIdx);
            return (
              <div key={ngayIdx} className="border-b last:border-0">
                {/* Day header */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#E6F1FB]">
                  <span className="text-xs font-bold text-blue-800">D{ngayIdx}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-blue-700 hover:text-blue-900 hover:bg-blue-100 px-2"
                    onClick={() => addRowForDay(ngayIdx)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Thêm dịch vụ
                  </Button>
                </div>

                {/* Items */}
                {dayItems.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-3 py-2 italic">
                    Chưa có dịch vụ — nhấn "+ Thêm dịch vụ"
                  </p>
                ) : (
                  <div className="divide-y">
                    {dayItems.map((item) => {
                      const badge = LOAI_BADGE[item.loai] ?? LOAI_BADGE.extra;
                      return (
                        <div key={item.id} className="flex items-center gap-2 px-3 py-1.5">
                          {/* Loại */}
                          <Select
                            value={item.loai}
                            onValueChange={(v) =>
                              updateRow(item.id, { loai: v as ManualItem["loai"] })
                            }
                          >
                            <SelectTrigger className="h-6 w-[90px] text-xs px-1.5 shrink-0">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {LOAI_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value} className="text-xs">
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Service combobox */}
                          <div className="flex-1 min-w-0">
                            <ServiceCombobox
                              value={item.bang_gia_ten}
                              items={bangGia}
                              onSelect={(ten, gia) =>
                                updateRow(item.id, { bang_gia_ten: ten, mo_ta: ten, gia })
                              }
                              onClear={() =>
                                updateRow(item.id, { bang_gia_ten: "", mo_ta: "", gia: null })
                              }
                              placeholder="Chọn dịch vụ..."
                            />
                          </div>

                          {/* Giá */}
                          <Input
                            type="number"
                            value={item.gia ?? ""}
                            onChange={(e) =>
                              updateRow(item.id, {
                                gia: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            className="h-6 text-xs w-28 text-right shrink-0"
                            placeholder="Giá VND"
                          />

                          {/* Xóa */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(item.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Nút Tính giá */}
      <div className="flex justify-center pt-1">
        <Button onClick={handleTinhGia} className="px-8">
          <Calculator className="h-4 w-4 mr-2" />
          Tính giá
        </Button>
      </div>

      {/* Kết quả */}
      {ketQua && (
        <div className="space-y-3">
          {/* Params summary */}
          <div className="bg-muted/40 border rounded-lg px-3 py-2 text-xs grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
            <div><span className="text-muted-foreground">Chương trình:</span> <strong>{tenChuongTrinh || "—"}</strong></div>
            <div><span className="text-muted-foreground">Số ngày:</span> <strong>{soNgay}</strong></div>
            <div><span className="text-muted-foreground">Tỷ giá:</span> <strong>{fmt(exchangeRate)} VND/USD</strong></div>
            <div><span className="text-muted-foreground">LN/khách:</span> <strong>{profitUsd} USD ({fmt(profitUsd * exchangeRate)} VND)</strong></div>
            {tienXe > 0 && <div><span className="text-muted-foreground">Tiền xe:</span> <strong>{fmt(tienXe)} VND</strong></div>}
            {tienPhuThu > 0 && <div><span className="text-muted-foreground">Phụ thu:</span> <strong>{fmt(tienPhuThu)} VND</strong></div>}
          </div>

          <div className="border rounded-lg p-3">
            <BaoGiaResultTable ketQua={ketQua} />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5 mr-1.5" />
              )}
              Xuất file báo giá
            </Button>
            <Button variant="outline" size="sm" onClick={() => onSave(ketQua, exchangeRate, profitUsd, "draft")}>
              Lưu nháp
            </Button>
            <Button size="sm" onClick={() => onSave(ketQua, exchangeRate, profitUsd, "final")}>
              Lưu chính thức
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
