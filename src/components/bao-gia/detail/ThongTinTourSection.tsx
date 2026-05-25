import { Users, ArrowRightLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BaoGiaRow } from "@/hooks/use-bao-gia";
import { paxOf, fmtVnd } from "./helpers";

interface Props {
  row: BaoGiaRow;
}

// P1 shell — display only. Inputs có vẻ editable nhưng KHÔNG persist (schema
// chưa có các field: ngay_di/ngay_ve/ghi_chu/profit_target/pax thực).
// P2 sẽ ALTER + wire vào DB.
export function ThongTinTourSection({ row }: Props) {
  const ket = row.ket_qua;
  const pax = paxOf(ket);
  const xr = row.exchange_rate ?? 26000;

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
          />
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Số ngày *</Label>
          <Input
            type="number"
            value={ket?.so_ngay || 0}
            readOnly
            className="h-9 mt-1 bg-slate-50"
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
            />
            <Users className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>
        <div className="col-span-2">
          <Label className="text-xs text-slate-600">Tỷ giá *</Label>
          <div className="flex items-center gap-1 mt-1">
            <Input value="VND" readOnly className="h-9 bg-slate-50 flex-1" />
            <div className="relative flex-1">
              <Input value={fmtVnd(xr)} readOnly className="h-9 bg-slate-50 pr-7" />
              <ArrowRightLeft className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>
        </div>

        <div className="col-span-3">
          <Label className="text-xs text-slate-600">Ngày khởi hành</Label>
          <Input
            placeholder="—"
            readOnly
            className="h-9 mt-1 bg-slate-50"
            title="Schema chưa có ngày khởi hành — P2 sẽ thêm bao_gia.ngay_di"
          />
        </div>
        <div className="col-span-3">
          <Label className="text-xs text-slate-600">Ngày kết thúc</Label>
          <Input
            placeholder="—"
            readOnly
            className="h-9 mt-1 bg-slate-50"
            title="Schema chưa có ngày kết thúc"
          />
        </div>
        <div className="col-span-6">
          <Label className="text-xs text-slate-600">Profit target</Label>
          <div className="flex items-center gap-1 mt-1">
            <Input
              type="number"
              value={row.profit_usd ?? 0}
              readOnly
              className="h-9 bg-slate-50 flex-1"
            />
            <span className="text-xs text-slate-500 px-2 whitespace-nowrap">USD / pax</span>
          </div>
        </div>

        <div className="col-span-12">
          <Label className="text-xs text-slate-600">Ghi chú</Label>
          <Input
            placeholder="Nhập ghi chú nếu có..."
            readOnly
            className="h-9 mt-1 bg-slate-50"
            title="Schema chưa có ghi_chu"
          />
        </div>
      </div>
    </section>
  );
}
