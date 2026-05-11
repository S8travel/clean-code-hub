import { useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Pencil, Trash2, Mail, Check, X, MapPin, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DeleteDialog } from "@/components/DeleteDialog";
import {
  useDeleteLockPhong,
  useUpdateLockPhongKSEmail,
  type LockPhongDisplay,
  type LockPhongKSDisplay,
} from "@/hooks/use-lock-phong";
import LockPhongEmailModal from "./LockPhongEmailModal";
import { isMailDirty } from "@/lib/mail-content-hash";

function buildLockPhongMailFields(hotel: LockPhongKSDisplay) {
  return {
    khach_san_id: hotel.khach_san_id,
    check_in: hotel.check_in,
    check_out: hotel.check_out,
    so_phong: hotel.so_phong ?? "",
    ghi_chu: hotel.ghi_chu ?? "",
  };
}

export function isLockPhongDirty(hotel: LockPhongKSDisplay): boolean {
  const isActive = ["cho_xac_nhan", "da_xac_nhan"].includes(hotel.email_status);
  if (!isActive) return false;
  return isMailDirty(hotel.email_sent_at, hotel.mail_content_hash, buildLockPhongMailFields(hotel));
}

function fmtDate(d: string) {
  try {
    return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: vi });
  } catch {
    return d;
  }
}

function EmailStatusBadge({ status }: { status: string }) {
  if (status === "da_xac_nhan")
    return <Badge className="text-[10px] bg-teal-100 text-teal-700 border-0">Đã xác nhận</Badge>;
  if (status === "cho_xac_nhan")
    return <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">Chờ xác nhận</Badge>;
  if (status === "da_huy")
    return <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Đã hủy</Badge>;
  return (
    <Badge className="text-[10px] bg-muted text-muted-foreground border-0">Chưa gửi</Badge>
  );
}

interface HotelRowProps {
  hotel: LockPhongKSDisplay;
  lockPhong: LockPhongDisplay;
}

function HotelRow({ hotel, lockPhong }: HotelRowProps) {
  const [emailOpen, setEmailOpen] = useState(false);
  const updateEmailMut = useUpdateLockPhongKSEmail();

  const handleConfirm = async () => {
    try {
      await updateEmailMut.mutateAsync({
        id: hotel.id,
        fields: {
          email_status: "da_xac_nhan",
          email_confirm_at: new Date().toISOString(),
        },
      });
      toast.success("Đã đánh dấu xác nhận");
    } catch {
      toast.error("Lỗi cập nhật trạng thái");
    }
  };

  const handleCancel = async () => {
    try {
      await updateEmailMut.mutateAsync({ id: hotel.id, fields: { email_status: "da_huy" } });
      toast.success("Đã hủy");
    } catch {
      toast.error("Lỗi cập nhật trạng thái");
    }
  };

  const handleReset = async () => {
    try {
      await updateEmailMut.mutateAsync({ id: hotel.id, fields: { email_status: "chua_gui" } });
    } catch {
      toast.error("Lỗi cập nhật trạng thái");
    }
  };

  return (
    <>
      <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{hotel.khach_san_ten}</span>
            {hotel.khach_san_dia_diem && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {hotel.khach_san_dia_diem}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{fmtDate(hotel.check_in)}</span>
            <ArrowRight className="h-3 w-3" />
            <span>{fmtDate(hotel.check_out)}</span>
            <span className="text-foreground font-medium">({hotel.so_dem} đêm)</span>
            {hotel.so_phong && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{hotel.so_phong}</span>
              </>
            )}
          </div>
          {hotel.ghi_chu && (
            <p className="text-xs text-muted-foreground italic">{hotel.ghi_chu}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isLockPhongDirty(hotel) && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700 flex items-center gap-1" title="Nội dung đã thay đổi so với mail gần nhất — gửi cập nhật để đồng bộ">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              Có thay đổi
            </span>
          )}
          <EmailStatusBadge status={hotel.email_status} />

          {/* Actions based on status */}
          {hotel.email_status === "cho_xac_nhan" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-teal-600 hover:text-teal-700"
              title="Đánh dấu đã xác nhận"
              onClick={handleConfirm}
              disabled={updateEmailMut.isPending}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}

          {(hotel.email_status === "cho_xac_nhan" || hotel.email_status === "da_xac_nhan") && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              title="Hủy"
              onClick={handleCancel}
              disabled={updateEmailMut.isPending}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}

          {hotel.email_status === "da_huy" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground text-[10px]"
              title="Reset về chưa gửi"
              onClick={handleReset}
              disabled={updateEmailMut.isPending}
            >
              ↺
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-7 gap-1 text-xs",
              hotel.email_status === "chua_gui"
                ? "text-primary border-primary/30 hover:bg-primary/5"
                : hotel.email_sent_at
                ? "text-amber-700 border-amber-300 hover:bg-amber-50"
                : "text-muted-foreground"
            )}
            onClick={() => setEmailOpen(true)}
            title={hotel.email_sent_at ? "Gửi email cập nhật — sẽ thread vào mail cũ" : undefined}
          >
            <Mail className="h-3 w-3" />
            {hotel.email_status === "chua_gui"
              ? "Gửi email"
              : hotel.email_sent_at
              ? "Gửi cập nhật"
              : "Gửi lại"}
          </Button>
        </div>
      </div>

      {emailOpen && (
        <LockPhongEmailModal
          open={emailOpen}
          onOpenChange={setEmailOpen}
          lockPhong={lockPhong}
          ksRow={hotel}
          mode={hotel.email_sent_at ? "update" : "first"}
        />
      )}
    </>
  );
}

interface Props {
  entry: LockPhongDisplay;
  onEdit: (entry: LockPhongDisplay) => void;
}

export default function LockPhongCard({ entry, onEdit }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteMut = useDeleteLockPhong();

  const handleDelete = async () => {
    try {
      await deleteMut.mutateAsync(entry.id);
      toast.success("Đã xóa lock phòng");
    } catch {
      toast.error("Lỗi khi xóa");
    }
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-border bg-muted/20">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{entry.ten_doan}</span>
              <Badge variant="outline" className="text-[10px] font-normal">
                {entry.ten_seri}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ngày xuất phát: {fmtDate(entry.ngay_xuat_phat)}
            </p>
            {entry.ghi_chu && (
              <p className="text-xs text-muted-foreground italic mt-0.5">{entry.ghi_chu}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(entry)}
              title="Chỉnh sửa"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              title="Xóa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Hotels */}
        <div className="px-4">
          {entry.hotels.length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">Chưa có khách sạn nào</p>
          ) : (
            entry.hotels.map((hotel) => (
              <HotelRow key={hotel.id} hotel={hotel} lockPhong={entry} />
            ))
          )}
        </div>
      </div>

      <DeleteDialog
        open={deleteOpen}
        name={entry.ten_doan}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        isDeleting={deleteMut.isPending}
        description={`Lock phòng "${entry.ten_doan}" sẽ bị xóa vĩnh viễn cùng toàn bộ dữ liệu khách sạn liên quan.`}
      />
    </>
  );
}
