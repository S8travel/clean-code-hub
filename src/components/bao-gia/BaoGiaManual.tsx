import { useState } from "react";
import { nanoid } from "nanoid";
import { Plus, Trash2, Calculator, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ServiceCombobox } from "@/components/bao-gia/ServiceCombobox";
import { BaoGiaResultTable } from "@/components/bao-gia/BaoGiaResultTable";
import { useBangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";
import { calcBaoGia, type ManualItem } from "@/lib/bao-gia-calc";
import { exportBaoGiaWord } from "@/lib/export-bao-gia-word";
import type { BaoGiaKetQua } from "@/hooks/use-bao-gia";
import { toast } from "sonner";

interface Slot {
  bang_gia_ten: string;
  gia: number | null;
}

interface CanhDiemItem {
  id: string;
  bang_gia_ten: string;
  gia: number | null;
}

interface DayData {
  canhDiem: CanhDiemItem[];
  anTrua: Slot;
  anToi: Slot;
  khachSan: Slot;
}

function emptyDay(): DayData {
  return {
    canhDiem: [],
    anTrua: { bang_gia_ten: "", gia: null },
    anToi: { bang_gia_ten: "", gia: null },
    khachSan: { bang_gia_ten: "", gia: null },
  };
}

function flattenDays(dayData: Record<number, DayData>, soNgay: number): ManualItem[] {
  const items: ManualItem[] = [];
  for (let ngay = 1; ngay <= soNgay; ngay++) {
    const d = dayData[ngay] ?? emptyDay();
    d.canhDiem.forEach((cd) => {
      if (cd.gia) items.push({ id: cd.id, ngay, loai: "ticket", mo_ta: cd.bang_gia_ten, bang_gia_ten: cd.bang_gia_ten, gia: cd.gia });
    });
    if (d.anTrua.gia) items.push({ id: `d${ngay}-trua`, ngay, loai: "meal", mo_ta: d.anTrua.bang_gia_ten || "Ăn trưa", bang_gia_ten: d.anTrua.bang_gia_ten, gia: d.anTrua.gia });
    if (d.anToi.gia)  items.push({ id: `d${ngay}-toi`,  ngay, loai: "meal", mo_ta: d.anToi.bang_gia_ten  || "Ăn tối",  bang_gia_ten: d.anToi.bang_gia_ten,  gia: d.anToi.gia });
    if (d.khachSan.gia) items.push({ id: `d${ngay}-ks`, ngay, loai: "hotel", mo_ta: d.khachSan.bang_gia_ten || "Khách sạn", bang_gia_ten: d.khachSan.bang_gia_ten, gia: d.khachSan.gia });
  }
  return items;
}

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
  const [dayData, setDayData] = useState<Record<number, DayData>>({});
  const [ketQua, setKetQua] = useState<BaoGiaKetQua | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: bangGia = [] } = useBangGiaDichVu();
  const dichVuItems = bangGia.filter((b) => b.loai === "dich_vu");
  const nhaHangItems = bangGia.filter((b) => b.loai === "nha_hang");
  const hotelItems = bangGia.filter((b) => b.loai === "hotel");

  const getDay = (ngay: number): DayData => dayData[ngay] ?? emptyDay();

  const setDay = (ngay: number, patch: Partial<DayData>) =>
    setDayData((prev) => ({ ...prev, [ngay]: { ...getDay(ngay), ...patch } }));

  const addCanhDiem = (ngay: number) =>
    setDay(ngay, { canhDiem: [...getDay(ngay).canhDiem, { id: nanoid(), bang_gia_ten: "", gia: null }] });

  const updateCanhDiem = (ngay: number, id: string, patch: Partial<CanhDiemItem>) =>
    setDay(ngay, {
      canhDiem: getDay(ngay).canhDiem.map((cd) => (cd.id === id ? { ...cd, ...patch } : cd)),
    });

  const removeCanhDiem = (ngay: number, id: string) =>
    setDay(ngay, { canhDiem: getDay(ngay).canhDiem.filter((cd) => cd.id !== id) });

  const handleTinhGia = () => {
    const items = flattenDays(dayData, soNgay);
    if (items.length === 0 && tienXe === 0 && tienPhuThu === 0) {
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
            <Input value={tenChuongTrinh} onChange={(e) => setTenChuongTrinh(e.target.value)} className="h-7 text-xs" placeholder="VD: Hà Nội 5N4Đ" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Số ngày</Label>
            <Input type="number" value={soNgay} onChange={(e) => setSoNgay(Math.max(1, parseInt(e.target.value) || 1))} className="h-7 text-xs" min={1} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tỷ giá (VND/USD)</Label>
            <Input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(parseInt(e.target.value) || 26000)} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lợi nhuận/khách (USD)</Label>
            <Input type="number" value={profitUsd} onChange={(e) => setProfitUsd(parseInt(e.target.value) || 0)} className="h-7 text-xs" min={0} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tiền xe — cả đoàn (VND)</Label>
            <Input type="number" value={tienXe || ""} onChange={(e) => setTienXe(parseInt(e.target.value) || 0)} className="h-7 text-xs" placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phụ thu — cả đoàn (VND)</Label>
            <Input type="number" value={tienPhuThu || ""} onChange={(e) => setTienPhuThu(parseInt(e.target.value) || 0)} className="h-7 text-xs" placeholder="0" />
          </div>
        </div>
      </div>

      {/* Bảng chương trình theo ngày */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Chương trình
        </Label>
        <div className="border rounded-lg overflow-hidden">
          {days.map((ngay) => {
            const d = getDay(ngay);
            return (
              <div key={ngay} className="border-b last:border-0">
                {/* Day header */}
                <div className="px-3 py-1.5 bg-[#E6F1FB]">
                  <span className="text-xs font-bold text-blue-800">D{ngay}</span>
                </div>

                <div className="px-3 py-2 space-y-2">
                  {/* Cảnh điểm */}
                  <div className="flex gap-2">
                    <span className="w-20 text-xs font-medium text-muted-foreground pt-1 shrink-0">Cảnh điểm</span>
                    <div className="flex-1 space-y-1">
                      {d.canhDiem.map((cd) => (
                        <div key={cd.id} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <ServiceCombobox
                              value={cd.bang_gia_ten}
                              items={dichVuItems}
                              onSelect={(ten, gia) => updateCanhDiem(ngay, cd.id, { bang_gia_ten: ten, gia })}
                              onClear={() => updateCanhDiem(ngay, cd.id, { bang_gia_ten: "", gia: null })}
                              placeholder="Chọn cảnh điểm..."
                            />
                          </div>
                          <Input
                            type="number"
                            value={cd.gia ?? ""}
                            onChange={(e) => updateCanhDiem(ngay, cd.id, { gia: e.target.value ? parseInt(e.target.value) : null })}
                            className="h-6 text-xs w-28 text-right shrink-0"
                            placeholder="Giá VND"
                          />
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCanhDiem(ngay, cd.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground px-0 hover:text-foreground" onClick={() => addCanhDiem(ngay)}>
                        <Plus className="h-3 w-3 mr-1" />Thêm cảnh điểm
                      </Button>
                    </div>
                  </div>

                  {/* Ăn trưa */}
                  <SlotRow
                    label="Ăn trưa"
                    slot={d.anTrua}
                    items={nhaHangItems}
                    placeholder="Chọn nhà hàng..."
                    onSelect={(ten, gia) => setDay(ngay, { anTrua: { bang_gia_ten: ten, gia } })}
                    onClear={() => setDay(ngay, { anTrua: { bang_gia_ten: "", gia: null } })}
                    onPrice={(gia) => setDay(ngay, { anTrua: { ...d.anTrua, gia } })}
                  />

                  {/* Ăn tối */}
                  <SlotRow
                    label="Ăn tối"
                    slot={d.anToi}
                    items={nhaHangItems}
                    placeholder="Chọn nhà hàng..."
                    onSelect={(ten, gia) => setDay(ngay, { anToi: { bang_gia_ten: ten, gia } })}
                    onClear={() => setDay(ngay, { anToi: { bang_gia_ten: "", gia: null } })}
                    onPrice={(gia) => setDay(ngay, { anToi: { ...d.anToi, gia } })}
                  />

                  {/* Khách sạn */}
                  <SlotRow
                    label="Khách sạn"
                    slot={d.khachSan}
                    items={hotelItems}
                    placeholder="Chọn khách sạn..."
                    onSelect={(ten, gia) => setDay(ngay, { khachSan: { bang_gia_ten: ten, gia } })}
                    onClear={() => setDay(ngay, { khachSan: { bang_gia_ten: "", gia: null } })}
                    onPrice={(gia) => setDay(ngay, { khachSan: { ...d.khachSan, gia } })}
                  />
                </div>
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
            <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1.5" />}
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

// ── Slot row (Ăn trưa / Ăn tối / Khách sạn) ─────────────────────────────────
import type { BangGiaDichVu } from "@/hooks/use-bang-gia-dich-vu";

function SlotRow({
  label,
  slot,
  items,
  placeholder,
  onSelect,
  onClear,
  onPrice,
}: {
  label: string;
  slot: Slot;
  items: BangGiaDichVu[];
  placeholder: string;
  onSelect: (ten: string, gia: number) => void;
  onClear: () => void;
  onPrice: (gia: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs font-medium text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 min-w-0">
        <ServiceCombobox value={slot.bang_gia_ten} items={items} onSelect={onSelect} onClear={onClear} placeholder={placeholder} />
      </div>
      <Input
        type="number"
        value={slot.gia ?? ""}
        onChange={(e) => onPrice(e.target.value ? parseInt(e.target.value) : null)}
        className="h-6 text-xs w-28 text-right shrink-0"
        placeholder="Giá VND"
      />
    </div>
  );
}
