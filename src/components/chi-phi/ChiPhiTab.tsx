import { useMemo, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Printer, ChevronDown } from "lucide-react";
import { errMsg } from "@/lib/error";
import { waitForChiPhiWrites } from "@/lib/chi-phi-writes";
import { timDongPhatSinhThieuGia } from "@/lib/chi-phi-thieu-gia";
import { externalSupabase } from "@/lib/supabase-external";
import { useChiPhiList, useDNTTList, useChiPhiKSData } from "@/hooks/use-chi-phi";
import { useChiPhiLocked } from "@/hooks/use-chi-phi-lock";
import { useDoanNhomList } from "@/hooks/use-doan-nhom";
import { useChiPhiChangeSignal } from "@/hooks/use-chi-phi-realtime";
import { useChiPhiHDVSection } from "@/hooks/use-chi-phi-hdv";
import { useUserRoles, useCurrentUserName } from "@/hooks/use-doan";
import { useRedemptionsByDoan } from "@/hooks/use-voucher";
import { buildRedemptionMap } from "@/lib/voucher";
import ChiPhiHeader from "./ChiPhiHeader";
import ChiPhiKSSection from "./ChiPhiKSSection";
import ChiPhiNHSection, { type ChiPhiNHSectionHandle } from "./ChiPhiNHSection";
import ChiPhiDVSection, { type ChiPhiDVSectionHandle } from "./ChiPhiDVSection";
import ChiPhiBaoHiemSection from "./ChiPhiBaoHiemSection";
import ChiPhiXeSection from "./ChiPhiXeSection";
import ChiPhiVisaSection from "./ChiPhiVisaSection";
import ChiPhiVeMayBaySection from "./ChiPhiVeMayBaySection";
import ChiPhiHDVSection from "./ChiPhiHDVSection";
import ChiPhiPhasThuSection from "./ChiPhiPhasThuSection";
import DNTTNHPreviewModal from "./DNTTNHPreviewModal";
import type { NHDocData } from "@/lib/export-dntt-nh-word";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { tourProfile } from "@/lib/tour-profile";
import { exportChiPhiDoanExcel } from "@/lib/export-chi-phi-excel";
import { TY_GIA_NDT_DEFAULT } from "@/lib/phai-thu-calc";
import { toast } from "sonner";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

// Thông tin đoàn ChiPhiTab + các section con đọc (số khách, ngày, agent, HDV, xe…).
export interface ChiPhiTabDoan {
  ten_doan?: string | null;
  loai_tour?: string | null;
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
    id?: number | null;
    ten_xe?: string | null;
    so_cho?: number | null;
    nha_xe?: { ten?: string | null; nha_cung_cap_id?: number | null; tai_khoan_thanh_toan?: string | null } | null;
  } | null;
  xe_2?: {
    id?: number | null;
    ten_xe?: string | null;
    so_cho?: number | null;
    nha_xe?: { ten?: string | null; nha_cung_cap_id?: number | null; tai_khoan_thanh_toan?: string | null } | null;
  } | null;
  tang_pham?: unknown;
  thu_tip?: boolean | null;
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
  loai_tour?: string | null;
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
  thu_tip?: boolean | null;
  tip_rate?: number | null;
  tip_so_khach_override?: number | null;
  tip_so_ngay_override?: number | null;
  tip_lump_sum?: number | null;
}

interface Props {
  doanId: number;
  doan: ChiPhiTabDoanInput;
  coTinhSuatTLNhaHang?: boolean;
  /** ID nhóm active (Phase 2+). Khi có giá trị → tính số khách theo nhóm; null → theo đoàn. */
  activeNhomId?: number | null;
}

export default function ChiPhiTab({ doanId, doan: doanInput, coTinhSuatTLNhaHang, activeNhomId }: Props) {
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

  // Phase 2+: lấy số khách của nhóm active (nếu có), fallback về đoàn.
  // Cho phép Vicky case: nhóm 1 (75 khách) chi phí khác nhóm 2 (25 khách).
  const { data: nhomList = [] } = useDoanNhomList(doanId);
  const activeNhom = activeNhomId != null ? nhomList.find((n) => n.id === activeNhomId) : null;
  const sk_lon = activeNhom?.so_khach_lon ?? doan?.so_khach_lon ?? 0;
  const sk_em1 = activeNhom?.so_khach_em1 ?? doan?.so_khach_em1 ?? 0;
  const sk_em2 = activeNhom?.so_khach_em2 ?? doan?.so_khach_em2 ?? 0;
  const sk_tl = activeNhom?.so_khach_tl ?? doan?.so_khach_tl ?? 0;
  const soKhach = (sk_lon + sk_em1 + sk_em2 + sk_tl) || doan?.so_khach || 0;

  // Nhà hàng: TE 6-10 = 0.5 suất, TE <6 = miễn phí
  const soKhachNH = (sk_lon + sk_em1 * 0.5 + sk_tl) || doan?.so_khach || 0;
  const soKhachNHKhongTL = (sk_lon + sk_em1 * 0.5) || doan?.so_khach || 0;

  // Đoàn đã quyết toán → khóa sửa CON SỐ chi phí (trừ admin). Luồng thanh toán giữ nguyên.
  const locked = useChiPhiLocked(doanId);
  const qc = useQueryClient();
  const { data: chiPhiRows = [], refetch: refetchChiPhi } = useChiPhiList(doanId, activeNhomId);
  const { data: dnttList = [], refetch: refetchDntt } = useDNTTList(doanId);
  const { data: hdvData, isLoading: isHDVLoading, refetch: refetchHdv } = useChiPhiHDVSection(doanId);
  const { data: ksData, refetch: refetchKs } = useChiPhiKSData(doanId, activeNhomId);
  const { data: userRoles = [] } = useUserRoles();
  // Voucher đã phủ của đoàn → xuất Excel ghi rõ dòng nào trả bằng voucher
  // (voucher 'tang' đưa tien_cong_ty về 0, không ghi chú thì bản in trống trơn).
  const { data: redemptions = [], refetch: refetchRedemptions } = useRedemptionsByDoan(doanId);
  const redemptionMap = useMemo(() => buildRedemptionMap(redemptions), [redemptions]);
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

      const nhRaw = await nhSectionRef.current?.buildSelectedEntries();
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

  const handleExportExcel = async (mode: "full" | "hdv" = "full") => {
    try {
      setExportingExcel(true);
      // Chờ blur-save đang bay RỒI mới đọc lại DB. Chính cú click nút xuất Excel làm ô
      // đang gõ mất focus → lệnh UPDATE vừa mới bắn, đọc ngay là ra số CŨ: dòng phát
      // sinh vừa thêm in ra đúng giá trị lúc mới tạo (SL 1, đơn giá 0) trong khi màn
      // hình hiện số OP đã nhập. Cùng cơ chế bản in ĐNTT dùng (use-nh-section).
      const settled = await waitForChiPhiWrites(qc);
      if (!settled) {
        toast.warning(t("Còn thay đổi chi phí đang lưu — kiểm tra kỹ số tiền trong file Excel."), {
          duration: 8000,
        });
      }
      // Đọc lại toàn bộ nguồn của file: cache React Query chỉ đổi ở render sau nên
      // trong cùng 1 tick vẫn là số cũ.
      const [cpRes, dnttRes, hdvRes, ksRes, redRes] = await Promise.all([
        refetchChiPhi(),
        refetchDntt(),
        refetchHdv(),
        refetchKs(),
        refetchRedemptions(),
      ]);
      const freshRows = cpRes.data ?? chiPhiRows;
      const freshDntt = dnttRes.data ?? dnttList;
      const freshHdv = hdvRes.data ?? hdvData;
      const freshRedemptionMap = redRes.data ? buildRedemptionMap(redRes.data) : redemptionMap;

      if (freshRows.length === 0 && freshDntt.length === 0) {
        toast.error(t("Chưa có dữ liệu chi phí để xuất Excel"));
        return;
      }

      // Dòng phát sinh tạo xong mà quên nhập giá vẫn in ra file (SL 1, đơn giá 0),
      // đọc y như khoản miễn phí. Nói trước khi OP gửi file đi.
      const thieuGia = timDongPhatSinhThieuGia(freshRows);
      if (thieuGia.length > 0) {
        const ten = thieuGia.slice(0, 5).map((x) => x.nhan).join(", ");
        const con = thieuGia.length > 5 ? ` (+${thieuGia.length - 5})` : "";
        toast.warning(
          `${t("Dòng phát sinh chưa nhập giá — sẽ in ra trống:")} ${ten}${con}`,
          { duration: 10000 },
        );
      }

      // Tỷ giá tip lấy từ snapshot mỗi đoàn (export tự đọc doan.tip_ty_gia); đoàn chưa
      // chốt → hằng mặc định. KHÔNG dùng localStorage chung (gây nhảy chéo đoàn).
      const tyGiaNdt = TY_GIA_NDT_DEFAULT;
      // khachSanMap của hook chỉ gom KS in-tour → KS neo trên dòng NGOÀI TOUR
      // (khach_san_id) thiếu tên, bản in ra "—". Fetch bù tên trước khi xuất
      // (không nới hook: id ngoài tour vào resolveKsIds sẽ mọc card mồ côi).
      const freshKsData = ksRes.data ?? ksData;
      let exportKsData = freshKsData;
      const missingKsIds = [...new Set(
        freshRows
          .filter((r) => r.danh_muc === "khach_san" && r.khach_san_id != null
            && !freshKsData?.khachSanMap?.[r.khach_san_id])
          .map((r) => r.khach_san_id!),
      )];
      if (missingKsIds.length > 0) {
        const { data: extraKs } = await externalSupabase
          .from("khach_san")
          .select("id, ten, foc_khach, foc_mien, dia_diem, nha_cung_cap_id, nguoi_thanh_toan, tai_khoan_thanh_toan, thanh_toan_dinh_ky_mac_dinh")
          .in("id", missingKsIds);
        if (extraKs?.length && freshKsData) {
          const merged = { ...freshKsData.khachSanMap };
          for (const k of extraKs) {
            merged[k.id] = {
              ...k, ten: k.ten ?? "",
              ten_ncc: null, ncc_so_tai_khoan: null, ncc_ngan_hang: null,
            };
          }
          exportKsData = { ...freshKsData, khachSanMap: merged };
        }
      }
      await exportChiPhiDoanExcel({
        doan,
        chiPhiRows: freshRows,
        dnttList: freshDntt,
        hdvData: freshHdv,
        opName,
        ksData: exportKsData,
        tyGiaNdt,
        mode,
        redemptionMap: freshRedemptionMap,
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              disabled={exportingExcel || isHDVLoading}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {exportingExcel ? t("Đang xuất...") : t("Xuất Excel")}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleExportExcel("hdv")}>
              {t("In cho HDV")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportExcel("full")}>
              {t("In tổng hợp")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChiPhiHeader doan={doan} opName={opName} />

      {/* ── Banner khóa quyết toán ── */}
      {locked && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800">
          <span className="text-base">🔒</span>
          <span>{t("Đoàn đã quyết toán — chi phí đã khóa. Chỉ admin mới sửa được số liệu. (Vẫn dùng được nút thanh toán / hóa đơn.)")}</span>
        </div>
      )}

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
        <ChiPhiKSSection doanId={doanId} soKhach={soKhach} tenDoan={doan?.ten_doan || ""} locked={locked} />

        <ChiPhiNHSection ref={nhSectionRef} doanId={doanId} soKhachDefault={soKhachNH} soKhachKhongTL={soKhachNHKhongTL} coTinhSuatTLNhaHang={coTinhSuatTLNhaHang} tenDoan={doan?.ten_doan || ""} doanNhomId={activeNhomId} locked={locked} />

        <ChiPhiDVSection ref={dvSectionRef} doanId={doanId} tenDoan={doan?.ten_doan || ""} ngayBatDau={doan?.ngay_di ?? undefined} doanNhomId={activeNhomId} locked={locked} />

        <ChiPhiXeSection doanId={doanId} xe={doan?.xe ?? null} xe2={doan?.xe_2 ?? null} tenDoan={doan?.ten_doan || ""} ngayBatDau={doan?.ngay_di ?? undefined} locked={locked} />

        {/* Visa — ẩn cho tour nội địa (xem tourProfile), khớp BookingVisaXeTab. */}
        {tourProfile(doan?.loai_tour).showVisa && (
          <ChiPhiVisaSection doanId={doanId} locked={locked} />
        )}

        {/* Vé máy bay — chỉ outbound + nội địa (xem tourProfile). Inbound ẩn. */}
        {tourProfile(doan?.loai_tour).showVeMayBay && (
          <ChiPhiVeMayBaySection doanId={doanId} tenDoan={doan?.ten_doan || ""} ngayBatDau={doan?.ngay_di ?? undefined} locked={locked} />
        )}

        <ChiPhiBaoHiemSection
          doanId={doanId}
          soKhach={soKhach}
          ngayDi={doan?.ngay_di ?? null}
          ngayVe={doan?.ngay_ve ?? null}
          locked={locked}
        />

        <ChiPhiHDVSection doanId={doanId} doan={doan} locked={locked} />

        <ChiPhiPhasThuSection doanId={doanId} doan={doan} locked={locked} />
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
