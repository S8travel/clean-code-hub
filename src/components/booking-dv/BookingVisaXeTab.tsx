import { useBookingXe } from "@/hooks/use-booking-xe";
import { useBookingVisaList, useInsertBookingVisa } from "@/hooks/use-booking-visa";
import { useDonViVisaList } from "@/hooks/use-visa";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import BookingXeCard from "./BookingXeCard";
import BookingVisaCard from "./BookingVisaCard";
import type { DieuTourExportData } from "@/lib/export-dieu-tour-word";
import { t, useTranslate } from "@/lib/i18n";

interface XeInfo {
  id: number;
  ten_xe: string;
  so_cho: number | null;
  nha_xe: { id: number; ten: string; email: string | null; so_dien_thoai: string | null } | null;
}

interface Props {
  doanId: number;
  tenDoan: string;
  ngayDi?: string | null;
  ngayVe?: string | null;
  chuyenBayDon?: string | null;
  chuyenBayTien?: string | null;
  hdvName?: string | null;
  soKhach?: number | null;
  soKhachLon?: number;
  soKhachEm1?: number;
  soKhachEm2?: number;
  soKhachTl?: number;
  xe?: XeInfo | null;
  dieuTourExportData?: DieuTourExportData | null;
}

export default function BookingVisaXeTab({
  doanId, tenDoan, ngayDi, ngayVe, chuyenBayDon, chuyenBayTien,
  hdvName, soKhach, soKhachLon = 0, soKhachEm1 = 0, soKhachEm2 = 0, soKhachTl = 0,
  xe, dieuTourExportData,
}: Props) {
  useTranslate();
  const { data: xeBooking, isLoading: xeLoading } = useBookingXe(doanId);
  const { data: visaList = [], isLoading: visaLoading } = useBookingVisaList(doanId);
  const { data: donViVisaList = [] } = useDonViVisaList();
  const insertVisa = useInsertBookingVisa();

  if (xeLoading || visaLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[120px] w-full" />
        <Skeleton className="h-[180px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Section: Xe ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Xe")}</h3>
        <BookingXeCard
          doanId={doanId}
          tenDoan={tenDoan}
          ngayDi={ngayDi ?? null}
          ngayVe={ngayVe ?? null}
          chuyenBayDon={chuyenBayDon}
          chuyenBayTien={chuyenBayTien}
          hdvTen={hdvName}
          soKhach={soKhach}
          xe={xe ?? null}
          booking={xeBooking ?? null}
          exportData={dieuTourExportData ?? null}
        />
      </div>

      {/* ── Section: Visa ────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("Visa")}</h3>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => insertVisa.mutate({ doan_id: doanId })}
          >
            <Plus className="h-3 w-3" /> {t("Thêm đơn vị visa")}
          </Button>
        </div>
        {visaList.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">{t("Chưa có booking visa nào. Nhấn \"Thêm đơn vị visa\" để tạo.")}</p>
        ) : (
          <div className="space-y-3">
            {visaList.map((v) => (
              <BookingVisaCard
                key={v.id}
                doanId={doanId}
                tenDoan={tenDoan}
                ngayDi={ngayDi ?? null}
                soKhachLon={soKhachLon}
                soKhachEm1={soKhachEm1}
                soKhachEm2={soKhachEm2}
                soKhachTl={soKhachTl}
                booking={v}
                donViList={donViVisaList}
                exportData={dieuTourExportData ?? null}
                onDelete={() => {}}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
