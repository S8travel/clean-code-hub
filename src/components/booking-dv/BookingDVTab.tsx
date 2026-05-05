import { useBookingDVList } from "@/hooks/use-booking-dv";
import { useCurrentUserName } from "@/hooks/use-doan";
import { useBookingXe } from "@/hooks/use-booking-xe";
import { useBookingVisaList, useInsertBookingVisa } from "@/hooks/use-booking-visa";
import { useDonViVisaList } from "@/hooks/use-visa";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PackageSearch, Clock, CheckCircle2, XCircle, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import BookingDVCard from "./BookingDVCard";
import BookingXeCard from "./BookingXeCard";
import BookingVisaCard from "./BookingVisaCard";
import type { DieuTourExportData } from "@/lib/export-dieu-tour-word";

interface XeInfo {
  id: number;
  ten_xe: string;
  so_cho: number | null;
  nha_xe: { id: number; ten: string; email: string | null; so_dien_thoai: string | null } | null;
}

interface Props {
  doanId: number;
  tenDoan: string;
  hdvTen?: string;
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

export default function BookingDVTab({
  doanId, tenDoan, ngayDi, ngayVe, chuyenBayDon, chuyenBayTien,
  hdvName, soKhach, soKhachLon = 0, soKhachEm1 = 0, soKhachEm2 = 0, soKhachTl = 0,
  xe, dieuTourExportData,
}: Props) {
  const { data: rows, isLoading: dvLoading } = useBookingDVList(doanId);
  const { data: xeBooking, isLoading: xeLoading } = useBookingXe(doanId);
  const { data: visaList = [], isLoading: visaLoading } = useBookingVisaList(doanId);
  const { data: donViVisaList = [] } = useDonViVisaList();
  const { data: currentUserName = "" } = useCurrentUserName();
  const insertVisa = useInsertBookingVisa();

  const isLoading = dvLoading || xeLoading || visaLoading;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[120px] w-full" />
        <Skeleton className="h-[120px] w-full" />
        <Skeleton className="h-[180px] w-full" />
      </div>
    );
  }

  const total = rows?.length ?? 0;
  const pendingCount = rows?.filter((r) => r.booking_status === "cho_xac_nhan").length ?? 0;
  const confirmedCount = rows?.filter((r) => r.booking_status === "da_xac_nhan").length ?? 0;
  const cancelledCount = rows?.filter((r) => r.booking_status === "da_huy").length ?? 0;

  const stats = [
    { icon: PackageSearch, label: "Dịch vụ", value: total,          cls: "text-foreground" },
    { icon: Clock,         label: "Chờ xác nhận", value: pendingCount,   cls: "text-amber-600" },
    { icon: CheckCircle2,  label: "Đã xác nhận",  value: confirmedCount, cls: "text-emerald-600" },
    { icon: XCircle,       label: "Đã hủy",        value: cancelledCount, cls: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Section: Xe ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Xe</h3>
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
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Visa</h3>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => insertVisa.mutate({ doan_id: doanId })}
          >
            <Plus className="h-3 w-3" /> Thêm đơn vị visa
          </Button>
        </div>
        {visaList.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">Chưa có booking visa nào. Nhấn "Thêm đơn vị visa" để tạo.</p>
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

      {/* ── Section: Dịch vụ thông thường ───────────────────────────── */}
      <div className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dịch vụ</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tự động sync khi lưu điều tour
          </p>
        </div>

        {total > 0 && (
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

        {total === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <PackageSearch className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Chưa có dịch vụ nào</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Thêm dịch vụ có phí (công ty thanh toán) vào tab Điều tour, sau đó lưu để sync về đây.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows!.map((row) => (
              <BookingDVCard
                key={row.id}
                row={row}
                tenDoan={tenDoan}
                ngayDi={ngayDi}
                currentUserName={currentUserName}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
