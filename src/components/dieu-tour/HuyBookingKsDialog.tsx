import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail } from "lucide-react";
import { t, useTranslate } from "@/lib/i18n";

export interface HuyBookingKsArgs {
  lyDo: string;
  sendMail: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  khachSanTen: string;
  /** KS có email trong danh mục → cho phép gửi mail hủy. */
  hasEmail: boolean;
  submitting: boolean;
  onConfirm: (args: HuyBookingKsArgs) => void;
}

// Xác nhận hủy booking KS từ tab Booking KS. Trước 07/2026 nút "Hủy booking" đổi
// trạng thái NGAY, không hỏi, không mail — KS cũ chẳng bao giờ biết mình bị hủy.
//
// 2 NÚT thay vì checkbox: muốn hủy KHÔNG gửi mail thì trước đây phải bỏ tick rồi mới
// bấm — OP không nhận ra. Nay mỗi lựa chọn là 1 nút riêng (mirror HuyBookingConfirmDialog).
export default function HuyBookingKsDialog({
  open, onOpenChange, khachSanTen, hasEmail, submitting, onConfirm,
}: Props) {
  useTranslate();
  const [lyDo, setLyDo] = useState("");
  // Nút nào đang chạy — để chỉ nút đó hiện "Đang xử lý...", nút kia chỉ mờ đi.
  const [pending, setPending] = useState<"mail" | "no_mail" | null>(null);

  useEffect(() => {
    if (open) { setLyDo(""); setPending(null); }
  }, [open]);

  const huy = (sendMail: boolean) => {
    setPending(sendMail ? "mail" : "no_mail");
    onConfirm({ lyDo: lyDo.trim(), sendMail });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{t("Hủy booking khách sạn")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-xs break-words">
            {t("Booking của")} <span className="font-semibold">{khachSanTen}</span>{" "}
            {t("sẽ chuyển sang \"Chờ KS xác nhận hủy\". Không có khoản tiền nào bị đụng tới — chi phí và ĐNTT (nếu có) xử lý riêng ở tab Chi phí.")}
          </p>

          {hasEmail ? (
            <p className="rounded-md border border-sky-200 bg-sky-50/50 p-2 break-words">
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <Mail className="h-3.5 w-3.5 shrink-0" /> {t("Gửi mail hủy cho khách sạn")}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {t("sẽ mở bản nháp cho bạn soát trước khi gửi")}
              </span>
            </p>
          ) : (
            <p className="text-[11px] text-amber-700 break-words">
              {t("Khách sạn chưa có email trong danh mục — hệ thống chỉ đổi trạng thái, bạn cần báo khách sạn bằng cách khác.")}
            </p>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-medium">
              {hasEmail ? t("Lý do hủy (hiện trong mail nếu bạn chọn gửi)") : t("Lý do hủy (optional)")}
            </Label>
            <Textarea
              className="text-xs min-h-[48px] resize-none"
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              placeholder={t("VD: khách đổi lịch, đoàn hủy…")}
            />
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="text-xs" disabled={submitting}
            onClick={() => onOpenChange(false)}>
            {t("Đóng")}
          </Button>
          {/* Hủy KHÔNG gửi mail — luôn hiện. Khi KS không có email thì đây là nút duy nhất. */}
          <Button
            variant="outline" size="sm"
            className="text-xs border-red-300 text-red-700 hover:bg-red-50"
            disabled={submitting}
            onClick={() => huy(false)}
          >
            {pending === "no_mail" ? t("Đang xử lý...") : hasEmail ? t("Hủy, không gửi mail") : t("Hủy booking")}
          </Button>
          {hasEmail && (
            <Button
              size="sm"
              className="text-xs bg-red-600 hover:bg-red-700 text-white"
              disabled={submitting}
              onClick={() => huy(true)}
            >
              {pending === "mail" ? t("Đang xử lý...") : t("Soạn mail hủy")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
