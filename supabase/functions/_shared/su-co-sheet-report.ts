// Logic thuần dựng báo cáo "Phát sinh sự cố theo tuần" để xuất lên Google Sheet.
// Tách khỏi edge function để unit-test được (không cần Deno / Sheets API).
//
// Bố cục báo cáo: Tiêu đề tuần + người báo cáo + bộ phận →
//   (1) Bảng THỐNG KÊ THEO AGENT (Xihong/Cola/Guo/Khác): số đoàn, số khách.
//   (2) Bảng SỰ CỐ: Code | Điều hành thao tác | HDV | Số khách | Vấn đề | Phương án.
//
// Dùng bởi: supabase/functions/sync-su-co-to-sheet/index.ts
// File này KHÔNG import gì — giữ thuần để Deno (edge function) import qua đường dẫn tương đối.

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

/** 1 dòng thống kê agent trả về từ RPC get_doan_agent_weekly (đoàn chạy trong tuần). */
export interface AgentStatRow {
  agent_ten: string | null;
  so_doan: number | string | null;
  so_khach: number | string | null;
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
  /** Các dòng tổng cộng (tô nền nhạt + in đậm). */
  totalRows: RowSpan[];
  /** Index (0-based) dòng data sự cố đầu tiên (để wrap + canh trên). -1 nếu rỗng. */
  dataStart: number;
  /** Index (0-based) dòng data sự cố cuối (exclusive). */
  dataEnd: number;
  /** Tổng số sự cố. */
  suCoCount: number;
  /** Tổng số đoàn chạy trong tuần (từ thống kê agent). */
  doanCount: number;
}

// ── Hằng số văn bản (chỉnh nhãn tại đây) ─────────────────────────────────────
const SU_CO_HEADER = [
  "Code",
  "Điều hành thao tác",
  "HDV",
  "Số khách",
  "Vấn đề phát sinh",
  "Phương án xử lý",
];
/** Số cột bảng sự cố (A..F). */
export const SU_CO_COL_COUNT = SU_CO_HEADER.length;
const NO_DATA_TEXT = "Không có phát sinh sự cố nào trong tuần này.";

const AGENT_SECTION_TITLE = "THỐNG KÊ THEO AGENT";
const AGENT_HEADER = ["Agent", "Số đoàn", "Số khách"];
const AGENT_TOTAL_LABEL = "TỔNG";
const AGENT_KHAC = "Khác";
/** Agent hiện riêng dòng, theo thứ tự này; còn lại gộp vào "Khác". */
export const NAMED_AGENTS = ["Xihong", "Cola", "Guo"];

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

/** Một dòng thống kê agent đã gom nhóm. */
export interface AgentBucket {
  agent: string;
  soDoan: number;
  soKhach: number;
}

/**
 * Gom thống kê đoàn theo agent vào 4 nhóm cố định: Xihong, Cola, Guo, Khác
 * (mọi agent khác + không có agent → Khác). Luôn trả đủ 4 dòng (kể cả 0) + dòng tổng.
 */
export function aggregateAgents(rows: AgentStatRow[]): { buckets: AgentBucket[]; total: AgentBucket } {
  const keys = [...NAMED_AGENTS, AGENT_KHAC];
  const map = new Map<string, AgentBucket>();
  for (const k of keys) map.set(k, { agent: k, soDoan: 0, soKhach: 0 });

  for (const r of rows) {
    const ten = (r.agent_ten ?? "").trim();
    const key = NAMED_AGENTS.includes(ten) ? ten : AGENT_KHAC;
    const b = map.get(key)!;
    b.soDoan += num(r.so_doan);
    b.soKhach += num(r.so_khach);
  }

  const buckets = keys.map((k) => map.get(k)!);
  const total: AgentBucket = {
    agent: AGENT_TOTAL_LABEL,
    soDoan: buckets.reduce((s, b) => s + b.soDoan, 0),
    soKhach: buckets.reduce((s, b) => s + b.soKhach, 0),
  };
  return { buckets, total };
}

// ── Dựng báo cáo ─────────────────────────────────────────────────────────────

/**
 * Dựng báo cáo: tiêu đề tuần → bảng thống kê agent → bảng sự cố (mỗi sự cố 1 dòng).
 *
 * @param rawRows     Dòng sự cố từ RPC get_su_co_weekly.
 * @param agentStats  Dòng thống kê đoàn theo agent từ RPC get_doan_agent_weekly.
 * @param opts.from/to  Khoảng ngày của tuần (ISO 'YYYY-MM-DD') — in tiêu đề.
 * @param opts.nguoiBaoCao / opts.boPhan  Text header (cấu hình qua env vì chạy cron).
 */
export function buildSuCoReport(
  rawRows: SuCoRow[],
  agentStats: AgentStatRow[],
  opts: { from: string; to: string; nguoiBaoCao?: string; boPhan?: string },
): SuCoReport {
  const rows = sortSuCo(rawRows);

  const values: Cell[][] = [];
  const titleRows: number[] = [];
  const headerRows: RowSpan[] = [];
  const totalRows: RowSpan[] = [];

  // ── Tiêu đề ──
  titleRows.push(values.length);
  values.push([`TUẦN: ${fmtDate(opts.from)} - ${fmtDate(opts.to)}`]);
  values.push([`Người báo cáo: ${opts.nguoiBaoCao?.trim() || "—"}`]);
  values.push([`Bộ phận: ${opts.boPhan?.trim() || "—"}`]);
  values.push([""]); // dòng trống

  // ── Bảng thống kê theo Agent (luôn hiện 4 dòng + tổng) ──
  titleRows.push(values.length);
  values.push([AGENT_SECTION_TITLE]);
  headerRows.push({ row: values.length, colEnd: AGENT_HEADER.length });
  values.push([...AGENT_HEADER]);
  const { buckets, total } = aggregateAgents(agentStats);
  for (const b of buckets) values.push([b.agent, b.soDoan, b.soKhach]);
  totalRows.push({ row: values.length, colEnd: AGENT_HEADER.length });
  values.push([total.agent, total.soDoan, total.soKhach]);
  const doanCount = total.soDoan;

  values.push([""]); // dòng trống

  // ── Bảng sự cố ──
  if (rows.length === 0) {
    values.push([NO_DATA_TEXT]);
    return { values, titleRows, headerRows, totalRows, dataStart: -1, dataEnd: -1, suCoCount: 0, doanCount };
  }

  headerRows.push({ row: values.length, colEnd: SU_CO_COL_COUNT });
  values.push([...SU_CO_HEADER]);
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

  return { values, titleRows, headerRows, totalRows, dataStart, dataEnd, suCoCount: rows.length, doanCount };
}
