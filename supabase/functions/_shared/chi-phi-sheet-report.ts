// Logic thuần dựng báo cáo "Chi phí các đoàn khởi hành" để xuất lên Google Sheet.
// Tách khỏi edge function để unit-test được (không cần Deno / Sheets API).
//
// Dùng bởi: supabase/functions/sync-chi-phi-to-sheet/index.ts
// SPEC: SPEC_chi-phi-sheet-sync.md
//
// File này KHÔNG import gì — phải giữ thuần để Deno (edge function) import qua
// đường dẫn tương đối được.

/** 1 dòng đoàn trả về từ RPC get_chi_phi_doan_summary. */
export interface ChiPhiDoanRow {
  doan_id: number;
  ten_doan: string | null;
  agent_ten: string | null;
  loai_tour: string | null;
  ngay_di: string | null;
  ngay_ve: string | null;
  so_khach: number | null;
  /** numeric từ Postgres — có thể về dạng number hoặc string. */
  tong_chi_phi: number | string | null;
  so_dong_chi_phi: number | null;
  so_dem: number | null;
}

/** Một ô — chuỗi hoặc số. */
export type Cell = string | number;

/** Vùng ô (0-based, half-open) cần áp định dạng. */
export interface CellRange {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

/** Một dòng cần tô nền — kèm số cột (exclusive) để không tô tràn ô trống. */
export interface RowSpan {
  row: number;
  colEnd: number;
}

/** Tổng hợp theo Agent. */
export interface AgentSummary {
  agent: string;
  soDoan: number;
  tongSoKhach: number;
  tongChiPhi: number;
}

/** Kết quả dựng báo cáo — values ghi thẳng vào sheet + gợi ý định dạng. */
export interface ChiPhiReport {
  /** Ma trận giá trị ghi vào sheet, bắt đầu từ A1. */
  values: Cell[][];
  /** Index (0-based) các dòng tiêu đề lớn. */
  titleRows: number[];
  /** Các dòng header bảng (tô nền + in đậm). */
  headerRows: RowSpan[];
  /** Các dòng tổng cộng (tô nền nhạt + in đậm). */
  totalRows: RowSpan[];
  /** Các vùng cột tiền cần định dạng phân cách hàng nghìn. */
  moneyRanges: CellRange[];
  /** Số đoàn bị gắn cờ nghi thiếu chi phí. */
  warnCount: number;
  /** Tổng số đoàn trong báo cáo. */
  doanCount: number;
}

// ── Hằng số văn bản (chỉnh nhãn tại đây) ─────────────────────────────────────
const TITLE_PREFIX = "CHI PHI CAC DOAN KHOI HANH";
const SUBTITLE =
  "Loc theo ngay khoi hanh (ngay_di); chi gom doan dang chay (trang_thai = 'dang_chay')";
const DETAIL_HEADER = [
  "STT",
  "Agent",
  "Tên đoàn",
  "Loại tour",
  "Ngày đi",
  "Ngày về",
  "Số khách",
  "Chi phí (VND)",
  "Ghi chú",
];
const AGENT_SECTION_TITLE = "TONG HOP THEO AGENT";
const AGENT_HEADER = ["Agent", "Số đoàn", "Tổng số khách", "Tổng chi phí (VND)"];
const WARN_TEXT = "⚠ Nghi thiếu chi phí";
const NO_DATA_TEXT = "Không có đoàn nào khởi hành trong khoảng này.";

const LOAI_TOUR_LABEL: Record<string, string> = {
  inbound: "Inbound",
  outbound: "Outbound",
  noi_dia: "Nội địa",
};

/** Hệ số ngưỡng cảnh báo mặc định: số dòng chi phí < số đêm × hệ số → nghi thiếu. */
export const DEFAULT_WARN_FACTOR = 3;

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

function loaiTourLabel(v: string | null): string {
  if (!v) return "";
  return LOAI_TOUR_LABEL[v] ?? v;
}

/** Đoàn nghi chưa nhập đủ chi phí: số dòng chi phí < số đêm × hệ số. */
export function isUnderfunded(row: ChiPhiDoanRow, warnFactor: number): boolean {
  const threshold = num(row.so_dem) * warnFactor;
  return threshold > 0 && num(row.so_dong_chi_phi) < threshold;
}

/** Gom nhóm các đoàn theo Agent, sắp xếp tổng chi phí giảm dần. */
export function aggregateByAgent(rows: ChiPhiDoanRow[]): AgentSummary[] {
  const map = new Map<string, AgentSummary>();
  for (const r of rows) {
    const key = r.agent_ten || "Other";
    let s = map.get(key);
    if (!s) {
      s = { agent: key, soDoan: 0, tongSoKhach: 0, tongChiPhi: 0 };
      map.set(key, s);
    }
    s.soDoan += 1;
    s.tongSoKhach += num(r.so_khach);
    s.tongChiPhi += num(r.tong_chi_phi);
  }
  return [...map.values()].sort((a, b) => b.tongChiPhi - a.tongChiPhi);
}

// ── Dựng báo cáo ─────────────────────────────────────────────────────────────

/**
 * Dựng toàn bộ báo cáo chi phí: tiêu đề + bảng chi tiết (mỗi đoàn 1 dòng) +
 * dòng tổng + bảng tổng hợp theo Agent.
 *
 * @param rawRows  Dòng từ RPC get_chi_phi_doan_summary.
 * @param opts.from / opts.to  Khoảng ngày khởi hành (ISO) — chỉ để in tiêu đề.
 * @param opts.warnFactor  Hệ số ngưỡng cảnh báo (mặc định DEFAULT_WARN_FACTOR).
 */
export function buildChiPhiReport(
  rawRows: ChiPhiDoanRow[],
  opts: { from: string; to: string; warnFactor?: number },
): ChiPhiReport {
  const warnFactor = opts.warnFactor ?? DEFAULT_WARN_FACTOR;

  // Sắp xếp phòng thủ theo ngày đi tăng dần (RPC đã sort, làm lại cho chắc).
  const rows = [...rawRows].sort((a, b) => {
    const da = a.ngay_di ?? "";
    const db = b.ngay_di ?? "";
    if (da !== db) return da < db ? -1 : 1;
    return a.doan_id - b.doan_id;
  });

  const values: Cell[][] = [];
  const titleRows: number[] = [];
  const headerRows: RowSpan[] = [];
  const totalRows: RowSpan[] = [];
  const moneyRanges: CellRange[] = [];

  // ── Tiêu đề ──
  titleRows.push(values.length);
  values.push([`${TITLE_PREFIX} ${fmtDate(opts.from)} - ${fmtDate(opts.to)}`]);
  values.push([SUBTITLE]);
  values.push([""]); // dòng trống

  if (rows.length === 0) {
    values.push([NO_DATA_TEXT]);
    return { values, titleRows, headerRows, totalRows, moneyRanges, warnCount: 0, doanCount: 0 };
  }

  // ── Bảng chi tiết ──
  headerRows.push({ row: values.length, colEnd: DETAIL_HEADER.length });
  values.push([...DETAIL_HEADER]);
  const detailDataStart = values.length;

  let sumKhach = 0;
  let sumChiPhi = 0;
  let warnCount = 0;
  rows.forEach((r, i) => {
    const khach = num(r.so_khach);
    const chiPhi = num(r.tong_chi_phi);
    sumKhach += khach;
    sumChiPhi += chiPhi;
    const warn = isUnderfunded(r, warnFactor);
    if (warn) warnCount += 1;
    values.push([
      i + 1,
      r.agent_ten || "Other",
      r.ten_doan ?? "",
      loaiTourLabel(r.loai_tour),
      fmtDate(r.ngay_di),
      fmtDate(r.ngay_ve),
      khach,
      chiPhi,
      warn ? WARN_TEXT : "",
    ]);
  });

  // Dòng tổng chi tiết (cột tiền index 7, số khách index 6).
  totalRows.push({ row: values.length, colEnd: DETAIL_HEADER.length });
  values.push([`TONG CONG ${rows.length} doan`, "", "", "", "", "", sumKhach, sumChiPhi, ""]);
  const detailTotalRow = values.length - 1;
  // Cột "Chi phí (VND)": từ dòng data đầu tới hết dòng tổng.
  moneyRanges.push({ rowStart: detailDataStart, rowEnd: detailTotalRow + 1, colStart: 7, colEnd: 8 });

  values.push([""]); // dòng trống

  // ── Bảng tổng hợp theo Agent ──
  titleRows.push(values.length);
  values.push([AGENT_SECTION_TITLE]);
  headerRows.push({ row: values.length, colEnd: AGENT_HEADER.length });
  values.push([...AGENT_HEADER]);
  const agentDataStart = values.length;

  const agentSummary = aggregateByAgent(rows);
  for (const a of agentSummary) {
    values.push([a.agent, a.soDoan, a.tongSoKhach, a.tongChiPhi]);
  }

  // Dòng tổng Agent (cột tiền index 3).
  totalRows.push({ row: values.length, colEnd: AGENT_HEADER.length });
  values.push([
    "TONG CONG",
    agentSummary.reduce((s, a) => s + a.soDoan, 0),
    agentSummary.reduce((s, a) => s + a.tongSoKhach, 0),
    agentSummary.reduce((s, a) => s + a.tongChiPhi, 0),
  ]);
  const agentTotalRow = values.length - 1;
  moneyRanges.push({ rowStart: agentDataStart, rowEnd: agentTotalRow + 1, colStart: 3, colEnd: 4 });

  return { values, titleRows, headerRows, totalRows, moneyRanges, warnCount, doanCount: rows.length };
}
