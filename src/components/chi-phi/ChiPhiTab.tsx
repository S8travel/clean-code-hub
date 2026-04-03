import { useMemo } from "react";
import { useChiPhiList, useDNTTList } from "@/hooks/use-chi-phi";
import ChiPhiHeader from "./ChiPhiHeader";
import ChiPhiKSSection from "./ChiPhiKSSection";
import ChiPhiNHSection from "./ChiPhiNHSection";
import ChiPhiDVSection from "./ChiPhiDVSection";
import ChiPhiHDVSection from "./ChiPhiHDVSection";
import ChiPhiBaoHiemSection from "./ChiPhiBaoHiemSection";
import ChiPhiXeSection from "./ChiPhiXeSection";
import ChiPhiVisaSection from "./ChiPhiVisaSection";
import { cn } from "@/lib/utils";

const fmt = (n: number) => n.toLocaleString("vi-VN");

interface Props {
  doanId: number;
  doan: any;
}

export default function ChiPhiTab({ doanId, doan }: Props) {
  const soKhach =
    (doan?.so_khach_lon ?? 0) +
    (doan?.so_khach_em1 ?? 0) +
    (doan?.so_khach_em2 ?? 0) +
    (doan?.so_khach_tl ?? 0) ||
    doan?.so_khach ||
    0;

  const { data: chiPhiRows = [] } = useChiPhiList(doanId);
  const { data: dnttList = [] } = useDNTTList(doanId);

  const summary = useMemo(() => {
    // Loại trừ chi phí đã hủy dịch vụ (cong_no, hoan_tien)
    const activeRows = chiPhiRows.filter(
      (r) => r.trang_thai_dntt !== "cong_no" && r.trang_thai_dntt !== "hoan_tien",
    );

    const totalKS = activeRows
      .filter((r) => r.danh_muc === "khach_san")
      .reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
    const totalNH = activeRows
      .filter((r) => r.danh_muc === "nha_hang")
      .reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
    const totalDV = activeRows
      .filter((r) => r.danh_muc === "canh_diem" && r.tien_cong_ty > 0)
      .reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
    const totalBH = activeRows
      .filter((r) => r.danh_muc === "bao_hiem")
      .reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
    const totalXe = activeRows
      .filter((r) => r.danh_muc === "xe")
      .reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
    const totalVisa = activeRows
      .filter((r) => r.danh_muc === "visa")
      .reduce((s, r) => s + (r.tien_cong_ty || 0), 0);
    const total = totalKS + totalNH + totalDV + totalBH + totalXe + totalVisa;

    const thucTeKS = activeRows
      .filter((r) => r.danh_muc === "khach_san")
      .reduce((s, r) => s + (r.thanh_tien_thuc_te ?? r.thanh_tien), 0);
    const thucTeNH = activeRows
      .filter((r) => r.danh_muc === "nha_hang")
      .reduce((s, r) => s + (r.thanh_tien_thuc_te ?? r.thanh_tien), 0);
    const thucTe = thucTeKS + thucTeNH + totalDV + totalBH + totalXe + totalVisa;
    const daDieuChinh = thucTe !== total;

    const activeDntts = dnttList.filter(
      (d) =>
        d.trang_thai_duyet !== "da_huy" &&
        d.trang_thai_duyet !== "tu_choi" &&
        d.trang_thai_thanh_toan !== "can_tru" &&
        d.trang_thai_thanh_toan !== "da_can_tru",
    );
    const daTT = activeDntts
      .filter((d) => d.trang_thai_thanh_toan === "da_tt")
      .reduce((s, d) => s + d.so_tien, 0);

    return { total, thucTe, daDieuChinh, daTT };
  }, [chiPhiRows, dnttList]);

  const hasData = summary.total > 0 || summary.daTT > 0;

  return (
    <div className="space-y-5">
      <ChiPhiHeader doan={doan} />

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

      {/* ── Công ty thanh toán ── */}
      <div className="space-y-6">
        <h2 className="text-base font-semibold border-b border-border pb-2">
          Công ty thanh toán
        </h2>

        <ChiPhiKSSection doanId={doanId} soKhach={soKhach} tenDoan={doan?.ten_doan || ""} />

        <ChiPhiNHSection doanId={doanId} soKhachDefault={soKhach} tenDoan={doan?.ten_doan || ""} />

        <ChiPhiDVSection doanId={doanId} tenDoan={doan?.ten_doan || ""} ngayBatDau={doan?.ngay_bat_dau} />

        <ChiPhiXeSection doanId={doanId} xe={doan?.xe ?? null} />

        <ChiPhiVisaSection doanId={doanId} />

        <ChiPhiBaoHiemSection
          doanId={doanId}
          soKhach={soKhach}
          ngayDi={doan?.ngay_di ?? null}
          ngayVe={doan?.ngay_ve ?? null}
        />
      </div>

      {/* ── HDV thanh toán ── */}
      <div className="space-y-6">
        <h2 className="text-base font-semibold border-b border-border pb-2">
          Hướng dẫn viên
        </h2>
        <ChiPhiHDVSection doanId={doanId} />
      </div>
    </div>
  );
}
