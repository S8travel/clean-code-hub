import { useEffect, useState } from "react";
import { Users, ArrowRightLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useUpdateBaoGia, type BaoGiaKetQua, type BaoGiaRow } from "@/hooks/use-bao-gia";
import { paxOf, fmtVnd } from "./helpers";

interface Props {
  row: BaoGiaRow;
}

// Wire 8 inputs persist qua useUpdateBaoGia, save on blur.
// 5 field DB column: exchange_rate, profit_usd, ngay_di, ngay_ve, ghi_chu.
// 3 field nằm trong ket_qua jsonb: ten_chuong_trinh, so_ngay, pax (update
// đồng thời case_16.guests + case_20.guests cho consistent). Khi save jsonb
// → merge với ket_qua hiện tại, KHÔNG overwrite các field khác.
export function ThongTinTourSection({ row }: Props) {
  const ket = row.ket_qua;
  const update = useUpdateBaoGia();

  const [exchangeRate, setExchangeRate] = useState(String(row.exchange_rate ?? 26000));
  const [profitUsd, setProfitUsd] = useState(String(row.profit_usd ?? 0));
  const [ngayDi, setNgayDi] = useState(row.ngay_di ?? "");
  const [ngayVe, setNgayVe] = useState(row.ngay_ve ?? "");
  const [ghiChu, setGhiChu] = useState(row.ghi_chu ?? "");
  const [tenCt, setTenCt] = useState(ket?.ten_chuong_trinh ?? "");
  const [soNgay, setSoNgay] = useState(String(ket?.so_ngay ?? 0));
  const [pax, setPax] = useState(String(paxOf(ket)));

  useEffect(() => { setExchangeRate(String(row.exchange_rate ?? 26000)); }, [row.exchange_rate]);
  useEffect(() => { setProfitUsd(String(row.profit_usd ?? 0)); }, [row.profit_usd]);
  useEffect(() => { setNgayDi(row.ngay_di ?? ""); }, [row.ngay_di]);
  useEffect(() => { setNgayVe(row.ngay_ve ?? ""); }, [row.ngay_ve]);
  useEffect(() => { setGhiChu(row.ghi_chu ?? ""); }, [row.ghi_chu]);
  useEffect(() => { setTenCt(ket?.ten_chuong_trinh ?? ""); }, [ket?.ten_chuong_trinh]);
  useEffect(() => { setSoNgay(String(ket?.so_ngay ?? 0)); }, [ket?.so_ngay]);
  useEffect(() => { setPax(String(paxOf(ket))); }, [ket]);

  const save = (patch: Partial<BaoGiaRow>) => {
    update.mutate(
      { id: row.id, ...patch },
      { onError: () => toast.error("Lỗi lưu") },
    );
  };

  // Save 1 field trong ket_qua jsonb: merge với ket hiện tại + lưu nguyên cục.
  const saveKetQua = (patch: Partial<BaoGiaKetQua>) => {
    if (!ket) return;
    const next: BaoGiaKetQua = { ...ket, ...patch };
    save({ ket_qua: next });
  };

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3">
        Thông tin tour
      </h2>
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <Label className="text-xs text-slate-600">Tên chương trình *</Label>
          <Input
            value={tenCt}
            onChange={(e) => setTenCt(e.target.value)}
            onBlur={() => {
              const v = tenCt.trim();
              if (v && v !== ket?.ten_chuong_trinh) saveKetQua({ ten_chuong_trinh: v });
            }}
            className="h-9 mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Số ngày *</Label>
          <Input
            type="number"
            min={1}
            value={soNgay}
            onChange={(e) => setSoNgay(e.target.value)}
            onBlur={() => {
              const v = parseInt(soNgay, 10);
              if (!isNaN(v) && v >= 1 && v !== ket?.so_ngay) saveKetQua({ so_ngay: v });
            }}
            className="h-9 mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Số khách (pax) *</Label>
          <div className="relative mt-1">
            <Input
              type="number"
              min={1}
              value={pax}
              onChange={(e) => setPax(e.target.value)}
              onBlur={() => {
                const v = parseInt(pax, 10);
                if (!isNaN(v) && v >= 1 && v !== paxOf(ket) && ket) {
                  // Update both case_16 + case_20 (cùng pax mới) để giữ
                  // consistent với UI primary case. Cost numbers cũ sẽ stale
                  // cho tới khi re-tính P3 engine.
                  const next: BaoGiaKetQua = {
                    ...ket,
                    case_16: ket.case_16 ? { ...ket.case_16, guests: v } : ket.case_16,
                    case_20: ket.case_20 ? { ...ket.case_20, guests: v } : ket.case_20,
                  };
                  save({ ket_qua: next });
                }
              }}
              className="h-9 pr-8"
            />
            <Users className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Tỷ giá *</Label>
          <div className="flex items-center gap-1 mt-1">
            <Input value="VND" readOnly className="h-9 bg-slate-50 flex-1" />
            <div className="relative flex-1">
              <Input
                type="number"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(exchangeRate);
                  if (!isNaN(v) && v > 0 && v !== row.exchange_rate) save({ exchange_rate: v });
                }}
                className="h-9 pr-7"
              />
              <ArrowRightLeft className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">{fmtVnd(parseFloat(exchangeRate) || 0)} VND/USD</p>
        </div>

        <div className="col-span-3">
          <Label className="text-xs text-slate-600">Ngày khởi hành</Label>
          <Input
            type="date"
            value={ngayDi}
            onChange={(e) => setNgayDi(e.target.value)}
            onBlur={() => { if (ngayDi !== (row.ngay_di ?? "")) save({ ngay_di: ngayDi || null }); }}
            className="h-9 mt-1"
          />
        </div>
        <div className="col-span-3">
          <Label className="text-xs text-slate-600">Ngày kết thúc</Label>
          <Input
            type="date"
            value={ngayVe}
            onChange={(e) => setNgayVe(e.target.value)}
            onBlur={() => { if (ngayVe !== (row.ngay_ve ?? "")) save({ ngay_ve: ngayVe || null }); }}
            className="h-9 mt-1"
          />
        </div>
        <div className="col-span-6">
          <Label className="text-xs text-slate-600">Profit target</Label>
          <div className="flex items-center gap-1 mt-1">
            <Input
              type="number"
              value={profitUsd}
              onChange={(e) => setProfitUsd(e.target.value)}
              onBlur={() => {
                const v = parseFloat(profitUsd);
                if (!isNaN(v) && v !== row.profit_usd) save({ profit_usd: v });
              }}
              className="h-9 flex-1"
            />
            <span className="text-xs text-slate-500 px-2 whitespace-nowrap">USD / pax</span>
          </div>
        </div>

        <div className="col-span-12">
          <Label className="text-xs text-slate-600">Ghi chú</Label>
          <Input
            placeholder="Nhập ghi chú nếu có..."
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            onBlur={() => { if (ghiChu !== (row.ghi_chu ?? "")) save({ ghi_chu: ghiChu || null }); }}
            className="h-9 mt-1"
          />
        </div>
      </div>
    </section>
  );
}
