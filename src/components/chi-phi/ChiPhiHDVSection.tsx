import { useState } from "react";
import { errMsg } from "@/lib/error";
import { format } from "date-fns";
import { Plus, Ban, Printer, FileText } from "lucide-react";
import HDVPreviewModal from "./HDVPreviewModal";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useChiPhiHDVSection,
  useCancelDNTT,
  type HDVDNTTRow,
  type HDVInfo,
} from "@/hooks/use-chi-phi-hdv";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { exportHDVQuyetToanExcel } from "@/lib/export-hdv-quyet-toan-excel";
import { exportHDVTamUngExcel } from "@/lib/export-hdv-tam-ung-excel";
import { tipDaysInclusive } from "@/lib/tip-calc";
import { computePhaiThu, TY_GIA_NDT_DEFAULT } from "@/lib/phai-thu-calc";
import { t, useTranslate } from "@/lib/i18n";
import type { HDVDoanInfo } from "./hdv-shared";
import { HoTroHDVTable } from "./HoTroHDVTable";
import { CreateHDVPaymentModal } from "./CreateHDVPaymentModal";

export type { HDVDoanInfo } from "./hdv-shared";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface Props {
  doanId: number;
  doan?: HDVDoanInfo;
  /** Đoàn đã quyết toán → khóa sửa con số chi phí (trừ admin). */
  locked?: boolean;
}

// Tính "Phải thu HDV" — phần HDV thu hộ: Tip + Đầu khách + Quỹ VP + extras.
// Dùng chung lib computePhaiThu (single source) để KHỚP ChiPhiPhasThuSection +
// export Excel. Mỗi khoản tính phần HDV theo nguoi_thu đã persist trên đoàn.
function computeHdvPhaiThuVND(doan: HDVDoanInfo | undefined): number {
  if (!doan) return 0;
  // Tỷ giá tip lấy từ snapshot của chính đoàn (computePhaiThu tự đọc doan.tip_ty_gia);
  // đoàn chưa chốt → hằng mặc định. KHÔNG dùng localStorage chung (gây nhảy chéo đoàn).
  return computePhaiThu(doan, TY_GIA_NDT_DEFAULT).hdvVND;
}

export default function ChiPhiHDVSection({ doanId, doan, locked = false }: Props) {
  useTranslate();
  const { data, isLoading } = useChiPhiHDVSection(doanId);
  const [showTamUng, setShowTamUng] = useState(false);
  const [showQuyetToan, setShowQuyetToan] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const hdvPhaiThuVND = computeHdvPhaiThuVND(doan);
  // Net = (chi vendor + HDV ứng hỗ trợ) − tạm ứng đã trả − phải thu (HDV tự thu tip).
  // > 0: HDV đã chi vượt thu → công ty còn phải trả lại. < 0: HDV thu nhiều hơn chi → HDV trả lại công ty.

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">{t("Đang tải...")}</div>;
  }

  const hdv = data?.hdv ?? null;
  const hoTroItems = data?.hoTroItems ?? [];
  const tongHdvChi = data?.tongHdvChi ?? 0;
  const tongHoTroHDV = data?.tongHoTroHDV ?? 0;
  const tamUngList = data?.tamUngList ?? [];
  const quyetToanList = data?.quyetToanList ?? [];
  const tamUngDaTT = data?.tamUngDaTT ?? 0;
  const soConPhaiTra = data?.soConPhaiTra ?? 0;
  const daQuyetToan = data?.daQuyetToan ?? false;
  // Net thực tế cần thanh toán/trả lại: tính cả khoản HDV tự thu (tip) → HDV đã có tiền sẵn.
  const netConPhaiTra = soConPhaiTra - hdvPhaiThuVND;

  return (
    <div className="space-y-4">
      {/* ── Top card: HDV info + tóm tắt + tạm ứng/quyết toán ── */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* HDV info + summary */}
        <div className="px-4 py-3 bg-muted/40 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            {hdv ? (
              <div>
                <p className="text-sm font-semibold">{hdv.ten}</p>
                {(hdv.so_tai_khoan || hdv.ngan_hang) && (
                  <p className="text-xs text-muted-foreground">
                    {[hdv.so_tai_khoan, hdv.ngan_hang].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">{t("Chưa chỉ định HDV")}</p>
            )}

            {(tongHdvChi > 0 || tongHoTroHDV > 0 || hdvPhaiThuVND > 0) && (
              <div className="flex gap-4 flex-wrap">
                {tongHdvChi > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("Tổng HDV chi")}</p>
                    <p className="text-sm font-semibold">{fmt(tongHdvChi)} ₫</p>
                  </div>
                )}
                {hdvPhaiThuVND > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("Phải thu HDV")}</p>
                    <p className="text-sm font-semibold text-amber-600">{fmt(hdvPhaiThuVND)} ₫</p>
                  </div>
                )}
                {tamUngDaTT > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("Đã tạm ứng")}</p>
                    <p className="text-sm font-semibold text-emerald-600">{fmt(tamUngDaTT)} ₫</p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    {netConPhaiTra > 0 ? t("Công ty còn phải trả") : netConPhaiTra < 0 ? t("HDV phải trả lại") : t("Đã đủ")}
                  </p>
                  <p className={cn(
                    "text-sm font-semibold",
                    netConPhaiTra > 0 ? "text-orange-600" : netConPhaiTra < 0 ? "text-blue-600" : "text-emerald-600",
                  )}>
                    {netConPhaiTra < 0 ? "-" : ""}{fmt(Math.abs(netConPhaiTra))} ₫
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2 shrink-0 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowPreview(true)}>
              <Printer className="h-3 w-3 mr-1" /> {t("In thống kê")}
            </Button>
            {!daQuyetToan && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowTamUng(true)}>
                <Plus className="h-3 w-3 mr-1" /> {t("Tạm ứng")}
              </Button>
            )}
            {(tamUngList.length > 0 || tongHdvChi > 0 || tongHoTroHDV > 0) && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowQuyetToan(true)}>
                <Plus className="h-3 w-3 mr-1" /> {t("Quyết toán")}
              </Button>
            )}
          </div>
        </div>

        {/* Danh sách tạm ứng */}
        {tamUngList.length > 0 && (
          <div className="border-b border-border">
            <div className="px-4 py-1.5 bg-muted/20">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("Tạm ứng")}</p>
            </div>
            <div className="divide-y divide-border">
              {tamUngList.map((d) => (
                <HDVDNTTCard key={d.id} d={d} doanId={doanId} hdv={hdv} doan={doan} />
              ))}
            </div>
          </div>
        )}

        {/* Danh sách quyết toán */}
        {quyetToanList.length > 0 && (
          <div>
            <div className="px-4 py-1.5 bg-muted/20 border-b border-border">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("Quyết toán")}</p>
            </div>
            <div className="divide-y divide-border">
              {quyetToanList.map((d) => (
                <HDVDNTTCard key={d.id} d={d} doanId={doanId} hdv={hdv} doan={doan} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state nếu chưa có gì */}
        {tamUngList.length === 0 && quyetToanList.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t("Chưa có tạm ứng hoặc quyết toán.")}</p>
        )}
      </div>

      {/* ── Chi phí công ty hỗ trợ HDV ── */}
      <HoTroHDVTable doanId={doanId} doan={doan} hoTroItems={hoTroItems} locked={locked} />

      {/* Modals */}
      {showTamUng && (
        <CreateHDVPaymentModal
          doanId={doanId}
          hdvId={hdv?.id ?? null}
          refLoai="hdv_tam_ung"
          title={t("Tạo tạm ứng HDV")}
          onClose={() => setShowTamUng(false)}
        />
      )}
      {showQuyetToan && (
        <CreateHDVPaymentModal
          doanId={doanId}
          hdvId={hdv?.id ?? null}
          refLoai="hdv_quyet_toan"
          title={t("Tạo quyết toán HDV")}
          defaultSoTien={Math.abs(netConPhaiTra)}
          defaultLaThuHoi={netConPhaiTra < 0}
          doan={doan}
          tongHdvChi={tongHdvChi}
          tamUngDaTT={tamUngDaTT}
          hdv={hdv}
          onClose={() => setShowQuyetToan(false)}
        />
      )}
      <HDVPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        doan={doan}
        data={data ?? null}
        hdvPhaiThuVND={hdvPhaiThuVND}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HDVDNTTCard({ d, hdv, doan }: { d: HDVDNTTRow; doanId: number; hdv: HDVInfo | null; doan?: HDVDoanInfo }) {
  const cancelMut = useCancelDNTT();
  const { user } = useAuth();

  const isHuy = d.trang_thai_duyet === "da_huy";
  const isTuChoi = d.trang_thai_duyet === "tu_choi";
  const isDaTT = d.payment_status === "paid";
  const isDaDuyet = d.trang_thai_duyet === "da_duyet";
  const isChoDuyet = d.trang_thai_duyet === "cho_duyet";
  const isQuyetToan = d.ref_loai === "hdv_quyet_toan";
  const isTamUng = d.ref_loai === "hdv_tam_ung";

  const handlePrintTamUng = async () => {
    const soKhach =
      (doan?.so_khach_lon ?? 0) + (doan?.so_khach_em1 ?? 0) +
      (doan?.so_khach_em2 ?? 0) + (doan?.so_khach_tl ?? 0) || (doan?.so_khach ?? 0);
    const soNgay = tipDaysInclusive(doan?.ngay_di, doan?.ngay_ve);
    try {
      await exportHDVTamUngExcel({
        maDoan: doan?.ten_doan ?? "",
        tenHdv: hdv?.ten ?? "",
        soKhach,
        soNgay,
        soTien: d.so_tien,
        // NỘI DUNG để mặc định "Tạm ứng đoàn <maDoan> - HDV <tenHdv>"
        ghiChu: d.ghi_chu ?? undefined,
        nguoiDeNghi: user?.ho_ten ?? "",
        hdv,
        ngayLap: d.created_at,
      });
    } catch (e: unknown) {
      toast.error(t("Lỗi xuất Excel: ") + (errMsg(e) || ""));
    }
  };

  const handlePrintQuyetToan = async () => {
    if (!d.quyet_toan_data) {
      toast.error(t("Chưa có chi tiết quyết toán. Tạo lại quyết toán với form chi tiết để xuất Excel."));
      return;
    }
    try {
      await exportHDVQuyetToanExcel({
        data: d.quyet_toan_data,
        hdv,
        nguoiDeNghi: user?.ho_ten ?? "",
        ngayLap: d.created_at,
      });
    } catch (e: unknown) {
      toast.error(t("Lỗi xuất Excel: ") + (errMsg(e) || ""));
    }
  };

  return (
    <div className={cn("px-4 py-2.5 flex items-center justify-between gap-3", (isHuy || isTuChoi) && "opacity-50")}>
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">
          {d.la_thu_hoi ? "⬅ " : ""}{d.mo_ta || (d.la_thu_hoi ? t("Thu hồi tạm ứng") : "—")}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {format(new Date(d.created_at), "dd/MM/yyyy HH:mm")}
          {d.ghi_chu && <span className="ml-2 italic">{d.ghi_chu}</span>}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={cn("text-sm font-semibold", d.la_thu_hoi && "text-blue-600")}>
          {d.la_thu_hoi ? "-" : ""}{fmt(d.so_tien)} ₫{d.la_thu_hoi && <span className="ml-1 text-xs">({t("thu hồi")})</span>}
        </span>
        <HDVStatusBadge d={d} />

        {isQuyetToan && !isHuy && !isTuChoi && (
          <Button
            size="sm" variant="ghost"
            className="h-6 text-xs"
            onClick={handlePrintQuyetToan}
            title={t("In Giấy đề nghị quyết toán (Excel)")}
          >
            <FileText className="h-3 w-3 mr-1" /> {t("In")}
          </Button>
        )}

        {isTamUng && !isHuy && !isTuChoi && (
          <Button
            size="sm" variant="ghost"
            className="h-6 text-xs"
            onClick={handlePrintTamUng}
            title={t("In Giấy đề nghị tạm ứng (Excel)")}
          >
            <FileText className="h-3 w-3 mr-1" /> {t("In")}
          </Button>
        )}

        {!isHuy && !isTuChoi && !isDaTT && (
          <>
            {(isChoDuyet || isDaDuyet) && (
              <Button
                size="sm" variant="ghost"
                className="h-6 text-xs text-destructive hover:text-destructive"
                onClick={() => cancelMut.mutate({ id: d.id }, { onSuccess: () => toast.success(t("Đã hủy")), onError: (e: unknown) => toast.error(errMsg(e)) })}
                disabled={cancelMut.isPending}
              >
                <Ban className="h-3 w-3 mr-1" /> {t("Hủy")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function HDVStatusBadge({ d }: { d: HDVDNTTRow }) {
  if (d.trang_thai_duyet === "da_huy")
    return <Badge variant="secondary" className="text-[10px]">{t("Đã hủy")}</Badge>;
  if (d.payment_status === "paid")
    return <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">{t("Đã thanh toán")}</Badge>;
  switch (d.trang_thai_duyet) {
    case "cho_duyet":
      return <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300">{t("Chờ duyệt")}</Badge>;
    case "da_duyet":
      return <Badge className="text-[10px] bg-teal-100 text-teal-800 border-teal-300">{t("Đã duyệt")}</Badge>;
    case "tu_choi":
      return <Badge variant="destructive" className="text-[10px]">{t("Từ chối")}</Badge>;
    default:
      return null;
  }
}
