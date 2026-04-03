import { useEffect, useState } from "react";
import { useChiPhiList, useUpsertChiPhi, useDeleteChiPhi } from "@/hooks/use-chi-phi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
  xe: any; // xe object từ doan (join nha_xe_loai_xe)
}

function XeRow({ row, doanId }: { row: any; doanId: number }) {
  const upsertMut = useUpsertChiPhi();
  const deleteMut = useDeleteChiPhi();
  const [soLuong, setSoLuong] = useState(row.so_luong ?? 1);
  const [donGia, setDonGia] = useState(row.don_gia ?? 0);

  useEffect(() => {
    setSoLuong(row.so_luong ?? 1);
    setDonGia(row.don_gia ?? 0);
  }, [row.id]);

  const thanhTien = soLuong * donGia;

  const handleSave = () => {
    upsertMut.mutate({
      id: row.id,
      doan_id: doanId,
      so_luong: soLuong,
      don_gia: donGia,
      tien_cong_ty: thanhTien,
    } as any, {
      onSuccess: () => toast.success("Đã lưu"),
    });
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2.5 text-sm">{row.mo_ta}</td>
      <td className="px-4 py-2 w-20">
        <Input
          type="number"
          value={soLuong || ""}
          onChange={(e) => setSoLuong(Number(e.target.value) || 0)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
          className="h-6 text-xs text-center px-1"
        />
      </td>
      <td className="px-4 py-2 w-32">
        <Input
          type="number"
          value={donGia || ""}
          onChange={(e) => setDonGia(Number(e.target.value) || 0)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
          className="h-6 text-xs text-center px-1"
        />
      </td>
      <td className="px-4 py-2.5 text-right text-sm font-medium">{thanhTien > 0 ? fmt(thanhTien) + " ₫" : "—"}</td>
      <td className="px-2 py-2.5 w-8">
        <Button
          size="icon" variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => deleteMut.mutate({ id: row.id, doanId }, { onSuccess: () => toast.success("Đã xóa") })}
          disabled={deleteMut.isPending}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

export default function ChiPhiXeSection({ doanId, xe }: Props) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const upsertMut = useUpsertChiPhi();

  const xeRows = chiPhiRows.filter((r) => r.danh_muc === "xe");
  const total = xeRows.reduce((s, r) => s + r.tien_cong_ty, 0);

  // Tên xe từ doan
  const xeLabel = xe
    ? [xe.nha_xe?.ten, xe.ten_xe, xe.so_cho ? `${xe.so_cho} chỗ` : ""].filter(Boolean).join(" · ")
    : null;

  const handleAddXe = () => {
    if (!xeLabel) {
      toast.warning("Đoàn chưa chọn xe trong phần điều tour");
      return;
    }
    upsertMut.mutate({
      doan_id: doanId,
      danh_muc: "xe",
      loai: "xe",
      mo_ta: xeLabel,
      don_gia: 0,
      so_luong: 1,
      tien_cong_ty: 0,
      tien_hdv: 0,
      nha_cung_cap_id: xe?.nha_xe?.id ?? null,
    } as any, {
      onSuccess: () => toast.success("Đã thêm dòng xe"),
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">🚌 Xe</span>
          {xeLabel && <span className="text-xs text-muted-foreground">· {xeLabel}</span>}
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && <span className="text-sm font-semibold">{fmt(total)} ₫</span>}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAddXe} disabled={upsertMut.isPending}>
            + Thêm
          </Button>
        </div>
      </div>

      {xeRows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          {xeLabel ? `Bấm "+ Thêm" để ghi nhận chi phí xe.` : "Chưa có xe trong điều tour. Vào tab Điều Tour để chọn xe."}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Mô tả</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">SL</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Đơn giá</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Thành tiền</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {xeRows.map((row) => (
              <XeRow key={row.id} row={row} doanId={doanId} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
