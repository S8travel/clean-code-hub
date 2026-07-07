import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcPhiHuySurplus } from "@/lib/phi-huy";
import type { KsPhiHuyPending } from "@/hooks/use-doi-ks-phi-huy";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface Props {
  pending: KsPhiHuyPending | null;
  submitting: boolean;
  /** Xác nhận tách: phí hủy NCC giữ (đã nhập), phần còn lại thành công nợ. */
  onConfirm: (phiHuy: number) => void;
  /** Đổi KS nhưng để xử lý phí hủy sau ở tab Chi phí (mục KS ngoài tour). */
  onDefer: () => void;
  /** Không đổi nữa — khôi phục KS cũ, không lưu. */
  onCancel: () => void;
}

// Modal chặn autosave Điều tour khi đổi KS mà KS cũ đã có ĐNTT trả tiền.
// Ô phí hủy BẮT NHẬP (kể cả 0) — tránh OP lướt nhanh bỏ sót charge của NCC.
export default function DoiKsPhiHuyModal({
  pending, submitting, onConfirm, onDefer, onCancel,
}: Props) {
  useTranslate();
  const [phiHuyStr, setPhiHuyStr] = useState("");

  // Reset input mỗi lần mở cho pending mới
  useEffect(() => { setPhiHuyStr(""); }, [pending?.oldKsId]);

  if (!pending) return null;

  const entered = phiHuyStr.trim() !== "";
  const phiHuyNum = Number(phiHuyStr.replace(/\D/g, "")) || 0;
  const preview = calcPhiHuySurplus({
    sumActual: 0, sumPaid: pending.paidTotal, phiHuy: phiHuyNum,
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !submitting) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {t("Đổi khách sạn — xử lý tiền đã thanh toán")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-xs">
            {t("Khách sạn")} <span className="font-semibold">{pending.oldKsName}</span>{" "}
            {t("sẽ bị bỏ khỏi lịch trình nhưng đã thanh toán")}{" "}
            <span className="font-semibold text-orange-700 tabular-nums">{fmt(pending.paidTotal)} ₫</span>.
          </p>
          {pending.unpaidDnttIds.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              ⚠ {pending.unpaidDnttIds.length} {t("đề nghị thanh toán chưa trả của KS này sẽ được tự hủy (có ghi log).")}
            </p>
          )}

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

          <p className="text-[11px] text-muted-foreground leading-snug">
            {t("Xác nhận: KS cũ chuyển thành mục \"KS ngoài tour — phí hủy\" (giữ nguyên lịch sử thanh toán), phần trả dư ghi công nợ NCC để cấn trừ/thu hồi. Sau đó lịch trình lưu với KS mới.")}
          </p>
        </div>
        <DialogFooter className="flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="text-xs" disabled={submitting} onClick={onCancel}>
            {t("Hủy đổi KS")}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" disabled={submitting} onClick={onDefer}>
            {t("Để sau (xử ở tab Chi phí)")}
          </Button>
          <Button
            size="sm"
            className="text-xs bg-orange-600 hover:bg-orange-700 text-white"
            disabled={submitting || !entered}
            onClick={() => onConfirm(phiHuyNum)}
          >
            {submitting ? t("Đang xử lý...") : t("Xác nhận tách & đổi KS")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
