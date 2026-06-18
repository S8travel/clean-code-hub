import { useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useDoanLockInfo, useToggleQuyetToanMoKhoa } from "@/hooks/use-doan";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";

/**
 * Banner trạng thái khóa quyết toán trên trang đoàn.
 * - Đoàn đã KTT-duyệt quyết toán + chưa mở khóa → banner đỏ "đã khóa" (mọi người thấy).
 * - Admin đã mở khóa tạm → banner xanh "đang mở khóa" + nhắc khóa lại.
 * Nút Mở khóa / Khóa lại CHỈ admin thấy. Chưa quyết toán → không render gì.
 */
export function DoanQuyetToanLockBar({ doanId }: { doanId: number }) {
  useTranslate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: info } = useDoanLockInfo(doanId);
  const toggle = useToggleQuyetToanMoKhoa();
  const [openMoKhoa, setOpenMoKhoa] = useState(false);
  const [lyDo, setLyDo] = useState("");

  if (!info?.kttApproved) return null; // chưa quyết toán → không khóa

  const moKhoa = info.moKhoa;

  const handleMoKhoa = async () => {
    try {
      await toggle.mutateAsync({ doanId, moKhoa: true, lyDo });
      toast.success(t("Đã mở khóa đoàn — có thể sửa lại."));
      setOpenMoKhoa(false);
      setLyDo("");
    } catch (e: unknown) {
      toast.error(errMsg(e) || t("Lỗi mở khóa"));
    }
  };

  const handleKhoaLai = async () => {
    try {
      await toggle.mutateAsync({ doanId, moKhoa: false, lyDo: "" });
      toast.success(t("Đã khóa lại đoàn."));
    } catch (e: unknown) {
      toast.error(errMsg(e) || t("Lỗi khóa lại"));
    }
  };

  return (
    <>
      <div
        className={
          "mb-4 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm " +
          (moKhoa
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-red-200 bg-red-50 text-red-800")
        }
      >
        {moKhoa ? <Unlock className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />}
        <div className="flex-1 min-w-0">
          {moKhoa ? (
            <>
              <span className="font-semibold">{t("Đoàn đã quyết toán — admin đang mở khóa tạm.")}</span>{" "}
              <span className="text-blue-700">{t("Sửa xong nên khóa lại.")}</span>
              {info.moKhoaLyDo && (
                <span className="block text-xs text-blue-600 mt-0.5">
                  {t("Lý do")}: {info.moKhoaLyDo}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="font-semibold">{t("Đoàn đã quyết toán (KTT đã duyệt) — đã khóa.")}</span>{" "}
              <span className="text-red-700">{t("Mọi chỉnh sửa nghiệp vụ bị chặn, cần admin mở khóa.")}</span>
            </>
          )}
        </div>
        {isAdmin &&
          (moKhoa ? (
            <Button
              type="button" variant="outline" size="sm"
              className="shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100"
              disabled={toggle.isPending}
              onClick={handleKhoaLai}
            >
              <Lock className="h-3.5 w-3.5 mr-1" />
              {t("Khóa lại")}
            </Button>
          ) : (
            <Button
              type="button" variant="outline" size="sm"
              className="shrink-0 border-red-300 text-red-700 hover:bg-red-100"
              disabled={toggle.isPending}
              onClick={() => { setLyDo(""); setOpenMoKhoa(true); }}
            >
              <Unlock className="h-3.5 w-3.5 mr-1" />
              {t("Mở khóa")}
            </Button>
          ))}
      </div>

      <Dialog open={openMoKhoa} onOpenChange={(o) => !o && setOpenMoKhoa(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Mở khóa đoàn đã quyết toán")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <Label className="text-xs">{t("Lý do mở khóa")} *</Label>
            <Textarea
              value={lyDo}
              autoFocus
              rows={3}
              placeholder={t("Ví dụ: cần điều chỉnh chi phí khách sạn do hóa đơn về muộn...")}
              onChange={(e) => setLyDo(e.target.value)}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {t("Mở khóa sẽ được ghi log (ai mở / lúc nào / lý do). Nhớ khóa lại sau khi sửa xong.")}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpenMoKhoa(false)}>
              {t("Hủy")}
            </Button>
            <Button
              type="button"
              onClick={handleMoKhoa}
              disabled={!lyDo.trim() || toggle.isPending}
            >
              {toggle.isPending ? t("Đang lưu...") : t("Mở khóa")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
