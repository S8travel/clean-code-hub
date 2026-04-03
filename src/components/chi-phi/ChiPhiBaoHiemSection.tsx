import { useEffect, useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChiPhiList, useUpsertChiPhi } from "@/hooks/use-chi-phi";
import { useCanhDiemList } from "@/hooks/use-canh-diem";
import { toast } from "sonner";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
  soKhach: number;
  ngayDi: string | null;
  ngayVe: string | null;
}

export default function ChiPhiBaoHiemSection({ doanId, soKhach, ngayDi, ngayVe }: Props) {
  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: canhDiemList = [] } = useCanhDiemList();
  const upsertMut = useUpsertChiPhi();

  // Tìm record bảo hiểm trong danh mục cảnh điểm (loai = "dich_vu", ten chứa "bảo hiểm")
  const baoHiemCD = canhDiemList.find(
    (cd) => cd.loai === "dich_vu" && cd.ten.toLowerCase().includes("bảo hiểm")
  );
  const nccId = (baoHiemCD as any)?.nha_cung_cap_id ?? null;
  const giaMacDinh = baoHiemCD?.gia_mac_dinh ?? 0;

  const soNgay = ngayDi && ngayVe
    ? Math.max(1, differenceInDays(parseISO(ngayVe), parseISO(ngayDi)) + 1)
    : 0;

  const existing = chiPhiRows.find((r) => r.danh_muc === "bao_hiem");
  const [donGia, setDonGia] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Sync: ưu tiên giá đã lưu, fallback về giá mặc định từ danh mục
  useEffect(() => {
    if (existing) {
      setDonGia(existing.don_gia ?? 0);
    } else if (giaMacDinh) {
      setDonGia(giaMacDinh);
    }
  }, [existing?.id, giaMacDinh]);

  const thanhTien = soKhach * soNgay * donGia;

  const handleSave = async () => {
    if (!soKhach || !soNgay) {
      toast.warning("Đoàn chưa có số khách hoặc ngày đi/về");
      return;
    }
    setSaving(true);
    try {
      await upsertMut.mutateAsync({
        ...(existing ? { id: existing.id } : {}),
        doan_id: doanId,
        danh_muc: "bao_hiem",
        loai: "bao_hiem",
        mo_ta: baoHiemCD ? `Bảo hiểm - ${baoHiemCD.ten}` : "Bảo hiểm",
        don_gia: donGia,
        so_luong: soKhach * soNgay,
        tien_cong_ty: thanhTien,
        tien_hdv: 0,
        nha_cung_cap_id: nccId,
      } as any);
      toast.success("Đã lưu bảo hiểm");
    } catch {
      toast.error("Lỗi khi lưu bảo hiểm");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">🛡️ Bảo hiểm</span>
          {baoHiemCD && (
            <span className="text-xs text-muted-foreground">· {baoHiemCD.ten}</span>
          )}
        </div>
        {thanhTien > 0 && (
          <span className="text-sm font-semibold text-foreground">{fmt(thanhTien)} ₫</span>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex items-end gap-6 flex-wrap">
        {/* Công thức */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="bg-muted px-2 py-1 rounded">{soKhach} khách</span>
          <span>×</span>
          <span className="bg-muted px-2 py-1 rounded">{soNgay} ngày</span>
          <span>×</span>
          <div className="flex flex-col gap-0.5">
            <Label className="text-[10px] text-muted-foreground">Giá/người/ngày</Label>
            <Input
              type="number"
              value={donGia || ""}
              onChange={(e) => setDonGia(Number(e.target.value) || 0)}
              onBlur={handleSave}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
              className="h-7 w-28 text-xs text-center"
              placeholder="0"
              disabled={saving}
            />
          </div>
          <span>=</span>
          <span className={`font-semibold ${thanhTien > 0 ? "text-foreground" : "text-muted-foreground"}`}>
            {thanhTien > 0 ? `${fmt(thanhTien)} ₫` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
