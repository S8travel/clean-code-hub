import { Skeleton } from "@/components/ui/skeleton";
import { useBookingNH } from "@/hooks/use-booking-nh";
import MealColumn from "./MealColumn";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  doanId: number;
  tenDoan: string;
  soKhach: number;
}

function formatDayHeader(ngaySo: number, ngayDate: string | null, thu: string | null) {
  const dateStr = ngayDate
    ? new Date(ngayDate).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
    : "";
  const thuStr = thu || "";
  return `${t("Ngày")} ${ngaySo}${dateStr ? ` · ${dateStr}` : ""}${thuStr ? ` · ${thuStr}` : ""}`;
}

export default function MenuTab({ doanId, tenDoan, soKhach }: Props) {
  useTranslate();
  const { data: days, isLoading } = useBookingNH(doanId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!days?.length) {
    return (
      <div className="rounded-xl bg-card border border-border p-12 text-center text-muted-foreground text-sm">
        {t("Chưa có dữ liệu ngày. Hãy lưu tab Điều tour trước.")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map(day => (
        <div key={day.doan_ngay_id} className="rounded-xl border border-border overflow-hidden">
          {/* Day header */}
          <div className="px-4 py-2 bg-muted/50 border-b font-semibold text-sm">
            {formatDayHeader(day.ngay_so, day.ngay_date, day.thu)}
          </div>

          {/* Two columns: trua | toi */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* An trua */}
            <div className="p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                {t("🍽 Ăn trưa")}
              </div>
              <MealColumn
                doanId={doanId}
                doanNgayId={day.doan_ngay_id}
                buaAn="trua"
                nhaHangId={day.an_trua_nha_hang_id}
                nhaHangTen={day.an_trua_nha_hang_ten}
                nhaHangEmail={day.an_trua_nha_hang_email}
                booking={day.booking_trua}
                tenDoan={tenDoan}
                soKhach={soKhach}
                ngayDate={day.ngay_date}
              />
            </div>

            {/* An toi */}
            <div className="p-3">
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                {t("🍽 Ăn tối")}
              </div>
              <MealColumn
                doanId={doanId}
                doanNgayId={day.doan_ngay_id}
                buaAn="toi"
                nhaHangId={day.an_toi_nha_hang_id}
                nhaHangTen={day.an_toi_nha_hang_ten}
                nhaHangEmail={day.an_toi_nha_hang_email}
                booking={day.booking_toi}
                tenDoan={tenDoan}
                soKhach={soKhach}
                ngayDate={day.ngay_date}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
