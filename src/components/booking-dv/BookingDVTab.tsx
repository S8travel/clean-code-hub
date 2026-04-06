import { useBookingDVList } from "@/hooks/use-booking-dv";
import { useCurrentUserName } from "@/hooks/use-doan";
import { Skeleton } from "@/components/ui/skeleton";
import { PackageSearch, Clock, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import BookingDVCard from "./BookingDVCard";

interface Props {
  doanId: number;
  tenDoan: string;
  hdvTen?: string;
  ngayDi?: string | null;
}

export default function BookingDVTab({ doanId, tenDoan, ngayDi }: Props) {
  const { data: rows, isLoading } = useBookingDVList(doanId);
  const { data: currentUserName = "" } = useCurrentUserName();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[180px] w-full" />
        <Skeleton className="h-[180px] w-full" />
      </div>
    );
  }

  const total = rows?.length ?? 0;
  const pendingCount = rows?.filter((r) => r.booking_status === "cho_xac_nhan").length ?? 0;
  const confirmedCount = rows?.filter((r) => r.booking_status === "da_xac_nhan").length ?? 0;
  const cancelledCount = rows?.filter((r) => r.booking_status === "da_huy").length ?? 0;

  const stats = [
    { icon: PackageSearch, label: "Nhà cung cấp", value: total,          cls: "text-foreground" },
    { icon: Clock,         label: "Chờ xác nhận", value: pendingCount,   cls: "text-amber-600" },
    { icon: CheckCircle2,  label: "Đã xác nhận",  value: confirmedCount, cls: "text-emerald-600" },
    { icon: XCircle,       label: "Đã hủy",        value: cancelledCount, cls: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold">Booking Dịch vụ</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Dịch vụ công ty thanh toán — tự động sync khi lưu điều tour
        </p>
      </div>

      {/* Stats */}
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

      {/* Empty state */}
      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-14 text-center">
          <PackageSearch className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Chưa có dịch vụ nào</p>
          <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">
            Thêm dịch vụ có phí (công ty thanh toán) vào tab Điều tour, sau đó lưu để tự động sync về đây.
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
  );
}
