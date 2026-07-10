import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
export default function HuyBookingKsDialog({
  open, onOpenChange, khachSanTen, hasEmail, submitting, onConfirm,
}: Props) {
  useTranslate();
  const [lyDo, setLyDo] = useState("");
  const [sendMail, setSendMail] = useState(hasEmail);

  useEffect(() => {
    if (open) { setLyDo(""); setSendMail(hasEmail); }
  }, [open, hasEmail]);

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
            <label className="flex items-start gap-2 cursor-pointer rounded-md border border-sky-200 bg-sky-50/50 p-2">
              <Checkbox
                checked={sendMail}
                onCheckedChange={(v) => setSendMail(v === true)}
                disabled={submitting}
                className="mt-0.5 shrink-0"
              />
              <span className="text-xs min-w-0 break-words">
                <span className="inline-flex items-center gap-1 font-medium">
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {t("Gửi mail hủy cho khách sạn")}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {t("sẽ mở bản nháp cho bạn soát trước khi gửi")}
                </span>
              </span>
            </label>
          ) : (
            <p className="text-[11px] text-amber-700 break-words">
              {t("Khách sạn chưa có email trong danh mục — hệ thống chỉ đổi trạng thái, bạn cần báo khách sạn bằng cách khác.")}
            </p>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-medium">
              {sendMail && hasEmail ? t("Lý do hủy (hiện trong mail gửi KS)") : t("Lý do hủy (optional)")}
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
          <Button
            size="sm"
            className="text-xs bg-red-600 hover:bg-red-700 text-white"
            disabled={submitting}
            onClick={() => onConfirm({ lyDo: lyDo.trim(), sendMail: sendMail && hasEmail })}
          >
            {submitting
              ? t("Đang xử lý...")
              : sendMail && hasEmail ? t("Soạn mail hủy") : t("Hủy booking")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
