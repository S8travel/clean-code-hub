import { type KhaoSatRow } from "@/hooks/use-khao-sat";
import { isLowScore, responseAverage, scoreColorClass } from "@/lib/khao-sat-utils";
import {
  DIEM_BAN_OPTIONS,
  NGUON_OPTIONS,
  SCORE_KEYS,
  YEUTO_OPTIONS,
  optionLabel,
  type Lang,
} from "@/lib/khao-sat-vocab";

const GIOI_TINH_LABEL: Record<string, string> = { nam: "Nam", nu: "Nữ" };

/** Ô điểm 1 tiêu chí (số hoặc "—"), tô màu theo thang điểm. */
function ScoreCell({ value }: { value: number | null }) {
  return (
    <td
      className={
        "px-2 py-1.5 text-center font-semibold tabular-nums " + scoreColorClass(value)
      }
    >
      {value === null ? "—" : value}
    </td>
  );
}

/** Ô văn bản tự do (co giãn, xuống dòng). */
function TextCell({ value }: { value: string | null }) {
  const v = (value ?? "").trim();
  return (
    <td className="min-w-[120px] max-w-[220px] whitespace-pre-wrap break-words px-2 py-1.5 align-top text-slate-700">
      {v || <span className="text-slate-300">—</span>}
    </td>
  );
}

/**
 * Một dòng lưới khảo sát (1 khách = 1 dòng).
 * Cột: STT · Khách · 7 tiêu chí · next_trip · y_kien_khac · diem_ban ·
 *      nguon_thong_tin · yeu_to_mua · trung bình.
 */
export default function KhaoSatResponseCard({
  row,
  stt,
  lang,
}: {
  row: KhaoSatRow;
  stt: number;
  lang: Lang;
}) {
  const low = isLowScore(row);
  const avg = responseAverage(row);

  const meta = [
    row.gioi_tinh ? GIOI_TINH_LABEL[row.gioi_tinh] ?? row.gioi_tinh : null,
    row.tuoi_range,
    row.nghe_nghiep,
  ].filter(Boolean);

  const diemBan = row.diem_ban
    ? optionLabel(DIEM_BAN_OPTIONS, row.diem_ban, lang)
    : "";
  const nguon = (row.nguon_thong_tin ?? [])
    .map((c) => optionLabel(NGUON_OPTIONS, c, lang))
    .join(", ");
  const yeuTo = (row.yeu_to_mua ?? [])
    .map((c) => optionLabel(YEUTO_OPTIONS, c, lang))
    .join(", ");

  return (
    <tr
      className={
        "border-b border-slate-100 align-top " +
        (low ? "bg-red-50/70" : "odd:bg-white even:bg-slate-50/40")
      }
    >
      <td
        className={
          "px-2 py-1.5 text-center text-slate-500 tabular-nums " +
          (low ? "border-l-2 border-l-red-400" : "")
        }
      >
        {stt}
      </td>

      <td className="min-w-[130px] px-2 py-1.5">
        <div className="font-medium text-slate-800">
          {row.ten_khach || "Khách ẩn danh"}
        </div>
        {row.so_dien_thoai && (
          <div className="text-[11px] text-slate-500">{row.so_dien_thoai}</div>
        )}
        {meta.length > 0 && (
          <div className="text-[11px] text-slate-400">{meta.join(" · ")}</div>
        )}
      </td>

      {SCORE_KEYS.map((key) => (
        <ScoreCell key={key} value={row[key]} />
      ))}

      <TextCell value={row.next_trip} />
      <TextCell value={row.y_kien_khac} />

      <td className="min-w-[90px] px-2 py-1.5 align-top text-slate-700">
        {diemBan || <span className="text-slate-300">—</span>}
      </td>
      <td className="min-w-[130px] max-w-[200px] px-2 py-1.5 align-top text-slate-700">
        {nguon || <span className="text-slate-300">—</span>}
      </td>
      <td className="min-w-[130px] max-w-[200px] px-2 py-1.5 align-top text-slate-700">
        {yeuTo || <span className="text-slate-300">—</span>}
      </td>

      <td
        className={
          "px-2 py-1.5 text-center text-sm font-bold tabular-nums " +
          scoreColorClass(avg)
        }
      >
        {avg === null ? "—" : avg.toFixed(1)}
      </td>
    </tr>
  );
}
