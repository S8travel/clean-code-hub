import { useEffect, useState } from "react";
import { Users, ArrowRightLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useUpdateBaoGia, type BaoGiaRow } from "@/hooks/use-bao-gia";
import { paxOf, fmtVnd } from "./helpers";

interface Props {
  row: BaoGiaRow;
}

// P2 — wire 5 inputs persist qua useUpdateBaoGia: exchange_rate, profit_usd,
// ngay_di, ngay_ve, ghi_chu. Save on blur (KHÔNG dùng form). Inputs đọc từ
// ket_qua jsonb (tên chương trình / số ngày / pax) vẫn read-only — cần
// re-save toàn ket_qua nên hoãn lại phase sau.
export function ThongTinTourSection({ row }: Props) {
  const ket = row.ket_qua;
  const pax = paxOf(ket);
  const update = useUpdateBaoGia();

  // Controlled state, sync khi row đổi (refetch sau save / chuyển báo giá khác)
  const [exchangeRate, setExchangeRate] = useState(String(row.exchange_rate ?? 26000));
  const [profitUsd, setProfitUsd] = useState(String(row.profit_usd ?? 0));
  const [ngayDi, setNgayDi] = useState(row.ngay_di ?? "");
  const [ngayVe, setNgayVe] = useState(row.ngay_ve ?? "");
  const [ghiChu, setGhiChu] = useState(row.ghi_chu ?? "");
  useEffect(() => { setExchangeRate(String(row.exchange_rate ?? 26000)); }, [row.exchange_rate]);
  useEffect(() => { setProfitUsd(String(row.profit_usd ?? 0)); }, [row.profit_usd]);
  useEffect(() => { setNgayDi(row.ngay_di ?? ""); }, [row.ngay_di]);
  useEffect(() => { setNgayVe(row.ngay_ve ?? ""); }, [row.ngay_ve]);
  useEffect(() => { setGhiChu(row.ghi_chu ?? ""); }, [row.ghi_chu]);

  const save = (patch: Partial<BaoGiaRow>) => {
    update.mutate(
      { id: row.id, ...patch },
      { onError: () => toast.error("Lỗi lưu") },
    );
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
            value={ket?.ten_chuong_trinh || ""}
            readOnly
            className="h-9 mt-1 bg-slate-50"
            title="Tên đang lưu trong ket_qua jsonb — edit sẽ wire ở phase sau"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Số ngày *</Label>
          <Input
            type="number"
            value={ket?.so_ngay || 0}
            readOnly
            className="h-9 mt-1 bg-slate-50"
            title="Đang lưu trong ket_qua jsonb — phase sau wire"
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Số khách (pax) *</Label>
          <div className="relative mt-1">
            <Input
              type="number"
              value={pax}
              readOnly
              className="h-9 bg-slate-50 pr-8"
              title="Đang đọc từ case_16.guests — phase sau wire pax_tiers"
            />
            <Users className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
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
