import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateDoanLog } from "@/hooks/use-doan-log";
import { useDoanList } from "@/hooks/use-doan";
import { errMsg } from "@/lib/error";
import { toast } from "sonner";
import { t, useTranslate } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
}

// Modal "Tạo sự cố nhanh" — chọn đoàn + vấn đề + phương án → doan_log loai='su_co'.
// Dùng chung hook useCreateDoanLog (tự bắn thông báo cho giám đốc/admin).
export default function TaoSuCoModal({ open, onClose, userId, userName }: Props) {
  useTranslate();
  const { data: allDoan = [] } = useDoanList(null);
  const createMut = useCreateDoanLog();

  const [doanId, setDoanId] = useState<string>("");
  const [doanSearch, setDoanSearch] = useState("");
  const [tieuDe, setTieuDe] = useState("");
  const [noiDung, setNoiDung] = useState("");

  const filteredDoan = allDoan
    .filter((d) => !doanSearch || d.ten_doan?.toLowerCase().includes(doanSearch.toLowerCase()))
    .slice(0, 20);

  const handleClose = () => {
    setDoanId(""); setDoanSearch(""); setTieuDe(""); setNoiDung("");
    onClose();
  };

  const handleSubmit = async () => {
    if (!doanId) { toast.error(t("Vui lòng chọn đoàn")); return; }
    if (!tieuDe.trim()) { toast.error(t("Vui lòng nhập vấn đề phát sinh")); return; }

    const tenDoan = allDoan.find((d) => String(d.id) === doanId)?.ten_doan ?? undefined;
    try {
      await createMut.mutateAsync({
        doan_id: Number(doanId),
        doan_ten: tenDoan,
        loai: "su_co",
        tieu_de: tieuDe.trim(),
        noi_dung: noiDung.trim() || undefined,
        created_by: userId,
        created_by_ten: userName,
      });
      toast.success(t("Đã ghi nhận sự cố"));
      handleClose();
    } catch (err: unknown) {
      toast.error(t("Lỗi") + ": " + (errMsg(err) || ""));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{t("Tạo sự cố nhanh")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1 text-xs">
          {/* Đoàn (bắt buộc) */}
          <div className="space-y-1">
            <Label className="text-xs">{t("Đoàn")} <span className="text-destructive">*</span></Label>
            <Input
              className="h-8 text-xs"
              placeholder={t("Tìm tên đoàn...")}
              value={doanSearch}
              onChange={(e) => { setDoanSearch(e.target.value); setDoanId(""); }}
              autoFocus
            />
            {doanSearch && !doanId && filteredDoan.length > 0 && (
              <div className="border rounded-md max-h-32 overflow-y-auto">
                {filteredDoan.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                    onClick={() => { setDoanId(String(d.id)); setDoanSearch(d.ten_doan ?? ""); }}
                  >
                    {d.ten_doan}
                  </button>
                ))}
              </div>
            )}
            {doanId && (
              <p className="text-[11px] text-green-600">
                ✓ {allDoan.find((d) => String(d.id) === doanId)?.ten_doan}
                <button className="ml-2 text-muted-foreground hover:text-foreground" onClick={() => { setDoanId(""); setDoanSearch(""); }}>✕</button>
              </p>
            )}
          </div>

          {/* Vấn đề phát sinh (bắt buộc) */}
          <div className="space-y-1">
            <Label className="text-xs">{t("Vấn đề phát sinh")} <span className="text-destructive">*</span></Label>
            <Input
              className="h-8 text-xs"
              placeholder={t("Ví dụ: Khách phàn nàn phòng KS, xe đến trễ...")}
              value={tieuDe}
              onChange={(e) => setTieuDe(e.target.value)}
            />
          </div>

          {/* Phương án xử lý (tuỳ chọn) */}
          <div className="space-y-1">
            <Label className="text-xs">{t("Phương án xử lý")}</Label>
            <Textarea
              className="text-xs min-h-[64px]"
              placeholder={t("Mô tả chi tiết / hướng xử lý...")}
              value={noiDung}
              onChange={(e) => setNoiDung(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>{t("Hủy")}</Button>
          <Button size="sm" className="text-xs" onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? t("Đang lưu...") : t("Lưu sự cố")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
