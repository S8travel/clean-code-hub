import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MailDriftItem } from "@/lib/mail-drift";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  items: MailDriftItem[];
  /** Đang chặn gửi (OP chưa chọn dựng lại hay vẫn gửi). */
  chanGui: boolean;
  /** Dựng lại tiêu đề + nội dung theo dữ liệu mới — GHI ĐÈ phần OP gõ tay. */
  onDungLai: () => void;
  /** Bỏ qua cảnh báo, gửi nguyên bản đang soạn. */
  onBoQua: () => void;
}

/**
 * Banner cảnh báo trong cửa sổ soạn mail: dữ liệu booking đã đổi SAU khi nội
 * dung mail được dựng. Dùng chung cho mọi tab booking (KS, NH, DV, xe, visa,
 * tàu ngày) — xem `lib/mail-drift.ts` cho bối cảnh.
 */
export default function MailDriftWarning({ items, chanGui, onDungLai, onBoQua }: Props) {
  useTranslate();
  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0 text-xs text-amber-900 space-y-1">
          <p className="font-semibold">{t("Dữ liệu booking đã đổi sau khi nội dung mail được dựng")}</p>
          <ul className="space-y-0.5">
            {items.map((it) => (
              <li key={it.nhan} className="break-words">
                <span className="font-medium">{t(it.nhan)}:</span>{" "}
                <span className="line-through opacity-70">{it.truoc}</span>
                {" → "}
                <span className="font-semibold">{it.sau}</span>
              </li>
            ))}
          </ul>
          <p>{t("Nội dung đang soạn vẫn theo số liệu cũ — gửi đi là đối tác nhận sai.")}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-6">
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={onDungLai}
          title={t("Ghi đè nội dung đang soạn bằng bản dựng lại từ dữ liệu mới")}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          {t("Dựng lại nội dung mail")}
        </Button>
        {chanGui && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onBoQua}
            title={t("Booking sẽ bị đánh dấu \"Có thay đổi\" để nhớ gửi cập nhật sau")}
          >
            {t("Vẫn gửi bản đang soạn")}
          </Button>
        )}
      </div>
    </div>
  );
}
