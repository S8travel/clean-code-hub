import type { BaoGiaKetQua, BaoGiaItem } from "@/hooks/use-bao-gia";

const LOAI_LABEL: Record<string, string> = {
  hotel: "Khách sạn",
  meal: "Ăn uống",
  ticket: "Vé tham quan",
  transport: "Xe",
};

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtUsd = (n: number) => n.toFixed(2);

interface BaoGiaResultTableProps {
  ketQua: BaoGiaKetQua;
  onUpdateItem?: (index: number, field: "don_gia", value: number) => void;
}

export function BaoGiaResultTable({ ketQua, onUpdateItem }: BaoGiaResultTableProps) {
  const { case_16, case_20 } = ketQua;

  return (
    <div className="space-y-4 text-xs">
      {/* Header info */}
      <div className="flex gap-6 text-sm font-medium">
        <span className="text-blue-700">{ketQua.ten_chuong_trinh}</span>
        <span className="text-muted-foreground">{ketQua.so_ngay} ngày</span>
      </div>

      {/* 1. Bảng dịch vụ */}
      <div>
        <p className="font-semibold text-xs text-muted-foreground uppercase mb-1">Chi tiết dịch vụ</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#E6F1FB]">
              <th className="py-1.5 px-2 text-left font-semibold border border-border">Loại</th>
              <th className="py-1.5 px-2 text-left font-semibold border border-border">Mô tả</th>
              <th className="py-1.5 px-2 text-right font-semibold border border-border">Đơn giá</th>
              <th className="py-1.5 px-2 text-left font-semibold border border-border">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {ketQua.items.map((item: BaoGiaItem, i) => (
              <tr key={i} className="hover:bg-muted/20">
                <td className="py-1.5 px-2 border border-border whitespace-nowrap">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium
                    ${item.loai === "hotel" ? "bg-blue-100 text-blue-700" :
                      item.loai === "meal" ? "bg-green-100 text-green-700" :
                      item.loai === "ticket" ? "bg-orange-100 text-orange-700" :
                      "bg-purple-100 text-purple-700"}`}>
                    {LOAI_LABEL[item.loai] ?? item.loai}
                  </span>
                </td>
                <td className="py-1.5 px-2 border border-border">{item.mo_ta}</td>
                <td className="py-1.5 px-2 border border-border text-right">
                  {onUpdateItem ? (
                    <input
                      type="number"
                      className="w-28 text-right bg-transparent border-b border-dashed border-border focus:outline-none focus:border-blue-400"
                      value={item.don_gia}
                      onChange={(e) => onUpdateItem(i, "don_gia", parseFloat(e.target.value) || 0)}
                    />
                  ) : (
                    fmt(item.don_gia)
                  )}
                </td>
                <td className="py-1.5 px-2 border border-border text-muted-foreground">{item.ghi_chu}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2. Chi phí cố định */}
      <div>
        <p className="font-semibold text-xs text-muted-foreground uppercase mb-1">Chi phí cố định</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#E6F1FB]">
              <th className="py-1.5 px-2 text-left font-semibold border border-border">Khoản mục</th>
              <th className="py-1.5 px-2 text-right font-semibold border border-border">16 khách</th>
              <th className="py-1.5 px-2 text-right font-semibold border border-border">20 khách</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Bảo hiểm (100k × pax)", k: "insurance" as const },
              { label: `HDV (200k × ${ketQua.so_ngay} ngày)`, k: "guide" as const },
              { label: "Tips", k: "tips" as const },
            ].map(({ label, k }) => (
              <tr key={k} className="hover:bg-muted/20">
                <td className="py-1.5 px-2 border border-border">{label}</td>
                <td className="py-1.5 px-2 border border-border text-right">{fmt(case_16[k])}</td>
                <td className="py-1.5 px-2 border border-border text-right">{fmt(case_20[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 3. So sánh 2 case */}
      <div>
        <p className="font-semibold text-xs text-muted-foreground uppercase mb-1">So sánh 2 phương án</p>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#E6F1FB]">
              <th className="py-1.5 px-2 text-left font-semibold border border-border">Chỉ số</th>
              <th className="py-1.5 px-2 text-right font-semibold border border-border">16 khách (pax=17, phòng=9)</th>
              <th className="py-1.5 px-2 text-right font-semibold border border-border">20 khách (pax=21, phòng=11)</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Tổng khách sạn", k16: case_16.hotel, k20: case_20.hotel },
              { label: "Tổng ăn uống", k16: case_16.meal, k20: case_20.meal },
              { label: "Tổng vé tham quan", k16: case_16.ticket, k20: case_20.ticket },
              { label: "Xe", k16: case_16.transport, k20: case_20.transport },
              { label: "Tổng chi phí", k16: case_16.total_cost, k20: case_20.total_cost },
              { label: "Lợi nhuận (VND)", k16: case_16.profit_vnd, k20: case_20.profit_vnd },
            ].map(({ label, k16, k20 }) => (
              <tr key={label} className="hover:bg-muted/20">
                <td className="py-1.5 px-2 border border-border">{label}</td>
                <td className="py-1.5 px-2 border border-border text-right">{fmt(k16)}</td>
                <td className="py-1.5 px-2 border border-border text-right">{fmt(k20)}</td>
              </tr>
            ))}
            <tr className="bg-blue-50 font-semibold">
              <td className="py-1.5 px-2 border border-border">Giá/khách (VND)</td>
              <td className="py-1.5 px-2 border border-border text-right text-blue-700">{fmt(case_16.final_price_vnd)}</td>
              <td className="py-1.5 px-2 border border-border text-right text-blue-700">{fmt(case_20.final_price_vnd)}</td>
            </tr>
            <tr className="bg-blue-50 font-semibold">
              <td className="py-1.5 px-2 border border-border">Giá/khách (USD)</td>
              <td className="py-1.5 px-2 border border-border text-right text-blue-700">{fmtUsd(case_16.final_price_usd)}</td>
              <td className="py-1.5 px-2 border border-border text-right text-blue-700">{fmtUsd(case_20.final_price_usd)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4. Kết luận */}
      <div className="bg-blue-700 text-white rounded-lg p-4 text-center">
        <p className="text-xs uppercase tracking-wider mb-1 opacity-80">Giá đề xuất (trung bình 2 phương án)</p>
        <p className="text-2xl font-bold">{fmt(ketQua.gia_trung_binh_vnd)} VND</p>
        <p className="text-sm opacity-80">≈ {fmtUsd(ketQua.gia_trung_binh_usd)} USD / khách</p>
      </div>
    </div>
  );
}
