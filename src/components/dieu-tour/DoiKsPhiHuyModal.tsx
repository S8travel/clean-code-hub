import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { calcPhiHuySurplus } from "@/lib/phi-huy";
import type { KsPhiHuyPending } from "@/hooks/use-doi-ks-phi-huy";
import { t, useTranslate } from "@/lib/i18n";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

interface Props {
  pending: KsPhiHuyPending | null;
  submitting: boolean;
  /** 'doi' = guard Điều tour (đủ 3 nút); 'resolve' = hoàn tất phí hủy booking đã "Để sau". */
  variant?: "doi" | "resolve";
  /** Xác nhận tách: phí hủy NCC giữ (đã nhập) + lý do, phần còn lại thành công nợ. */
  onConfirm: (phiHuy: number, lyDo: string) => void;
  /** Đổi KS nhưng để xử lý phí hủy sau ở tab Chi phí (chỉ variant 'doi'). */
  onDefer?: () => void;
  /** Không đổi nữa — khôi phục KS cũ / đóng modal. */
  onCancel: () => void;
}

// Modal phí hủy KS: chặn autosave Điều tour khi đổi KS mà KS cũ đã trả tiền (variant
// 'doi'), hoặc hoàn tất phí hủy cho booking đã "Để sau" từ dải Đã hủy (variant 'resolve').
// Ô phí hủy BẮT NHẬP (kể cả 0) — tránh OP lướt nhanh bỏ sót charge của NCC.
export default function DoiKsPhiHuyModal({
  pending, submitting, variant = "doi", onConfirm, onDefer, onCancel,
}: Props) {
  useTranslate();
  const [phiHuyStr, setPhiHuyStr] = useState("");
  const [lyDo, setLyDo] = useState("");

  // Reset input mỗi lần mở cho pending mới
  useEffect(() => { setPhiHuyStr(""); setLyDo(""); }, [pending?.oldKsId]);

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
            {variant === "resolve"
              ? t("Hoàn tất phí hủy khách sạn")
              : t("Đổi khách sạn — xử lý tiền đã thanh toán")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <p className="text-xs">
            {t("Khách sạn")} <span className="font-semibold">{pending.oldKsName}</span>{" "}
            {variant === "resolve"
              ? t("đã hủy, đang chờ chốt phí hủy — đã thanh toán")
              : t("sẽ bị bỏ khỏi lịch trình nhưng đã thanh toán")}{" "}
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

          <div className="space-y-1">
            <Label className="text-xs font-medium">{t("Lý do hủy (optional)")}</Label>
            <Textarea
              className="text-xs min-h-[48px] resize-none"
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              placeholder={t("VD: bão — đổi sang khách sạn khác…")}
            />
          </div>

          <p className="text-[11px] text-muted-foreground leading-snug">
            {t("Xác nhận: booking KS cũ chuyển trạng thái \"Đã hủy\" (giữ nguyên lịch sử thanh toán, hiện ở dải Đã hủy cuối mục Khách sạn), phần trả dư ghi công nợ NCC để cấn trừ/thu hồi.")}
          </p>
        </div>
        <DialogFooter className="flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="text-xs" disabled={submitting} onClick={onCancel}>
            {variant === "resolve" ? t("Đóng") : t("Hủy đổi KS")}
          </Button>
          {variant === "doi" && onDefer && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" disabled={submitting} onClick={onDefer}>
              {t("Để sau (xử ở tab Chi phí)")}
            </Button>
          )}
          <Button
            size="sm"
            className="text-xs bg-orange-600 hover:bg-orange-700 text-white"
            disabled={submitting || !entered}
            onClick={() => onConfirm(phiHuyNum, lyDo.trim())}
          >
            {submitting
              ? t("Đang xử lý...")
              : variant === "resolve" ? t("Chốt phí hủy") : t("Xác nhận tách & đổi KS")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
