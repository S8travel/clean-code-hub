// Logic ghép file UNC ↔ ĐNTT (thuần, testable) — tách từ BatchUncDialog.recompute.
// KHÔNG import React/DB/UI.
//
// Rule:
//  - SỐ TIỀN: điều kiện BẮT BUỘC (khớp chính xác con_lai).
//  - MÃ ĐOÀN hoặc TÊN NCC: chỉ cần 1 trong 2 khớp để xác định đúng dòng
//    (mã đoàn OCR hay méo I→1… → không khớp thì dựa NCC, và ngược lại).
//  Tier 1: số tiền + (mã đoàn HOẶC NCC), ghép khi DUY NHẤT 1 file thoả.
//  Tier 2: chỉ số tiền, ghép khi UNIQUE 1 row ↔ 1 file (khi không đọc được
//          mã đoàn/NCC nhưng số tiền không trùng dòng nào khác).
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
  /** Tên NCC (người nhận) — phân biệt khi nhiều ĐNTT cùng số tiền + cùng đoàn. */
  nccName?: string | null;
}

export interface UncMatchFile {
  /** Số tiền OCR đọc từ ảnh UNC (null nếu không đọc được). */
  amount: number | null;
  /** Toàn văn OCR (để dò mã đoàn + tên người nhận). */
  text: string;
}

export type UncMatchReason = "ncc" | "code" | "amount_ocr" | "manual";

// Bỏ dấu + đổi đ→d (để so tên NCC: OCR đọc KHÔNG dấu).
function noDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d");
}

// Từ chung trong tên công ty — bỏ để lấy phần tên riêng đặc trưng (ĐÀO LÊ, PHÚ NGỌC).
const NCC_STOPWORDS = new Set([
  "CONG", "TY", "TNHH", "MTV", "MOT", "THANH", "VIEN", "CO", "PHAN", "CP",
  "CPDV", "DV", "DICH", "VU", "THUONG", "MAI", "CHI", "NHANH", "TAI", "VA",
  "DAI", "LY", "DU", "LICH", "KHACH", "SAN", "NHA", "HANG", "NCC", "TM",
]);

/** Token tên riêng đặc trưng của NCC (không dấu, UPPER, bỏ từ chung). */
function nccTokens(name: string): string[] {
  return noDiacritics(name).toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !NCC_STOPWORDS.has(t));
}

/** Text OCR (không dấu) chứa TẤT CẢ token tên riêng của NCC → coi là khớp NCC. */
export function nccMatchesText(nccName: string | null | undefined, ocrText: string): boolean {
  if (!nccName) return false;
  const toks = nccTokens(nccName);
  if (toks.length === 0) return false;
  const text = noDiacritics(ocrText).toUpperCase();
  return toks.every((t) => text.includes(t));
}

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

  // Mã đoàn (token đầu) của 1 row.
  const codeOf = (r: UncMatchRow): string | null => {
    if (!r.tenDoan) return null;
    const c = normCode(r.tenDoan.trim().split(/[\s(]/)[0]);
    return c.length >= 4 ? c : null;
  };
  // File khớp mã đoàn của row?
  const codeFits = (o: UncMatchFile, r: UncMatchRow): boolean => {
    const code = codeOf(r);
    return !!code && normCode(o.text).includes(code);
  };
  // Điểm "định danh" file cho row: số tiền BẮT BUỘC; cộng điểm theo mã đoàn /
  // NCC. NCC ưu tiên cao hơn (đặc trưng từng dòng — phân biệt được khi nhiều
  // dòng CÙNG đoàn). Trả 0 nếu số tiền lệch HOẶC không có dấu hiệu nào khớp.
  const scoreFit = (o: UncMatchFile | undefined, r: UncMatchRow): number => {
    if (!o || o.amount == null || !uncAmountMatch(o.amount, r.amount)) return 0;
    return (nccMatchesText(r.nccName, o.text) ? 2 : 0) + (codeFits(o, r) ? 1 : 0);
  };

  // 2) Số tiền + (mã đoàn HOẶC NCC). Chọn file có ĐIỂM CAO NHẤT & DUY NHẤT cho
  //    row; bỏ qua nếu hoà điểm (ambiguous) hoặc có row khác tranh ngang điểm.
  for (const r of rows) {
    if (manualIds.has(r.id) || assign[r.id] !== undefined) continue;
    let best = -1;
    let bestScore = 0;
    let tie = false;
    for (let fi = 0; fi < files.length; fi++) {
      if (used.has(fi)) continue;
      const s = scoreFit(files[fi], r);
      if (s === 0) continue;
      if (s > bestScore) { best = fi; bestScore = s; tie = false; }
      else if (s === bestScore) tie = true;
    }
    if (best < 0 || tie) continue;
    // Row khác (chưa match) cũng "muốn" file này ngang/hơn điểm → ambiguous.
    const rival = rows.some(
      (rr) => rr.id !== r.id && !manualIds.has(rr.id) && assign[rr.id] === undefined
        && scoreFit(files[best], rr) >= bestScore,
    );
    if (rival) continue;
    reasons[r.id] = nccMatchesText(r.nccName, files[best].text) ? "ncc" : "code";
    assign[r.id] = best; used.add(best);
  }

  // 3) Chỉ số tiền — 1 row ↔ 1 file duy nhất theo số tiền (OCR).
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
