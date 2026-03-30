import { useState } from "react";
import { useChiPhiList, useDNTTList } from "@/hooks/use-chi-phi";
import DNTTCell from "./DNTTCell";
import ThanhToanCell from "./ThanhToanCell";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
  tenDoan?: string;
}

export default function ChiPhiDVSection({ doanId, tenDoan }: Props) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const [selectedDnttIds, setSelectedDnttIds] = useState<Set<number>>(new Set());

  const dvRows = chiPhiRows.filter(
    (r) => r.danh_muc === "canh_diem" && r.tien_cong_ty > 0,
  );

  if (dvRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        🎫 Chưa có dịch vụ nào (có phí, công ty trả) trong chương trình.
        <br />
        <span className="text-xs">Vào mục Điều Tour → thêm dịch vụ có phí vào chương trình ngày.</span>
      </div>
    );
  }

  const total = dvRows.reduce((s, r) => s + r.tien_cong_ty, 0);

  const toggleDntt = (id: number) => {
    setSelectedDnttIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Nhóm theo ngày
  const byDay = new Map<number, typeof dvRows>();
  for (const row of dvRows) {
    const day = row.ngay_so ?? 0;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(row);
  }
  const sortedDays = [...byDay.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
        <p className="text-sm font-semibold">🎫 Dịch vụ</p>
        <span className="text-xs text-muted-foreground">Tổng: {fmt(total)} ₫</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-16">Ngày</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Dịch vụ</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground w-12">SL</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Đơn giá</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Thành tiền</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Đề nghị TT</th>
              <th className="px-4 py-2 text-xs font-medium text-muted-foreground">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedDays.map(([day, rows]) =>
              rows.map((row, i) => (
                <tr key={row.id} className="hover:bg-muted/20">
                  {i === 0 && (
                    <td
                      className="px-4 py-2.5 text-xs text-muted-foreground align-top"
                      rowSpan={rows.length}
                    >
                      {day > 0 ? `Ngày ${day}` : "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5 font-medium">{row.mo_ta || "—"}</td>
                  <td className="px-4 py-2.5 text-right text-xs">{row.so_luong}</td>
                  <td className="px-4 py-2.5 text-right text-xs">{fmt(row.don_gia)} ₫</td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmt(row.tien_cong_ty)} ₫</td>
                  <td className="px-4 py-2.5">
                    <DNTTCell
                      chiPhiId={row.id}
                      doanId={doanId}
                      thanhTien={row.tien_cong_ty}
                      moTa={row.mo_ta || tenDoan || "Dịch vụ"}
                      loai="dich_vu"
                      dnttList={dnttList}
                      selectedDnttIds={selectedDnttIds}
                      onToggleDntt={toggleDntt}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <ThanhToanCell chiPhiId={row.id} dnttList={dnttList} />
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
