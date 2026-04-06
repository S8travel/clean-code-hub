import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutList, Utensils, Clock, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { useBookingNH } from "@/hooks/use-booking-nh";
import { useCurrentUserName } from "@/hooks/use-doan";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import MealCard from "./MealCard";
import MenuOverviewModal from "./MenuOverviewModal";

function fmtDay(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy (EEE)", { locale: vi }); } catch { return d; }
}

interface Props {
  doanId: number;
  tenDoan: string;
  soKhach: number;
}

export default function BookingNHTab({ doanId, tenDoan, soKhach }: Props) {
  const { data: days = [], isLoading } = useBookingNH(doanId);
  const { data: currentUserName = "" } = useCurrentUserName();
  const qc = useQueryClient();
  const [overviewOpen, setOverviewOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  const daysWithNH = days.filter((d) => d.an_trua_nha_hang_id || d.an_toi_nha_hang_id || d.orphan_trua || d.orphan_toi);

  // Stats
  const allBookings = days.flatMap((d) => [d.booking_trua, d.booking_toi].filter(Boolean));
  const totalMeals = days.reduce(
    (s, d) => s + (d.an_trua_nha_hang_id ? 1 : 0) + (d.an_toi_nha_hang_id ? 1 : 0),
    0
  );
  const sentCount      = allBookings.filter((b) => b?.booking_status === "da_gui").length;
  const confirmedCount = allBookings.filter((b) => b?.booking_status === "nh_xac_nhan").length;
  const cancelledCount = allBookings.filter((b) => b?.booking_status === "da_huy").length;

  const stats = [
    { icon: Utensils,     label: "Bữa ăn",       value: totalMeals,    cls: "text-foreground" },
    { icon: Clock,        label: "Chờ xác nhận", value: sentCount,     cls: "text-amber-600" },
    { icon: CheckCircle2, label: "Đã xác nhận",  value: confirmedCount, cls: "text-emerald-600" },
    { icon: XCircle,      label: "Đã hủy",        value: cancelledCount, cls: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Booking Nhà hàng</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Từ điều tour — mỗi bữa ăn 1 booking riêng
          </p>
        </div>
        {daysWithNH.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setOverviewOpen(true)}>
            <LayoutList className="h-4 w-4 mr-1.5" />
            Menu tổng quan
          </Button>
        )}
      </div>

      {/* Stats */}
      {totalMeals > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {stats.map(({ icon: Icon, label, value, cls }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={cn("h-3.5 w-3.5", cls)} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <p className={cn("text-2xl font-bold", cls)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {daysWithNH.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-14 text-center">
          <Utensils className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Chưa có nhà hàng nào</p>
          <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">
            Chọn nhà hàng cho từng ngày trong tab Điều tour, sau đó lưu để hiển thị ở đây.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {daysWithNH.map((day) => (
            <div key={day.doan_ngay_id} className="space-y-2">
              {/* Day header */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Ngày {day.ngay_so}</span>
                <span className="text-xs text-muted-foreground">{fmtDay(day.ngay_date)}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Meal cards */}
              <div className="grid grid-cols-1 gap-2">
                {day.an_trua_nha_hang_id && (
                  <MealCard
                    doanId={doanId}
                    doanNgayId={day.doan_ngay_id}
                    buaAn="trua"
                    nhaHangId={day.an_trua_nha_hang_id}
                    nhaHangTen={day.an_trua_nha_hang_ten}
                    nhaHangEmail={day.an_trua_nha_hang_email}
                    booking={day.booking_trua}
                    currentUserName={currentUserName}
                    conTrongDieuTour={day.trua_con_trong_tour}
                    setMenuIdFromDieuTour={day.an_trua_set_menu_id}
                    tenDoan={tenDoan}
                    soKhach={soKhach}
                    ngayDate={day.ngay_date}
                  />
                )}
                {day.orphan_trua && (
                  <MealCard
                    doanId={doanId}
                    doanNgayId={day.doan_ngay_id}
                    buaAn="trua"
                    nhaHangId={day.orphan_trua.nha_hang_id}
                    nhaHangTen={day.orphan_trua.nha_hang_ten}
                    nhaHangEmail={day.orphan_trua.nha_hang_email}
                    booking={day.orphan_trua.booking}
                    currentUserName={currentUserName}
                    conTrongDieuTour={false}
                    tenDoan={tenDoan}
                    soKhach={soKhach}
                    ngayDate={day.ngay_date}
                  />
                )}
                {day.an_toi_nha_hang_id && (
                  <MealCard
                    doanId={doanId}
                    doanNgayId={day.doan_ngay_id}
                    buaAn="toi"
                    nhaHangId={day.an_toi_nha_hang_id}
                    nhaHangTen={day.an_toi_nha_hang_ten}
                    nhaHangEmail={day.an_toi_nha_hang_email}
                    booking={day.booking_toi}
                    currentUserName={currentUserName}
                    conTrongDieuTour={day.toi_con_trong_tour}
                    setMenuIdFromDieuTour={day.an_toi_set_menu_id}
                    tenDoan={tenDoan}
                    soKhach={soKhach}
                    ngayDate={day.ngay_date}
                  />
                )}
                {day.orphan_toi && (
                  <MealCard
                    doanId={doanId}
                    doanNgayId={day.doan_ngay_id}
                    buaAn="toi"
                    nhaHangId={day.orphan_toi.nha_hang_id}
                    nhaHangTen={day.orphan_toi.nha_hang_ten}
                    nhaHangEmail={day.orphan_toi.nha_hang_email}
                    booking={day.orphan_toi.booking}
                    currentUserName={currentUserName}
                    conTrongDieuTour={false}
                    tenDoan={tenDoan}
                    soKhach={soKhach}
                    ngayDate={day.ngay_date}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Overview Modal */}
      <MenuOverviewModal
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        doanId={doanId}
        days={days}
        onUpdated={() => qc.invalidateQueries({ queryKey: ["doan_booking_nh", doanId] })}
      />
    </div>
  );
}
