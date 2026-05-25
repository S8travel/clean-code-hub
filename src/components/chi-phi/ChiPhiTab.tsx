import { useMemo, useState, useRef } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { errMsg } from "@/lib/error";
import { useChiPhiList, useDNTTList, useChiPhiKSData } from "@/hooks/use-chi-phi";
import { useChiPhiChangeSignal } from "@/hooks/use-chi-phi-realtime";
import { useChiPhiHDVSection } from "@/hooks/use-chi-phi-hdv";
import { useUserRoles, useCurrentUserName } from "@/hooks/use-doan";
import ChiPhiHeader from "./ChiPhiHeader";
import ChiPhiKSSection from "./ChiPhiKSSection";
import ChiPhiNHSection, { type ChiPhiNHSectionHandle } from "./ChiPhiNHSection";
import ChiPhiDVSection, { type ChiPhiDVSectionHandle } from "./ChiPhiDVSection";
import ChiPhiBaoHiemSection from "./ChiPhiBaoHiemSection";
import ChiPhiXeSection from "./ChiPhiXeSection";
import ChiPhiVisaSection from "./ChiPhiVisaSection";
import ChiPhiHDVSection from "./ChiPhiHDVSection";
import ChiPhiPhasThuSection from "./ChiPhiPhasThuSection";
import DNTTNHPreviewModal from "./DNTTNHPreviewModal";
import type { NHDocData } from "@/lib/export-dntt-nh-word";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportChiPhiDoanExcel } from "@/lib/export-chi-phi-excel";
import { toast } from "sonner";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Thông tin đoàn ChiPhiTab + các section con đọc (số khách, ngày, agent, HDV, xe…).
export interface ChiPhiTabDoan {
  ten_doan?: string | null;
  assigned_to?: string | null;
  so_khach?: number | null;
  so_khach_lon?: number | null;
  so_khach_em1?: number | null;
  so_khach_em2?: number | null;
  so_khach_tl?: number | null;
  ngay_di?: string | null;
  ngay_ve?: string | null;
  agents?: { ten?: string | null } | null;
  huong_dan_vien?: { ten?: string | null } | null;
  xe?: {
    ten_xe?: string | null;
    so_cho?: number | null;
    nha_xe?: { ten?: string | null; nha_cung_cap_id?: number | null } | null;
  } | null;
  tang_pham?: unknown;
  tip_rate?: number | null;
  tip_so_khach_override?: number | null;
  tip_so_ngay_override?: number | null;
  tip_lump_sum?: number | null;
}

// Prop nhận vào: row `doan` từ useDoanList — các quan hệ join (`agents`, `xe`,
// `huong_dan_vien`) có thể có kiểu phantom SelectQueryError do nhập nhằng FK,
// nên nhận `unknown` ở các trường đó rồi chuẩn hoá về ChiPhiTabDoan bên trong.
interface ChiPhiTabDoanInput {
  ten_doan?: string | null;
  assigned_to?: string | null;
  so_khach?: number | null;
  so_khach_lon?: number | null;
  so_khach_em1?: number | null;
  so_khach_em2?: number | null;
  so_khach_tl?: number | null;
  ngay_di?: string | null;
  ngay_ve?: string | null;
  agents?: unknown;
  huong_dan_vien?: unknown;
  xe?: unknown;
  tang_pham?: unknown;
  tip_rate?: number | null;
  tip_so_khach_override?: number | null;
  tip_so_ngay_override?: number | null;
  tip_lump_sum?: number | null;
}

interface Props {
  doanId: number;
  doan: ChiPhiTabDoanInput;
  coTinhSuatTLNhaHang?: boolean;
}

export default function ChiPhiTab({ doanId, doan: doanInput, coTinhSuatTLNhaHang }: Props) {
  useTranslate();
  // Chuẩn hoá row đoàn về ChiPhiTabDoan (các quan hệ join có kiểu chính xác).
  const doan = doanInput as ChiPhiTabDoan;
  const [exportingExcel, setExportingExcel] = useState(false);
  // Máy/tab khác đổi chi phí → invalidate query → section reconcile lại
  // từ DB (snapshot tour), không reset người đang gõ. Không cần banner.
  useChiPhiChangeSignal(doanId);

  // Refs để gộp ĐNTT từ NH + DV
  const nhSectionRef = useRef<ChiPhiNHSectionHandle>(null);
  const dvSectionRef = useRef<ChiPhiDVSectionHandle>(null);
  const [combinedPreview, setCombinedPreview] = useState<NHDocData | null>(null);
  const { data: currentUserName = "" } = useCurrentUserName();
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

    // Công ty thanh toán: tổng phần công ty trả (tien_cong_ty) — đã gồm
    // KS / NH / cảnh điểm / bảo hiểm / xe / visa. Row HDV trả (tien_hdv) loại
    // tự nhiên vì tien_cong_ty = 0.
    const congTy = activeRows.reduce((s, r) => s + (r.tien_cong_ty || 0), 0);

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

    return { total, thucTe, daDieuChinh, daTT, congTy };
  }, [chiPhiRows, dnttList]);

  const hasData = summary.total > 0 || summary.daTT > 0;

  const handlePrintCombined = async () => {
    try {
      const nhCount = nhSectionRef.current?.getSelectedCount() ?? 0;
      const dvCount = dvSectionRef.current?.getSelectedCount() ?? 0;
      if (nhCount === 0 && dvCount === 0) {
        toast.error(t("Chưa chọn nhà hàng / dịch vụ nào để in"));
        return;
      }

      const nhRaw = nhSectionRef.current?.buildSelectedEntries();
      const dvRaw = await dvSectionRef.current?.buildSelectedEntries();
      const nhEntries = nhRaw ?? [];
      const dvEntries = dvRaw ?? [];

      toast.info(
        `${t("Đã chọn")}: NH=${nhCount} (build=${nhEntries.length}) · DV=${dvCount} (build=${dvEntries.length})`,
      );

      const all = [...nhEntries, ...dvEntries];
      if (all.length === 0) {
        toast.error(t("Không build được entries — kiểm tra console"));
        return;
      }
      setCombinedPreview({
        doan: { ten_doan: doan?.ten_doan || String(doanId) },
        entries: all,
        nguoiDeNghi: currentUserName,
      });
    } catch (err: unknown) {
      toast.error(`${t("Lỗi")}: ${errMsg(err) || ""}`);
    }
  };

  const handleExportExcel = async () => {
    if (chiPhiRows.length === 0 && dnttList.length === 0) {
      toast.error(t("Chưa có dữ liệu chi phí để xuất Excel"));
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
      toast.success(t("Đã xuất file Excel"));
    } catch (error: unknown) {
      toast.error(errMsg(error) || t("Không thể xuất file Excel"));
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-8 text-xs gap-1.5"
          onClick={handlePrintCombined}
          title={t("In ĐNTT gộp các nhà hàng + dịch vụ đã chọn")}
        >
          <Printer className="h-3.5 w-3.5" />
          {t("In ĐNTT gộp NH + DV")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          onClick={handleExportExcel}
          disabled={exportingExcel || isHDVLoading}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {exportingExcel ? t("Đang xuất...") : t("Xuất Excel")}
        </Button>
      </div>

      <ChiPhiHeader doan={doan} opName={opName} />

      {/* ── Summary bar ── */}
      {hasData && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-4 divide-x divide-border">
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-0.5">{t("Chi phí dự trù")}</p>
              <p className="text-sm font-semibold text-foreground">{fmt(summary.total)} ₫</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-0.5">{t("Chi phí thực tế")}</p>
              <p className={cn("text-sm font-semibold", summary.daDieuChinh ? "text-blue-600" : "text-foreground")}>
                {fmt(summary.thucTe)} ₫
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-0.5">{t("Công ty thanh toán")}</p>
              <p className="text-sm font-semibold text-blue-600">{fmt(summary.congTy)} ₫</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground mb-0.5">{t("Tiền đã thanh toán")}</p>
              <p className="text-sm font-semibold text-emerald-600">{fmt(summary.daTT)} ₫</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <ChiPhiKSSection doanId={doanId} soKhach={soKhach} tenDoan={doan?.ten_doan || ""} />

        <ChiPhiNHSection ref={nhSectionRef} doanId={doanId} soKhachDefault={soKhachNH} soKhachKhongTL={soKhachNHKhongTL} coTinhSuatTLNhaHang={coTinhSuatTLNhaHang} tenDoan={doan?.ten_doan || ""} />

        <ChiPhiDVSection ref={dvSectionRef} doanId={doanId} tenDoan={doan?.ten_doan || ""} ngayBatDau={doan?.ngay_di ?? undefined} />

        <ChiPhiXeSection doanId={doanId} xe={doan?.xe ?? null} />

        <ChiPhiVisaSection doanId={doanId} />

        <ChiPhiBaoHiemSection
          doanId={doanId}
          soKhach={soKhach}
          ngayDi={doan?.ngay_di ?? null}
          ngayVe={doan?.ngay_ve ?? null}
        />

        <ChiPhiHDVSection doanId={doanId} doan={doan} />

        <ChiPhiPhasThuSection doanId={doanId} doan={doan} />
      </div>

      <DNTTNHPreviewModal
        open={!!combinedPreview}
        data={combinedPreview}
        onClose={() => {
          setCombinedPreview(null);
          // Sau khi đóng modal (đã xuất hoặc cancel) → clear selection cả 2 section
          nhSectionRef.current?.clearSelection();
          dvSectionRef.current?.clearSelection();
        }}
      />
    </div>
  );
}
