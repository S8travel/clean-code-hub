// Logic ghép file UNC ↔ ĐNTT (thuần, testable) — tách từ BatchUncDialog.recompute.
// KHÔNG import React/DB/UI.
//
// Rule:
//  1) STRICT (code): nội dung UNC chứa mã đoàn + số tiền khớp → tin tuyệt đối.
//  2) AMBIGUITY-SAFE (amount_ocr): chỉ ghép khi UNIQUE cả 2 bên (1 row ↔ 1 file
//     duy nhất theo số tiền) — vì nhiều UNC có thể cùng số tiền.
//  Còn lại → để user chọn tay.
//
// "Số tiền" so khớp = số THỰC CHUYỂN trên UNC = so_tien ĐNTT − đã trả (cọc +
// cấn trừ). Caller truyền sẵn qua `amount` (= con_lai). Hóa đơn thì khớp
// so_tien gốc — đó là flow khác (ocr-invoice), không dùng hàm này.

import { normCode } from "./ocr-unc";

/**
 * So khớp số tiền cho UNC — CHÍNH XÁC (lệch ≤ 1đ do làm tròn).
 * KHÔNG dùng dung sai % như OCR hóa đơn: nhiều ĐNTT có số tiền gần nhau
 * (vd 5.130.000 vs 5.112.720, lệch 0.34%) → dung sai sẽ ghép chéo file.
 * Số tiền chuyển trên UNC luôn = đúng số ĐNTT cần, nên khớp chặt là đúng.
 */
export function uncAmountMatch(a: number | null | undefined, b: number): boolean {
  if (a == null) return false;
  return Math.abs(a - b) <= 1;
}

export interface UncMatchRow {
  id: number;
  tenDoan: string | null;
  /** Số tiền cần khớp với UNC = con_lai (so_tien − paid_amount). */
  amount: number;
}

export interface UncMatchFile {
  /** Số tiền OCR đọc từ ảnh UNC (null nếu không đọc được). */
  amount: number | null;
  /** Toàn văn OCR (để dò mã đoàn). */
  text: string;
}

export type UncMatchReason = "code" | "amount_ocr" | "manual";

export interface UncMatchResult {
  assign: Record<number, number | undefined>; // rowId → fileIdx
  reasons: Record<number, UncMatchReason>;
}

/**
 * @param rows    ĐNTT đang thiếu UNC (id + tenDoan + amount=con_lai)
 * @param files   file UNC đã OCR (amount + text), index = vị trí trong danh sách
 * @param manual  map rowId → fileIdx user đã tự chọn (giữ nguyên, không auto đè)
 */
export function computeUncAssignments(
  rows: UncMatchRow[],
  files: UncMatchFile[],
  manual: Record<number, number | undefined> = {},
): UncMatchResult {
  const assign: Record<number, number | undefined> = {};
  const reasons: Record<number, UncMatchReason> = {};
  const used = new Set<number>();
  const manualIds = new Set(
    Object.keys(manual).map(Number).filter((id) => manual[id] !== undefined || id in manual),
  );

  // 1) Khoá dòng user tự chọn
  for (const r of rows) {
    if (Object.prototype.hasOwnProperty.call(manual, r.id)) {
      const fi = manual[r.id];
      assign[r.id] = fi;
      reasons[r.id] = "manual";
      if (fi !== undefined) used.add(fi);
    }
  }

  // 2) STRICT: mã đoàn trong ảnh + số tiền khớp
  for (const r of rows) {
    if (manualIds.has(r.id) || assign[r.id] !== undefined) continue;
    if (!r.tenDoan) continue;
    const codeTok = r.tenDoan.trim().split(/[\s(]/)[0];
    const code = normCode(codeTok);
    if (code.length < 4) continue;
    for (let fi = 0; fi < files.length; fi++) {
      if (used.has(fi)) continue;
      const o = files[fi];
      if (!o || o.amount == null) continue;
      if (!uncAmountMatch(o.amount, r.amount)) continue;
      if (!normCode(o.text).includes(code)) continue;
      assign[r.id] = fi; reasons[r.id] = "code"; used.add(fi);
      break;
    }
  }

  // 3) AMBIGUITY-SAFE amount-only: 1 row ↔ 1 file duy nhất theo số tiền (OCR).
  const unmatchedRows = rows.filter((r) => !manualIds.has(r.id) && assign[r.id] === undefined);
  for (const r of unmatchedRows) {
    if (assign[r.id] !== undefined) continue;
    const candFiles: number[] = [];
    for (let fi = 0; fi < files.length; fi++) {
      if (used.has(fi)) continue;
      const o = files[fi];
      if (o && o.amount != null && uncAmountMatch(o.amount, r.amount)) candFiles.push(fi);
    }
    if (candFiles.length !== 1) continue; // 0 hoặc >1 → ambiguous
    const fi = candFiles[0];
    const rival = unmatchedRows.some(
      (rr) => rr.id !== r.id && assign[rr.id] === undefined
        && files[fi]?.amount != null && uncAmountMatch(files[fi]?.amount, rr.amount),
    );
    if (rival) continue; // 1 file → nhiều row tranh → ambiguous
    assign[r.id] = fi; reasons[r.id] = "amount_ocr"; used.add(fi);
  }

  return { assign, reasons };
}
