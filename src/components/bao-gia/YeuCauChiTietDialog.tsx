import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { FileText, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moTepYeuCau, type TepYeuCauRow, type YeuCauBaoGiaRow } from "@/hooks/use-yeu-cau-bao-gia";
import {
  coChuGon,
  YEU_CAU_TRANG_THAI_COLOR,
  YEU_CAU_TRANG_THAI_LABEL,
} from "@/lib/yeu-cau-bao-gia";

// Xem nguyên văn một yêu cầu.
//
// Bảng ngoài cắt nội dung còn 3 dòng cho gọn; đối tác thì hay gõ cả lịch trình
// vào ô đó. Chỗ này hiện đủ, kèm cách liên lạc lại và file họ gửi.

interface Props {
  yeuCau: YeuCauBaoGiaRow | null;
  tep: TepYeuCauRow[];
  onClose: () => void;
  onTaoBaoGia: () => void;
}

export function YeuCauChiTietDialog({ yeuCau, tep, onClose, onTaoBaoGia }: Props) {
  const navigate = useNavigate();
  const [dangMo, setDangMo] = useState<number | null>(null);

  if (!yeuCau) return null;
  const y = yeuCau;
  const tt = y.trang_thai_hien_thi;

  const moTep = async (t: TepYeuCauRow) => {
    setDangMo(t.id);
    try {
      await moTepYeuCau(t.duong_dan);
    } catch {
      toast.error("Không mở được file — có thể file đã bị gỡ.");
    } finally {
      setDangMo(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">
            {y.tieu_de || "(đối tác không đặt tiêu đề)"}
          </DialogTitle>
          <DialogDescription>
            {y.ten_agent || "(không rõ đối tác)"} · gửi{" "}
            {format(new Date(y.tao_luc), "dd/MM/yyyy HH:mm", { locale: vi })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", YEU_CAU_TRANG_THAI_COLOR[tt])}>
              {YEU_CAU_TRANG_THAI_LABEL[tt]}
            </span>
            {y.xu_ly_ten && <span className="text-muted-foreground">{y.xu_ly_ten}</span>}
            {y.xu_ly_luc && (
              <span className="text-muted-foreground">
                {format(new Date(y.xu_ly_luc), "dd/MM/yyyy HH:mm", { locale: vi })}
              </span>
            )}
          </div>

          {tt === "bo_qua" && y.ly_do_bo_qua && (
            <p className="rounded-md bg-muted px-2.5 py-2 break-words">
              <span className="text-muted-foreground">Lý do bỏ qua: </span>
              {y.ly_do_bo_qua}
            </p>
          )}

          {/* Ai gửi — tài khoản cổng KHÁC người liên hệ trong form */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Muc nhan="Tài khoản gửi">
              {y.tai_khoan_ten || "—"}
              {y.tai_khoan_email ? <span className="block text-muted-foreground">{y.tai_khoan_email}</span> : null}
            </Muc>
            <Muc nhan="Người liên hệ">
              {y.nguoi_lien_he || "—"}
              {(y.email || y.so_dien_thoai) && (
                <span className="block text-muted-foreground">
                  {[y.email, y.so_dien_thoai].filter(Boolean).join(" · ")}
                </span>
              )}
            </Muc>
            <Muc nhan="Số khách">{y.so_khach ? `${y.so_khach} khách` : "—"}</Muc>
            <Muc nhan="Ngày dự kiến">
              {y.ngay_di_du_kien || y.ngay_ve_du_kien
                ? `${ngayGon(y.ngay_di_du_kien)} – ${ngayGon(y.ngay_ve_du_kien)}`
                : "—"}
            </Muc>
          </div>

          <Muc nhan="Nội dung yêu cầu">
            <span className="block whitespace-pre-wrap break-words">{y.noi_dung || "—"}</span>
          </Muc>

          {tep.length > 0 && (
            <Muc nhan="File đối tác gửi kèm">
              <div className="mt-1 space-y-1">
                {tep.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => moTep(t)}
                    disabled={dangMo === t.id}
                    className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left hover:bg-muted disabled:opacity-60"
                  >
                    {dangMo === t.id
                      ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      : <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    <span className="flex-1 min-w-0 truncate">{t.file_name || t.ten || `#${t.id}`}</span>
                    {t.co_chu ? (
                      <span className="shrink-0 text-[10px] text-muted-foreground">{coChuGon(t.co_chu)}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </Muc>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            {y.lead_id != null && (
              <button type="button" onClick={() => navigate(`/leads?lead=${y.lead_id}`)} className="text-primary hover:underline">
                Mở lead #{y.lead_id}
              </button>
            )}
            {y.bao_gia_moi_nhat_id != null && (
              <button
                type="button"
                onClick={() => navigate(`/bao-gia/${y.bao_gia_moi_nhat_id}`)}
                className="text-primary hover:underline"
              >
                Mở báo giá {y.bao_gia_moi_nhat_ten ? `“${y.bao_gia_moi_nhat_ten}”` : `#${y.bao_gia_moi_nhat_id}`}
              </button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
          <Button onClick={onTaoBaoGia}>
            <Send className="h-4 w-4 mr-1.5" />
            {tt === "da_bao_gia" ? "Báo giá lại" : "Báo giá"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Muc({ nhan, children }: { nhan: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{nhan}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/** "05/11/2026" — chuỗi ngày thuần, ghép T00:00:00 cho khỏi lệch múi giờ. */
function ngayGon(s: string | null): string {
  if (!s) return "—";
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy", { locale: vi });
}
