import { useRef, type ReactNode } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Printer, QrCode, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  KHAO_SAT_TIEU_CHI,
  useKhaoSatList,
  type KhaoSatRow,
} from "@/hooks/use-khao-sat";
import { computeKhaoSatAverages, scoreColorClass } from "@/lib/khao-sat-utils";
import {
  CRITERIA_LABELS,
  FIELD_LABELS,
  SCORE_KEYS,
  labelForLang,
  type Lang,
} from "@/lib/khao-sat-vocab";
import { isZhTW } from "@/lib/i18n";
import KhaoSatResponseCard from "./KhaoSatResponseCard";

// Thứ tự các cột trường (sau 7 tiêu chí điểm) — khớp thứ tự td trong row component.
const FIELD_COLS: (keyof typeof FIELD_LABELS)[] = [
  "next_trip",
  "y_kien_khac",
  "nguon_thong_tin",
  "yeu_to_mua",
];

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0a3d7c]">
      {children}
    </div>
  );
}

/** Panel mã QR + in + copy link. */
function KhaoSatQRPanel({ doanId, maDoan }: { doanId: number; maDoan: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const link = `${window.location.origin}/khao-sat/${doanId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(link).then(
      () => toast.success("Đã sao chép link khảo sát"),
      () => toast.error("Không sao chép được link"),
    );
  };

  const handlePrint = () => {
    const canvas = wrapRef.current?.querySelector("canvas");
    if (!canvas) {
      toast.error("Chưa tạo được mã QR");
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) {
      toast.error("Trình duyệt chặn cửa sổ in. Vui lòng cho phép popup.");
      return;
    }
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>QR khảo sát ${maDoan}</title></head>` +
        `<body onload="window.print()" style="text-align:center;font-family:Arial,sans-serif;padding:24px;color:#0a3d7c">` +
        `<h2 style="margin:0 0 4px">Khảo sát chất lượng tour</h2>` +
        `<div style="font-size:20px;font-weight:bold;margin:8px 0;color:#111">Đoàn ${maDoan}</div>` +
        `<img src="${dataUrl}" style="width:320px;height:320px" alt="QR"/>` +
        `<div style="font-size:12px;color:#555;margin-top:12px;word-break:break-all">${link}</div>` +
        `<div style="font-size:13px;margin-top:10px;color:#333">Quý khách vui lòng quét mã QR để đánh giá chuyến đi.</div>` +
        `</body></html>`,
    );
    w.document.close();
    w.focus();
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionTitle>
        <QrCode className="h-4 w-4" /> Mã QR khảo sát
      </SectionTitle>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div ref={wrapRef} className="rounded-md bg-white p-3 ring-1 ring-slate-200">
          <QRCodeCanvas value={link} size={176} level="M" />
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-xs text-slate-600">
            Khách quét mã QR (hoặc mở link) để tự đánh giá chất lượng tour. Link chỉ
            còn hợp lệ trong 45 ngày sau khi đoàn về.
          </p>
          <div className="break-all rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
            {link}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleCopy}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Sao chép link
            </Button>
            <Button
              size="sm"
              className="bg-[#0a3d7c] hover:bg-[#0a3d7c]/90"
              onClick={handlePrint}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> In QR
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Bảng điểm trung bình 7 tiêu chí + tổng. */
function KhaoSatAveragesPanel({
  averages,
}: {
  averages: ReturnType<typeof computeKhaoSatAverages>;
}) {
  const { perTieuChi, tbChung, soResponse, soThapDiem } = averages;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionTitle>Điểm trung bình ({soResponse} phản hồi)</SectionTitle>

      {soThapDiem > 0 && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          {soThapDiem} phản hồi có điểm thấp (≤ 2) cần lưu ý
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#E6F1FB] text-left text-slate-700">
              <th className="px-2 py-1.5 font-medium">Tiêu chí</th>
              <th className="px-2 py-1.5 text-right font-medium">Điểm TB</th>
            </tr>
          </thead>
          <tbody>
            {KHAO_SAT_TIEU_CHI.map(({ key, label }) => {
              const v = perTieuChi[key] ?? null;
              return (
                <tr key={key} className="border-b border-slate-100">
                  <td className="px-2 py-1.5 text-slate-600">{label}</td>
                  <td
                    className={
                      "px-2 py-1.5 text-right font-semibold tabular-nums " +
                      scoreColorClass(v)
                    }
                  >
                    {v === null ? "—" : `${v.toFixed(1)}/5`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="px-2 py-1.5 font-semibold text-slate-800">
                Trung bình chung
              </td>
              <td
                className={
                  "px-2 py-1.5 text-right text-sm font-bold tabular-nums " +
                  scoreColorClass(tbChung)
                }
              >
                {tbChung === null ? "—" : `${tbChung.toFixed(1)}/5`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Lưới chi tiết: 1 khách = 1 dòng (màn 2 phiếu Đài Loan). */
function KhaoSatGrid({ rows, lang }: { rows: KhaoSatRow[]; lang: Lang }) {
  const sttCol = lang === "zh-TW" ? "序號" : "STT";
  const khachCol = lang === "zh-TW" ? "旅客" : "Khách";
  const avgCol = lang === "zh-TW" ? "平均" : "Trung bình";

  return (
    <div>
      <SectionTitle>Danh sách phản hồi ({rows.length})</SectionTitle>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-[#E6F1FB] text-left text-slate-700">
              <th className="whitespace-nowrap px-2 py-1.5 text-center font-medium">
                {sttCol}
              </th>
              <th className="whitespace-nowrap px-2 py-1.5 font-medium">{khachCol}</th>
              {SCORE_KEYS.map((key) => (
                <th
                  key={key}
                  className="whitespace-nowrap px-2 py-1.5 text-center font-medium"
                >
                  {labelForLang(CRITERIA_LABELS[key], lang)}
                </th>
              ))}
              {FIELD_COLS.map((f) => (
                <th key={f} className="whitespace-nowrap px-2 py-1.5 font-medium">
                  {labelForLang(FIELD_LABELS[f], lang)}
                </th>
              ))}
              <th className="whitespace-nowrap px-2 py-1.5 text-center font-medium">
                {avgCol}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <KhaoSatResponseCard key={row.id} row={row} stt={i + 1} lang={lang} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function KhaoSatTab({ doanId }: { doanId?: number }) {
  const { data: rows, isLoading } = useKhaoSatList(doanId);

  if (!doanId) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Chưa xác định đoàn — vui lòng lưu đoàn trước khi xem khảo sát.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải khảo sát…
      </div>
    );
  }

  const list = rows ?? [];
  const maDoan = list.find((r) => r.ma_doan_snapshot)?.ma_doan_snapshot ?? `#${doanId}`;
  const averages = computeKhaoSatAverages(list);
  const lang: Lang = isZhTW() ? "zh-TW" : "vi";

  return (
    <div className="space-y-4 p-1 sm:p-2">
      <KhaoSatQRPanel doanId={doanId} maDoan={maDoan} />

      {list.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          Chưa có phản hồi khảo sát. In mã QR ở trên và gửi cho khách để bắt đầu thu
          thập đánh giá.
        </div>
      ) : (
        <>
          <KhaoSatAveragesPanel averages={averages} />
          <KhaoSatGrid rows={list} lang={lang} />
        </>
      )}
    </div>
  );
}
