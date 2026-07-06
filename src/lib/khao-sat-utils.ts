import { KHAO_SAT_TIEU_CHI, type KhaoSatRow } from "@/hooks/use-khao-sat";

// Điểm bị coi là "thấp" (cần lưu ý) khi <= ngưỡng này.
export const LOW_SCORE_THRESHOLD = 2;

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Đọc điểm số của 1 tiêu chí trên 1 response; null nếu chưa chấm / không phải số. */
function getScore(row: KhaoSatRow, key: keyof KhaoSatRow): number | null {
  const v = row[key];
  return typeof v === "number" ? v : null;
}

/** Class màu chữ theo điểm: >=4 xanh, 3-<4 cam, <3 đỏ, null xám. */
export function scoreColorClass(n: number | null): string {
  if (n === null) return "text-slate-400";
  if (n >= 4) return "text-green-700";
  if (n >= 3) return "text-amber-600";
  return "text-red-600";
}

/** true nếu response có BẤT KỲ tiêu chí nào điểm <= LOW_SCORE_THRESHOLD. */
export function isLowScore(row: KhaoSatRow): boolean {
  return KHAO_SAT_TIEU_CHI.some(({ key }) => {
    const v = getScore(row, key);
    return v !== null && v <= LOW_SCORE_THRESHOLD;
  });
}

export interface KhaoSatAverages {
  /** Tổng số phản hồi (rows). */
  soResponse: number;
  /** Trung bình theo từng tiêu chí (làm tròn 1 chữ số); null nếu tiêu chí chưa có điểm nào. */
  perTieuChi: Record<string, number | null>;
  /** Trung bình chung = TB của các "điểm TB mỗi phản hồi" (mean of per-response
   *  averages). Khớp 平均分數 trên phiếu thật + view khao_sat_overview.tb_chung,
   *  nên màn tổng hợp và màn chi tiết hiện CÙNG một con số. null nếu rỗng. */
  tbChung: number | null;
  /** Số response có bất kỳ tiêu chí nào điểm <= LOW_SCORE_THRESHOLD. */
  soThapDiem: number;
}

/** TB 7 điểm non-null của 1 response, CHƯA làm tròn. null nếu chưa chấm gì. */
function rawResponseAverage(row: KhaoSatRow): number | null {
  let sum = 0;
  let count = 0;
  for (const { key } of KHAO_SAT_TIEU_CHI) {
    const v = getScore(row, key);
    if (v !== null) {
      sum += v;
      count += 1;
    }
  }
  return count > 0 ? sum / count : null;
}

/**
 * Tính điểm trung bình khảo sát.
 * - perTieuChi[key]: TB các điểm không-null của tiêu chí đó (làm tròn 1 chữ số),
 *   null nếu không có điểm nào.
 * - tbChung: TB của các "điểm TB mỗi phản hồi" (mean of per-response averages) —
 *   khớp 平均分數 phiếu thật + view khao_sat_overview.tb_chung. Tính từ TB mỗi
 *   phản hồi CHƯA làm tròn để tránh sai số kép.
 * - soThapDiem: số response có ít nhất 1 tiêu chí <= LOW_SCORE_THRESHOLD.
 */
export function computeKhaoSatAverages(rows: KhaoSatRow[]): KhaoSatAverages {
  const perTieuChi: Record<string, number | null> = {};

  for (const { key } of KHAO_SAT_TIEU_CHI) {
    let sum = 0;
    let count = 0;
    for (const row of rows) {
      const v = getScore(row, key);
      if (v !== null) {
        sum += v;
        count += 1;
      }
    }
    perTieuChi[key] = count > 0 ? roundOne(sum / count) : null;
  }

  let respSum = 0;
  let respCount = 0;
  for (const row of rows) {
    const a = rawResponseAverage(row);
    if (a !== null) {
      respSum += a;
      respCount += 1;
    }
  }
  const tbChung = respCount > 0 ? roundOne(respSum / respCount) : null;

  return {
    soResponse: rows.length,
    perTieuChi,
    tbChung,
    soThapDiem: rows.filter(isLowScore).length,
  };
}

/**
 * TB 7 điểm non-null của MỘT response (cột 平均 / trung bình ở màn chi tiết).
 * null nếu response chưa chấm tiêu chí nào. Làm tròn 1 chữ số.
 */
export function responseAverage(row: KhaoSatRow): number | null {
  const a = rawResponseAverage(row);
  return a === null ? null : roundOne(a);
}
