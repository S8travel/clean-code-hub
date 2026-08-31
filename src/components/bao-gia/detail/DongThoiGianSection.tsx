import { History, MessageSquareWarning } from "lucide-react";
import { useBaoGiaLog, type BaoGiaLogRow } from "@/hooks/use-bao-gia-phien-ban";
import { yeuCauSuaChuaTraLoi } from "@/lib/bao-gia-phien-ban";
import { cn } from "@/lib/utils";

// Dòng thời gian của một báo giá: gửi bản nào lúc nào, đối tác đòi đổi gì.
//
// Tách khỏi tab Phiên bản (25/08/2026) vì hai thứ trả lời hai câu khác nhau:
// Phiên bản = "bản đang hiệu lực ra sao, khác bản trước chỗ nào"; ở đây =
// "chuyện gì đã xảy ra theo thứ tự". Nhét chung thì phần lịch sử trao đổi nằm
// tít dưới đáy, chẳng ai cuộn xuống — mà đó lại là chỗ yêu cầu của đối tác rơi vào.
//
// MỚI NHẤT ĐỨNG ĐẦU: mở ra là thấy việc đang cần làm, không phải cuộn hết lịch sử.

const LOAI_LABEL: Record<string, string> = {
  gui_ban: "Gửi bản",
  mo_phien_ban: "Mở soạn bản mới",
  thu_hoi: "Thu hồi",
  yeu_cau_sua: "Đối tác yêu cầu sửa",
  doi_tac_xem: "Đối tác xem",
};

/** Kiểu nào là việc của người khác đẩy sang mình — tô đậm cho khỏi trôi qua mắt. */
const CAN_CHU_Y = new Set(["yeu_cau_sua"]);

const gio = (s: string) => new Date(s).toLocaleString("vi-VN");

export function DongThoiGianSection({ baoGiaId }: { baoGiaId: number }) {
  const { data: dsLog = [], isLoading } = useBaoGiaLog(baoGiaId);
  // Yêu cầu chưa được trả lời bằng một bản chào mới — đánh dấu ngay trên dòng,
  // để nhìn danh sách là biết cái nào còn nợ chứ không phải tự đối chiếu ngày.
  const choTraLoi = new Set(yeuCauSuaChuaTraLoi(dsLog).map((l) => l.tao_luc));

  if (isLoading) return null;

  if (!dsLog.length) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          Chưa có gì diễn ra. Gửi bản chào đầu tiên là dòng thời gian bắt đầu chạy.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
      <h2 className="text-xs uppercase tracking-wider font-semibold text-slate-500 inline-flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" /> Dòng thời gian
      </h2>

      <ul className="space-y-1.5">
        {dsLog.map((l: BaoGiaLogRow) => {
          const canChuY = CAN_CHU_Y.has(l.loai);
          const conNo = canChuY && choTraLoi.has(l.tao_luc);
          return (
            <li
              key={l.id}
              className={cn(
                "flex gap-3 rounded border px-3 py-2 text-xs",
                conNo ? "border-amber-300 bg-amber-50" : "border-slate-200",
              )}
            >
              <span className="text-muted-foreground shrink-0 tabular-nums">{gio(l.tao_luc)}</span>
              <span className={cn("font-medium shrink-0", canChuY && "text-amber-800")}>
                {canChuY && <MessageSquareWarning className="h-3 w-3 inline mr-1 -mt-0.5" />}
                {LOAI_LABEL[l.loai] ?? l.loai}
              </span>
              <span className="break-words min-w-0">
                {l.noi_dung}
                {l.tao_boi_ten ? ` · ${l.tao_boi_ten}` : ""}
              </span>
              {conNo && (
                <span className="ml-auto shrink-0 self-start rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  chưa trả lời
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
