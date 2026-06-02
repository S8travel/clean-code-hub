// Logic thuần dựng báo cáo "Phát sinh sự cố theo tuần" để xuất lên Google Sheet.
// Tách khỏi edge function để unit-test được (không cần Deno / Sheets API).
//
// Dùng bởi: supabase/functions/sync-su-co-to-sheet/index.ts
// Mẫu: file báo cáo tuần "team nhà hàng – hành trình" (Code | Điều hành thao tác |
//       HDV | Số khách | Vấn đề phát sinh | Phương án xử lý).
//
// File này KHÔNG import gì — phải giữ thuần để Deno (edge function) import qua
// đường dẫn tương đối được.

/** 1 dòng sự cố trả về từ RPC get_su_co_weekly. */
export interface SuCoRow {
  log_id: number;
  doan_id: number;
  ten_doan: string | null;
  /** OP phụ trách đoàn (assigned_to → user_roles.ho_ten). Fallback người tạo log. */
  op_ten: string | null;
  /** HDV chính + HDV phụ (ghép " | " ở builder). */
  hdv_1: string | null;
  hdv_2: string | null;
  so_khach: number | null;
  /** Vấn đề phát sinh = doan_log.tieu_de. */
  tieu_de: string | null;
  /** Phương án xử lý = doan_log.noi_dung. */
  noi_dung: string | null;
  /** timestamptz ISO — chỉ dùng để sort ổn định. */
  created_at: string | null;
}

/** Một ô — chuỗi hoặc số. */
export type Cell = string | number;

/** Một dòng cần tô nền — kèm số cột (exclusive) để không tô tràn ô trống. */
export interface RowSpan {
  row: number;
  colEnd: number;
}

/** Kết quả dựng báo cáo — values ghi thẳng vào sheet + gợi ý định dạng. */
export interface SuCoReport {
  /** Ma trận giá trị ghi vào sheet, bắt đầu từ A1. */
  values: Cell[][];
  /** Index (0-based) các dòng tiêu đề lớn (in đậm). */
  titleRows: number[];
  /** Các dòng header bảng (tô nền + in đậm). */
  headerRows: RowSpan[];
  /** Index (0-based) dòng data đầu tiên (để áp wrap + canh trên). -1 nếu rỗng. */
  dataStart: number;
  /** Index (0-based) dòng data cuối (exclusive). = dataStart nếu rỗng. */
  dataEnd: number;
  /** Tổng số sự cố trong báo cáo. */
  suCoCount: number;
}

// ── Hằng số văn bản (chỉnh nhãn tại đây) ─────────────────────────────────────
const HEADER = [
  "Code",
  "Điều hành thao tác",
  "HDV",
  "Số khách",
  "Vấn đề phát sinh",
  "Phương án xử lý",
];
/** Số cột bảng (A..F). */
export const SU_CO_COL_COUNT = HEADER.length;
const NO_DATA_TEXT = "Không có phát sinh sự cố nào trong tuần này.";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Ép về số an toàn (numeric Postgres có thể là string); rỗng/sai → 0. */
function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** ISO 'YYYY-MM-DD' (hoặc datetime) → 'dd/mm/yyyy'. Parse bằng regex để tránh
 *  lệch ngày do timezone khi dùng new Date() với chuỗi date-only. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Ghép HDV chính + phụ bằng " | "; bỏ phần rỗng; cả 2 rỗng → "". */
export function joinHdv(hdv1: string | null, hdv2: string | null): string {
  return [hdv1, hdv2].map((s) => (s ?? "").trim()).filter(Boolean).join(" | ");
}

/** Sắp xếp ổn định: theo tên đoàn, rồi thời điểm tạo, rồi log_id. */
export function sortSuCo(rows: SuCoRow[]): SuCoRow[] {
  return [...rows].sort((a, b) => {
    const ta = a.ten_doan ?? "";
    const tb = b.ten_doan ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.log_id - b.log_id;
  });
}

// ── Dựng báo cáo ─────────────────────────────────────────────────────────────

/**
 * Dựng báo cáo phát sinh sự cố tuần: tiêu đề tuần + người báo cáo + bộ phận +
 * bảng (mỗi sự cố 1 dòng).
 *
 * @param rawRows  Dòng từ RPC get_su_co_weekly.
 * @param opts.from / opts.to  Khoảng ngày của tuần (ISO 'YYYY-MM-DD') — in tiêu đề.
 * @param opts.nguoiBaoCao  Text "Người báo cáo" (cấu hình qua env vì chạy cron).
 * @param opts.boPhan  Text "Bộ phận".
 */
export function buildSuCoReport(
  rawRows: SuCoRow[],
  opts: { from: string; to: string; nguoiBaoCao?: string; boPhan?: string },
): SuCoReport {
  const rows = sortSuCo(rawRows);

  const values: Cell[][] = [];
  const titleRows: number[] = [];
  const headerRows: RowSpan[] = [];

  // ── Tiêu đề ──
  titleRows.push(values.length);
  values.push([`TUẦN: ${fmtDate(opts.from)} - ${fmtDate(opts.to)}`]);
  values.push([`Người báo cáo: ${opts.nguoiBaoCao?.trim() || "—"}`]);
  values.push([`Bộ phận: ${opts.boPhan?.trim() || "—"}`]);
  values.push([""]); // dòng trống

  if (rows.length === 0) {
    values.push([NO_DATA_TEXT]);
    return { values, titleRows, headerRows, dataStart: -1, dataEnd: -1, suCoCount: 0 };
  }

  // ── Bảng ──
  headerRows.push({ row: values.length, colEnd: SU_CO_COL_COUNT });
  values.push([...HEADER]);
  const dataStart = values.length;

  for (const r of rows) {
    values.push([
      r.ten_doan ?? "",
      r.op_ten ?? "",
      joinHdv(r.hdv_1, r.hdv_2),
      num(r.so_khach),
      r.tieu_de ?? "",
      r.noi_dung ?? "",
    ]);
  }
  const dataEnd = values.length;

  return { values, titleRows, headerRows, dataStart, dataEnd, suCoCount: rows.length };
}
