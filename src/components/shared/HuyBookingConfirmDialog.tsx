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

export interface HuyBookingConfirmArgs {
  lyDo: string;
  sendMail: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Tên NCC hiển thị (nhà hàng / nhà cung cấp). */
  tenNcc: string;
  /** Loại NCC cho câu chữ: "nhà hàng" | "nhà cung cấp". */
  loaiNcc: string;
  /** NCC có email trong hệ thống → mới cho gửi mail hủy. */
  hasEmail: boolean;
  submitting: boolean;
  onConfirm: (args: HuyBookingConfirmArgs) => void;
}

// Xác nhận hủy booking NH/DV — mirror HuyBookingKsDialog. Trước đây nút "Hủy" đổi
// trạng thái NGAY, không hỏi, không mail → NCC chẳng bao giờ biết mình bị hủy.
// Opt-in + soát bắt buộc: tick "Gửi mail hủy" → mở bản nháp cho OP soát trước khi
// gửi (không auto-bắn cho NCC).
export default function HuyBookingConfirmDialog({
  open, onOpenChange, tenNcc, loaiNcc, hasEmail, submitting, onConfirm,
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
          <DialogTitle className="text-sm">{t("Hủy booking")} — {tenNcc}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-xs break-words">
            {t("Booking của")} <span className="font-semibold">{tenNcc}</span>{" "}
            {t("sẽ chuyển sang \"Chờ xác nhận hủy\". Không có khoản tiền nào bị đụng tới — chi phí và ĐNTT (nếu có) xử lý riêng ở tab Chi phí.")}
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
                  <Mail className="h-3.5 w-3.5 shrink-0" /> {t("Gửi mail hủy cho")} {loaiNcc}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {t("sẽ mở bản nháp cho bạn soát trước khi gửi")}
                </span>
              </span>
            </label>
          ) : (
            <p className="text-[11px] text-amber-700 break-words">
              {t("NCC chưa có email trong hệ thống — chỉ đổi trạng thái, bạn cần báo bằng cách khác.")}
            </p>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-medium">
              {sendMail && hasEmail ? t("Lý do hủy (hiện trong mail gửi NCC)") : t("Lý do hủy (optional)")}
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
