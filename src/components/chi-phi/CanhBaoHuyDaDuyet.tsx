import { AlertTriangle } from "lucide-react";
import { t, useTranslate } from "@/lib/i18n";
import { canCanhBaoHuyDaDuyet } from "@/lib/nhat-ky-dntt";

interface Props {
  /** Trạng thái duyệt của phiếu sắp hủy. */
  trangThaiDuyet: string | null | undefined;
  /** Tổng tiền mặt đã chi cho phiếu (0 = chưa chi đồng nào). */
  daChiCash: number;
}

// Cảnh báo trong ô hủy ĐNTT: phiếu kế toán đã duyệt mà chưa chi đồng nào thì hủy
// là mất luôn chữ ký duyệt — không có đường gỡ duyệt hay sửa, phải trình lại từ
// đầu. Đã xảy ra thật: OP hủy rồi phải nhờ kế toán duyệt lại một phiếu mới y hệt
// chỉ sau đó vài chục giây.
export default function CanhBaoHuyDaDuyet({ trangThaiDuyet, daChiCash }: Props) {
  useTranslate();
  if (!canCanhBaoHuyDaDuyet({ trangThaiDuyet: trangThaiDuyet ?? null, daChiCash })) return null;
  return (
    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
      <span className="break-words min-w-0">
        {t("Phiếu này kế toán ĐÃ duyệt. Hủy xong là mất chữ ký duyệt — phải tạo phiếu mới và trình duyệt lại từ đầu.")}
      </span>
    </div>
  );
}
