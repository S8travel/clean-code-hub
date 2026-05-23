import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  open: boolean;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  // Customization for different dialog types
  title?: string;
  description?: string;
  confirmLabel?: string;
  confirmLoadingLabel?: string;
  variant?: "delete" | "cancel";
}

export function DeleteDialog({
  open,
  name,
  onConfirm,
  onCancel,
  isDeleting,
  title,
  description,
  confirmLabel,
  confirmLoadingLabel,
  variant = "delete",
}: Props) {
  useTranslate();
  const isCancel = variant === "cancel";

  const defaultTitle = isCancel ? t("Hủy đoàn?") : t("Xác nhận xóa?");
  const defaultDesc = isCancel
    ? `${t("Đoàn")} "${name}" ${t("sẽ được chuyển sang trạng thái Đã hủy. Dữ liệu vẫn được giữ lại.")}`
    : `${t("Đoàn")} "${name}" ${t("sẽ bị xóa vĩnh viễn. Không thể khôi phục lại.")}`;
  const defaultConfirm = isCancel ? t("Hủy đoàn") : t("Xóa");
  const defaultLoading = isCancel ? t("Đang hủy...") : t("Đang xóa...");

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[2px]"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-background rounded-xl shadow-card p-6 border border-border/40"
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full shrink-0 ${isCancel ? "bg-amber-100" : "bg-destructive/10"}`}>
                {isCancel
                  ? <Ban className="h-4 w-4 text-amber-600" />
                  : <AlertTriangle className="h-4 w-4 text-destructive" />
                }
              </div>
              <div>
                <h3 className="font-semibold text-body">{title ?? defaultTitle}</h3>
                <p className="text-muted-foreground text-[13px] mt-1">
                  {description ?? defaultDesc}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={onCancel} className="active:scale-[0.98]">
                {t("Đóng")}
              </Button>
              <Button
                variant={isCancel ? "outline" : "destructive"}
                size="sm"
                onClick={onConfirm}
                disabled={isDeleting}
                className={`active:scale-[0.98] ${isCancel ? "border-amber-400 text-amber-700 hover:bg-amber-50" : ""}`}
              >
                {isDeleting
                  ? (confirmLoadingLabel ?? defaultLoading)
                  : (confirmLabel ?? defaultConfirm)
                }
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
