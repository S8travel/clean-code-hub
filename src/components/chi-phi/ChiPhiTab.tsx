import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useChiPhiList, useDNTTList, useChiPhiKSData } from "@/hooks/use-chi-phi";
import { useChiPhiHDVSection } from "@/hooks/use-chi-phi-hdv";
import { useUserRoles } from "@/hooks/use-doan";
import ChiPhiHeader from "./ChiPhiHeader";
import ChiPhiKSSection from "./ChiPhiKSSection";
import ChiPhiNHSection from "./ChiPhiNHSection";
import ChiPhiDVSection from "./ChiPhiDVSection";
import ChiPhiBaoHiemSection from "./ChiPhiBaoHiemSection";
import ChiPhiXeSection from "./ChiPhiXeSection";
import ChiPhiVisaSection from "./ChiPhiVisaSection";
import ChiPhiHDVSection from "./ChiPhiHDVSection";
import ChiPhiPhasThuSection from "./ChiPhiPhasThuSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportChiPhiDoanExcel } from "@/lib/export-chi-phi-excel";
import { toast } from "sonner";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
  doan: any;
  coTinhSuatTLNhaHang?: boolean;
}

export default function ChiPhiTab({ doanId, doan, coTinhSuatTLNhaHang }: Props) {
  const [exportingExcel, setExportingExcel] = useState(false);
  const soKhach =
    (doan?.so_khach_lon ?? 0) +
    (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) +
    (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach ||
    0;

  // Nhà hàng: TE 6-10 = 0.5 suất, TE <6 = miễn phí
  const soKhachNH =
    (doan?.so_khach_lon ?? 0) +
    (doan?.so_khach_em1 ?? 0) * 0.5 +
    (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach ||
    0;

  const soKhachNHKhongTL =
    (doan?.so_khach_lon ?? 0) +
    (doan?.so_khach_em1 ?? 0) * 0.5 ||
    doan?.so_khach ||
    0;

  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);
  const { data: hdvData, isLoading: isHDVLoading } = useChiPhiHDVSection(doanId);
  const { data: ksData } = useChiPhiKSData(doanId);
  const { data: userRoles = [] } = useUserRoles();
  const opName = useMemo(() => {
    if (!doan?.assigned_to) return "—";
    return userRoles.find((u) => u.user_id === doan.assigned_to)?.ho_ten || "—";
  }, [doan?.assigned_to, userRoles]);

  const summary = useMemo(() => {
    // Loại trừ chi phí đã hủy dịch vụ (cong_no, hoan_tien)
    const activeRows = chiPhiRows.filter(
      (r) => r.trang_thai_dntt !== "cong_no" && r.trang_thai_dntt !== "hoan_tien",
    );

    const total = activeRows.reduce(
      (s, r) => s + (r.tien_cong_ty || 0) + (r.tien_hdv || 0),
      0,
    );

    const thucTe = activeRows.reduce((s, r) => {
      if (r.thanh_tien_thuc_te != null) return s + r.thanh_tien_thuc_te;
      return s + (r.tien_cong_ty || 0) + (r.tien_hdv || 0);
    }, 0);
    const daDieuChinh = thucTe !== total;

    // daTT = tổng paid_amount của các ĐNTT chưa hủy.
    // payments là payment events thực tế; ĐNTT da_huy → loại bỏ.
    const daTT = dnttList
      .filter((d) => d.trang_thai_duyet !== "da_huy" && d.trang_thai_duyet !== "tu_choi")
      .reduce((s, d) => s + (d.paid_amount || 0), 0);

    return { total, thucTe, daDieuChinh, daTT };
  }, [chiPhiRows, dnttList]);

  const hasData = summary.total > 0 || summary.daTT > 0;

  const handleExportExcel = async () => {
    if (chiPhiRows.length === 0 && dnttList.length === 0) {
      toast.error("Chưa có dữ liệu chi phí để xuất Excel");
      return;
    }

    try {
      setExportingExcel(true);
      await exportChiPhiDoanExcel({
        doan,
        chiPhiRows,
        dnttList,
        hdvData,
        opName,
        ksData,
      });
      toast.success("Đã xuất file Excel");
    } catch (error: any) {
      toast.error(error?.message || "Không thể xuất file Excel");
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          onClick={handleExportExcel}
          disabled={exportingExcel || isHDVLoading}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {exportingExcel ? "Đang xuất..." : "Xuất Excel"}
        </Button>
      </div>

      <ChiPhiHeader doan={doan} opName={opName} />

      {/* ── Summary bar ── */}
      {hasData && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-border">
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-0.5">Chi phí dự trù</p>
              <p className="text-sm font-semibold text-foreground">{fmt(summary.total)} ₫</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-0.5">Chi phí thực tế</p>
              <p className={cn("text-sm font-semibold", summary.daDieuChinh ? "text-blue-600" : "text-foreground")}>
                {fmt(summary.thucTe)} ₫
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-0.5">Tiền đã thanh toán</p>
              <p className="text-sm font-semibold text-emerald-600">{fmt(summary.daTT)} ₫</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <ChiPhiKSSection doanId={doanId} soKhach={soKhach} tenDoan={doan?.ten_doan || ""} />

        <ChiPhiNHSection doanId={doanId} soKhachDefault={soKhachNH} soKhachKhongTL={soKhachNHKhongTL} coTinhSuatTLNhaHang={coTinhSuatTLNhaHang} tenDoan={doan?.ten_doan || ""} />

        <ChiPhiDVSection doanId={doanId} tenDoan={doan?.ten_doan || ""} ngayBatDau={doan?.ngay_di} />

        <ChiPhiXeSection doanId={doanId} xe={doan?.xe ?? null} />

        <ChiPhiVisaSection doanId={doanId} />

        <ChiPhiBaoHiemSection
          doanId={doanId}
          soKhach={soKhach}
          ngayDi={doan?.ngay_di ?? null}
          ngayVe={doan?.ngay_ve ?? null}
        />

        <ChiPhiHDVSection doanId={doanId} doan={doan} />

        <ChiPhiPhasThuSection doan={doan} />
      </div>
    </div>
  );
}
