import { useState } from "react";
import { Clock, Loader2, Send } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { errMsg } from "@/lib/error";
import { t, useTranslate } from "@/lib/i18n";
import {
  useGuiTraoDoi,
  useTraLoiTraoDoi,
  useTraoDoiList,
  type TraoDoiRow,
} from "@/hooks/use-trao-doi";

// Hỏi/đáp với đối tác cho MỘT đoàn.
//
// Bố cục theo cặp hỏi–đáp chứ không phải khung chat: câu hỏi nào chưa trả lời thì
// nhìn là thấy ngay, kèm thời gian gửi để biết đã để đối tác chờ bao lâu. Đây
// đúng là thứ đối tác nhìn thấy bên cổng, chỉ khác là bên này trả lời được.

const luc = (s: string | null): string => (s ? format(new Date(s), "dd/MM/yyyy HH:mm") : "—");

export default function TraoDoiTab({ doanId }: { doanId: number }) {
  useTranslate();
  const { data = [], isLoading } = useTraoDoiList(doanId);
  const gui = useGuiTraoDoi(doanId);
  const [moGui, setMoGui] = useState(false);
  const [noiDung, setNoiDung] = useState("");

  const guiDi = () => {
    const text = noiDung.trim();
    if (!text) return;
    gui.mutate(text, {
      onSuccess: () => {
        setNoiDung("");
        setMoGui(false);
        toast.success(t("Đã gửi cho đối tác"));
      },
      onError: (e) => toast.error(errMsg(e)),
    });
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">{t("Đang tải trao đổi...")}</p>;
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {t("Nội dung ở đây hiện trên cổng đối tác, kèm giờ gửi và giờ trả lời.")}
        </p>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setMoGui((v) => !v)}>
          {t("Gửi cho đối tác")}
        </Button>
      </div>

      {moGui && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <Textarea
            value={noiDung}
            onChange={(e) => setNoiDung(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t("Nội dung muốn báo cho đối tác")}
          />
          <Button size="sm" onClick={guiDi} disabled={gui.isPending || !noiDung.trim()}>
            {gui.isPending
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{t("Đang gửi...")}</>
              : <><Send className="h-4 w-4 mr-1.5" />{t("Gửi")}</>}
          </Button>
        </div>
      )}

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Chưa có trao đổi nào với đối tác.")}</p>
      ) : (
        data.map((r) => <CapHoiDap key={r.id} row={r} doanId={doanId} />)
      )}
    </div>
  );
}

function CapHoiDap({ row, doanId }: { row: TraoDoiRow; doanId: number }) {
  const traLoiMut = useTraLoiTraoDoi(doanId);
  const [dangSoan, setDangSoan] = useState(false);
  const [text, setText] = useState("");

  const cuaDoiTac = row.ben_gui === "doi_tac";
  const daTraLoi = !!row.tra_loi;

  const luu = () => {
    const noi = text.trim();
    if (!noi) return;
    traLoiMut.mutate({ id: row.id, traLoi: noi }, {
      onSuccess: () => {
        setDangSoan(false);
        setText("");
        toast.success(t("Đã trả lời đối tác"));
      },
      onError: (e) => toast.error(errMsg(e)),
    });
  };

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="px-3 py-2">
        <div className="flex items-baseline gap-2 flex-wrap text-xs">
          <span
            className={
              "px-1.5 py-0.5 rounded font-medium " +
              (cuaDoiTac ? "bg-amber-50 text-amber-700" : "bg-[#E6F1FB] text-[#0a3d7c]")
            }
          >
            {cuaDoiTac ? t("Đối tác") : t("S8")}
          </span>
          {row.nguoi_gui && <span className="text-muted-foreground">{row.nguoi_gui}</span>}
          <span className="ml-auto text-muted-foreground whitespace-nowrap">
            {t("Gửi lúc")} {luc(row.gui_luc)}
          </span>
        </div>
        <p className="mt-1 text-sm whitespace-pre-wrap break-words">{row.noi_dung}</p>
      </div>

      <div className={"px-3 py-2 border-t " + (daTraLoi ? "bg-muted/30" : "border-dashed")}>
        {daTraLoi ? (
          <>
            <div className="flex items-baseline gap-2 flex-wrap text-xs">
              <span className="font-medium">{t("Trả lời")}</span>
              {row.nguoi_tra_loi && <span className="text-muted-foreground">{row.nguoi_tra_loi}</span>}
              <span className="ml-auto text-muted-foreground whitespace-nowrap">
                {luc(row.tra_loi_luc)}
              </span>
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap break-words">{row.tra_loi}</p>
          </>
        ) : dangSoan ? (
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={2000}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={luu} disabled={traLoiMut.isPending || !text.trim()}>
                {traLoiMut.isPending
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{t("Đang gửi...")}</>
                  : t("Gửi trả lời")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDangSoan(false)}>
                {t("Bỏ")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-700 inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> {t("Chưa trả lời")}
            </span>
            {/* Chỉ trả lời được lượt do đối tác mở — lượt S8 tự mở thì chờ họ đáp. */}
            {cuaDoiTac && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => setDangSoan(true)}>
                {t("Trả lời")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
