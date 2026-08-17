import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PhienBanMoi } from "@/lib/bao-gia-phien-ban";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Số bản sắp tạo (1, 2, 3...). Từ bản 2 bắt buộc nhập lý do. */
  soPhienBan: number;
  maHienThi: string;
  phienBan: PhienBanMoi | null;
  dangGui: boolean;
  onGui: (lyDo: string) => void;
}

// Xác nhận trước khi chốt một bản chào. Chốt xong là khoá vĩnh viễn nên đây là
// chỗ cuối cùng nhìn lại con số — và là chỗ ghi lại VÌ SAO bản này khác bản trước,
// thứ duy nhất cứu được mình khi vài tháng sau đối tác hỏi "sao báo giá khác".
export function GuiPhienBanModal({
  open, onClose, soPhienBan, maHienThi, phienBan, dangGui, onGui,
}: Props) {
  const [lyDo, setLyDo] = useState("");
  const batBuocLyDo = soPhienBan > 1;
  const thieuLyDo = batBuocLyDo && !lyDo.trim();

  const dong = () => { setLyDo(""); onClose(); };
  const gui = () => { if (!thieuLyDo) onGui(lyDo.trim()); };

  const nd = phienBan?.noi_dung_chao;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dong()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            Gửi bản {maHienThi}
            {soPhienBan > 1 && <span className="text-slate-500 font-normal"> (bản thứ {soPhienBan})</span>}
          </DialogTitle>
        </DialogHeader>

        {nd && (
          <div className="space-y-3">
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
              <p className="font-medium text-slate-700">{nd.noi_dung.ten_chuong_trinh}</p>
              <p className="text-slate-600">
                {nd.noi_dung.brackets.map((b) => `${b.label}: $${b.price_usd}`).join(" · ")}
              </p>
              <p className="text-slate-600">單房差 ${nd.noi_dung.single_supplement_usd}</p>
              <p className="text-slate-500">
                Chào ngày {new Date(nd.chao_ngay).toLocaleDateString("vi-VN")}
                {nd.hieu_luc_den && ` · hiệu lực đến ${new Date(nd.hieu_luc_den).toLocaleDateString("vi-VN")}`}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600">
                Lý do bản này khác bản trước {batBuocLyDo ? <span className="text-red-600">*</span> : <span className="text-slate-400">(bản đầu, không bắt buộc)</span>}
              </p>
              <Textarea
                value={lyDo}
                onChange={(e) => setLyDo(e.target.value)}
                rows={2}
                placeholder={batBuocLyDo ? "vd: đổi Somerset sang Melia theo yêu cầu đối tác" : "vd: bản chào đầu tiên"}
                className="text-xs"
              />
            </div>

            <p className="text-[11px] text-amber-700">
              Gửi xong bản này khoá vĩnh viễn, không sửa được. Muốn đổi thì tạo bản tiếp theo.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={dong} disabled={dangGui}>Huỷ</Button>
          <Button size="sm" className="gap-1.5" onClick={gui} disabled={dangGui || thieuLyDo || !nd}>
            {dangGui ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Chốt và gửi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
