import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Mail, AlertTriangle } from "lucide-react";
import { calcPhiHuySurplus } from "@/lib/phi-huy";
import type { KsPhiHuyPending } from "@/hooks/use-doi-ks-phi-huy";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export interface DoiKsConfirmArgs {
  phiHuy: number;
  lyDo: string;
  /** OP tích "Gửi mail hủy cho KS cũ" (chỉ khả dụng khi booking còn sống + có email). */
  sendHuyMail: boolean;
}

interface Props {
  pending: KsPhiHuyPending | null;
  submitting: boolean;
  /** 'doi' = guard Điều tour (đủ 3 nút); 'resolve' = hoàn tất phí hủy booking đã "Để sau". */
  variant?: "doi" | "resolve";
  onConfirm: (args: DoiKsConfirmArgs) => void;
  /** Đổi KS nhưng để xử lý phí hủy sau ở tab Chi phí (chỉ variant 'doi', chỉ khi có tiền).
   *  Vẫn nhận args: OP tích "gửi mail hủy" rồi bấm "Để sau" thì mail vẫn phải gửi. */
  onDefer?: (args: DoiKsConfirmArgs) => void;
  /** Không đổi nữa — khôi phục KS cũ / đóng modal. */
  onCancel: () => void;
}

// Modal khi KS cũ rời khỏi lịch trình. Gộp 2 quyết định vào 1 màn:
//   1. TIỀN  — KS cũ đã trả bao nhiêu, NCC giữ lại phí hủy bao nhiêu (bắt nhập, kể cả 0).
//   2. BOOKING — KS cũ đã nhận mail đặt phòng thì phải báo hủy (tích sẵn, review trước khi gửi).
// Trước 07/2026 modal chỉ lo (1), còn (2) không tồn tại → OP phải mở Gmail báo tay.
// ĐNTT chưa trả bị tự hủy nay LIỆT KÊ RÕ số hiệu, không còn hủy trong im lặng.
export default function DoiKsPhiHuyModal({
  pending, submitting, variant = "doi", onConfirm, onDefer, onCancel,
}: Props) {
  useTranslate();
  const [phiHuyStr, setPhiHuyStr] = useState("");
  const [lyDo, setLyDo] = useState("");
  const [sendHuyMail, setSendHuyMail] = useState(true);

  const booking = pending?.booking ?? null;
  const canMail = !!booking?.email;

  // Reset input mỗi lần mở cho pending mới. Tích sẵn gửi mail khi có email KS.
  useEffect(() => {
    setPhiHuyStr("");
    setLyDo("");
    setSendHuyMail(!!pending?.booking?.email);
  }, [pending?.oldKsId, pending?.booking?.email]);

  if (!pending) return null;

  const hasPaid = pending.paidTotal > 0;
  const entered = phiHuyStr.trim() !== "";
  const phiHuyNum = Number(phiHuyStr.replace(/\D/g, "")) || 0;
  const preview = calcPhiHuySurplus({
    sumActual: 0, sumPaid: pending.paidTotal, phiHuy: phiHuyNum,
  });
  // Ô phí hủy chỉ bắt buộc khi thật sự đã trả tiền. KS chưa trả đồng nào (hoặc chỉ
  // dính booking) thì không có gì để chia — đừng bắt OP gõ số 0 vô nghĩa.
  const canConfirm = !hasPaid || entered;

  const title = variant === "resolve"
    ? t("Hoàn tất phí hủy khách sạn")
    : hasPaid
      ? t("Đổi khách sạn — xử lý tiền đã thanh toán")
      : t("Đổi khách sạn — xử lý booking cũ");

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !submitting) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-xs">
            {t("Khách sạn")} <span className="font-semibold break-words">{pending.oldKsName}</span>{" "}
            {variant === "resolve"
              ? <>{t("đã hủy, đang chờ chốt phí hủy — đã thanh toán")}{" "}
                  <span className="font-semibold text-orange-700 tabular-nums">{fmt(pending.paidTotal)} ₫</span>.</>
              : hasPaid
                ? <>{t("sẽ bị bỏ khỏi lịch trình nhưng đã thanh toán")}{" "}
                    <span className="font-semibold text-orange-700 tabular-nums">{fmt(pending.paidTotal)} ₫</span>.</>
                : <>{t("sẽ bị bỏ khỏi lịch trình.")}</>}
          </p>

          {pending.unpaidDnttIds.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50/50 px-2 py-1.5 text-[11px] text-amber-800 flex gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span className="break-words">
                {pending.unpaidDnttIds.length} {t("ĐNTT chưa thanh toán sẽ được tự hủy (có ghi log)")}:{" "}
                <span className="font-medium tabular-nums">
                  {pending.unpaidDnttIds.map((id) => `#${id}`).join(", ")}
                </span>
              </span>
            </div>
          )}

          {/* Booking cũ — chỉ hiện khi KS cũ thực sự đã nhận mail đặt phòng */}
          {booking && variant === "doi" && (
            <div className="rounded-md border border-sky-200 bg-sky-50/50 p-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-sky-800">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                {t("Khách sạn này đã nhận mail đặt phòng")}
              </div>
              {canMail ? (
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={sendHuyMail}
                    onCheckedChange={(v) => setSendHuyMail(v === true)}
                    disabled={submitting}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="text-xs min-w-0 break-words">
                    {t("Gửi mail hủy cho")} <span className="font-medium">{pending.oldKsName}</span>
                    <span className="block text-[11px] text-muted-foreground break-words">
                      {booking.email} — {t("sẽ mở bản nháp cho bạn soát trước khi gửi")}
                    </span>
                  </span>
                </label>
              ) : (
                <p className="text-[11px] text-amber-700 break-words">
                  {t("Khách sạn chưa có email trong danh mục — hệ thống chỉ đánh dấu \"chờ xác nhận hủy\", bạn cần báo khách sạn bằng cách khác.")}
                </p>
              )}
            </div>
          )}

          {hasPaid && (
            <div className="space-y-1">
              <Label className="text-xs font-medium">
                {t("Phí hủy (NCC giữ lại)")} <span className="text-destructive">*</span>
              </Label>
              <Input
                autoFocus
                inputMode="numeric"
                value={phiHuyStr}
                onChange={(e) => setPhiHuyStr(e.target.value.replace(/\D/g, ""))}
                placeholder={`${t("Nhập số tiền — 0 nếu hủy miễn phí")} (${t("tối đa")} ${fmt(pending.paidTotal)})`}
                className="h-8 text-xs"
              />
              {entered && (
                <div className="text-[11px] text-muted-foreground tabular-nums space-y-0.5 rounded bg-muted/40 px-2 py-1.5">
                  <div className="flex justify-between">
                    <span>{t("NCC giữ (phí hủy)")}:</span>
                    <span className="font-medium text-orange-700">{fmt(preview.phiHuy)} ₫</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("Ghi công nợ thu hồi")}:</span>
                    <span className="font-medium text-purple-700">{fmt(preview.refund)} ₫</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-medium">
              {booking && sendHuyMail ? t("Lý do hủy (hiện trong mail gửi KS)") : t("Lý do hủy (optional)")}
            </Label>
            <Textarea
              className="text-xs min-h-[48px] resize-none"
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              placeholder={t("VD: bão — đổi sang khách sạn khác…")}
            />
          </div>

          <p className="text-[11px] text-muted-foreground leading-snug break-words">
            {hasPaid
              ? t("Xác nhận: booking KS cũ chuyển trạng thái \"Đã hủy\" (giữ nguyên lịch sử thanh toán, hiện ở dải Đã hủy cuối mục Khách sạn), phần trả dư ghi công nợ NCC để cấn trừ/thu hồi.")
              : t("Xác nhận: booking KS cũ chuyển sang \"Chờ KS xác nhận hủy\" và vẫn nằm ở tab Booking KS để bạn theo dõi. Không có khoản tiền nào bị đụng tới.")}
          </p>
        </div>
        <DialogFooter className="flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="text-xs" disabled={submitting} onClick={onCancel}>
            {variant === "resolve" ? t("Đóng") : t("Hủy đổi KS")}
          </Button>
          {variant === "doi" && onDefer && hasPaid && (
            <Button
              variant="ghost" size="sm" className="text-xs text-muted-foreground" disabled={submitting}
              onClick={() => onDefer({ phiHuy: phiHuyNum, lyDo: lyDo.trim(), sendHuyMail: sendHuyMail && canMail })}
            >
              {t("Để sau (xử ở tab Chi phí)")}
            </Button>
          )}
          <Button
            size="sm"
            className="text-xs bg-orange-600 hover:bg-orange-700 text-white"
            disabled={submitting || !canConfirm}
            onClick={() => onConfirm({ phiHuy: phiHuyNum, lyDo: lyDo.trim(), sendHuyMail: sendHuyMail && canMail })}
          >
            {submitting
              ? t("Đang xử lý...")
              : variant === "resolve"
                ? t("Chốt phí hủy")
                : sendHuyMail && canMail
                  ? t("Soạn mail hủy & đổi KS")
                  : hasPaid ? t("Xác nhận tách & đổi KS") : t("Xác nhận đổi KS")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
