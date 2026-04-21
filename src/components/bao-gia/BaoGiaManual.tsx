import { useState, useEffect } from "react";
import { nanoid } from "nanoid";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { useExtractChuongTrinh } from "@/hooks/use-bao-gia";
import { useBangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";
import { calcBaoGia, type ManualItem } from "@/lib/bao-gia-calc";
import type { BaoGiaKetQua } from "@/hooks/use-bao-gia";
import { toast } from "sonner";

const LOAI_OPTIONS = [
  { value: "hotel", label: "Khách sạn" },
  { value: "meal", label: "Bữa ăn" },
  { value: "ticket", label: "Vé/Tham quan" },
  { value: "extra", label: "Chi phí khác" },
] as const;

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface BaoGiaManualProps {
  onSave: (ketQua: BaoGiaKetQua, exchangeRate: number, profitUsd: number) => void;
}

export function BaoGiaManual({ onSave }: BaoGiaManualProps) {
  const [rawText, setRawText] = useState("");
  const [tenChuongTrinh, setTenChuongTrinh] = useState("");
  const [soNgay, setSoNgay] = useState(5);
  const [exchangeRate, setExchangeRate] = useState(26000);
  const [profitUsd, setProfitUsd] = useState(15);
  const [tienXe, setTienXe] = useState(0);
  const [tienPhuThu, setTienPhuThu] = useState(0);
  const [items, setItems] = useState<ManualItem[]>([]);
  const [ketQua, setKetQua] = useState<BaoGiaKetQua | null>(null);

  const extractMutation = useExtractChuongTrinh();
  const { data: bangGia = [] } = useBangGiaDichVu();

  useEffect(() => {
    const priced = items.filter((i) => i.gia !== null);
    if (priced.length === 0 && tienXe === 0 && tienPhuThu === 0) { setKetQua(null); return; }
    setKetQua(calcBaoGia(items, tenChuongTrinh, soNgay, exchangeRate, profitUsd, tienXe, tienPhuThu));
  }, [items, tenChuongTrinh, soNgay, exchangeRate, profitUsd, tienXe, tienPhuThu]);

  const handleExtract = () => {
    if (!rawText.trim()) return;
    extractMutation.mutate(rawText, {
      onSuccess: (data) => {
        setTenChuongTrinh(data.ten_chuong_trinh || "");
        setSoNgay(data.so_ngay || 5);
        setItems(
          (data.items || []).map((item: any) => ({
            id: nanoid(),
            ngay: item.ngay,
            loai: item.loai,
            mo_ta_zh: item.mo_ta_zh,
            mo_ta_goi_y: item.mo_ta_goi_y,
            bang_gia_ten: "",
            gia: null,
          }))
        );
        toast.success(`Đã trích xuất ${data.items?.length ?? 0} dịch vụ`);
      },
      onError: () => toast.error("Lỗi trích xuất chương trình"),
    });
  };

  const addRow = () => {
    setItems((prev) => [
      ...prev,
      { id: nanoid(), ngay: 1, loai: "meal", mo_ta_zh: "", mo_ta_goi_y: "", bang_gia_ten: "", gia: null },
    ]);
  };

  const removeRow = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const updateRow = (id: string, patch: Partial<ManualItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  return (
    <div className="space-y-4">
      {/* Step 1 — paste */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          1. Paste chương trình tiếng Trung
        </Label>
        <Textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Dán nội dung chương trình tour tiếng Trung vào đây..."
          rows={5}
          className="text-xs font-mono resize-none"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={handleExtract} disabled={!rawText.trim() || extractMutation.isPending}>
            {extractMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Phân tích
          </Button>
        </div>
      </div>

      {/* Step 2 — service rows */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            2. Dịch vụ theo ngày
          </Label>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRow}>
            <Plus className="h-3 w-3 mr-1" />Thêm dòng
          </Button>
        </div>

        {items.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#E6F1FB]">
                  <th className="py-1.5 px-2 text-center font-semibold w-12">Ngày</th>
                  <th className="py-1.5 px-2 text-left font-semibold w-28">Loại</th>
                  <th className="py-1.5 px-2 text-left font-semibold">Mô tả</th>
                  <th className="py-1.5 px-2 text-left font-semibold">Dịch vụ VN</th>
                  <th className="py-1.5 px-2 text-right font-semibold w-28">Giá (VND)</th>
                  <th className="py-1.5 px-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-muted/10">
                    <td className="py-1 px-2 text-center">
                      <Input
                        type="number"
                        value={item.ngay}
                        onChange={(e) => updateRow(item.id, { ngay: parseInt(e.target.value) || 1 })}
                        className="h-6 w-10 text-xs text-center px-1"
                        min={1}
                      />
                    </td>
                    <td className="py-1 px-2">
                      <Select
                        value={item.loai}
                        onValueChange={(v) => updateRow(item.id, { loai: v as ManualItem["loai"] })}
                      >
                        <SelectTrigger className="h-6 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LOAI_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value} className="text-xs">
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1 px-2">
                      <Input
                        value={item.mo_ta_zh}
                        onChange={(e) => updateRow(item.id, { mo_ta_zh: e.target.value })}
                        className="h-6 text-xs"
                        placeholder={item.mo_ta_goi_y || "Mô tả..."}
                      />
                    </td>
                    <td className="py-1 px-2">
                      <ServiceCombobox
                        value={item.bang_gia_ten}
                        items={bangGia}
                        onSelect={(ten, gia) => updateRow(item.id, { bang_gia_ten: ten, gia })}
                        onClear={() => updateRow(item.id, { bang_gia_ten: "", gia: null })}
                      />
                    </td>
                    <td className="py-1 px-2">
                      <Input
                        type="number"
                        value={item.gia ?? ""}
                        onChange={(e) => updateRow(item.id, { gia: e.target.value ? parseInt(e.target.value) : null })}
                        className="h-6 text-xs w-full text-right"
                        placeholder="0"
                      />
                    </td>
                    <td className="py-1 px-2">
                      <Button
                        variant="ghost" size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            Nhấn "Phân tích" để trích xuất từ chương trình, hoặc thêm dòng thủ công.
          </p>
        )}
      </div>

      {/* Step 3 — params */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          3. Thông số tính giá
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
              onChange={(e) => setSoNgay(parseInt(e.target.value) || 1)}
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

      {/* Result */}
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
            <Button variant="outline" size="sm" onClick={() => onSave(ketQua, exchangeRate, profitUsd)}>
              Lưu nháp
            </Button>
            <Button size="sm" onClick={() => onSave(ketQua, exchangeRate, profitUsd)}>
              Lưu chính thức
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
