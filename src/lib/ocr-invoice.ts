// OCR hóa đơn dùng Tesseract.js client-side. Mục tiêu: gợi ý số tiền có
// khớp với DNTT hay không (không yêu cầu chính xác cao). Tesseract chạy
// trong worker; lần đầu phải tải ~10MB lang data 'vie' nên chậm 5-15s.

import Tesseract from "tesseract.js";

export interface OcrAmountResult {
  /** Số tiền đoán là tổng (lớn nhất / xuất hiện cuối). null nếu không đoán được. */
  detected: number | null;
  /** Tất cả số tiền tìm thấy ≥ MIN_AMOUNT (sort desc). Hữu ích để debug / fallback. */
  candidates: number[];
  /** Toàn bộ text OCR (truncated 2000 chars) để debug. */
  rawText: string;
}

const MIN_AMOUNT = 1000;       // bỏ qua số nhỏ (mã, ngày, %)
const MAX_AMOUNT = 10_000_000_000; // 10 tỷ — cap để loại STK / SĐT
const MAX_CANDIDATES = 10;

// Match số VN có separator: 1.234.567 / 1,234,567 / 1.234.567,89.
// CỐ Ý không match chuỗi số liền 4+ chữ số (1234567) để loại STK ngân hàng,
// SĐT, MST — chúng thường xuất hiện trên hóa đơn và lớn hơn tổng tiền.
const NUMBER_RE = /\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?/g;
// Loose pattern: dùng chỉ TRONG WINDOW KEYWORD (gần "tổng cộng" / "thanh toán")
// để bắt cả trường hợp Tesseract đọc mất separator (15600000 thay vì 15.600.000).
// Giới hạn 4-10 chữ số để tránh STK 10+ chữ số.
const LOOSE_NUMBER_RE = /\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d{4,10}/g;

// Normalize lỗi OCR phổ biến trên đoạn số (O→0, I/l→1, S→5, B→8) — chỉ áp
// dụng trong context có nhiều digits xung quanh để tránh phá text bình thường.
export function normalizeOcrDigits(text: string): string {
  return text.replace(/(?:[\dOoIlSBb][.,\sOoIlSBb]?){4,}/g, (chunk) =>
    chunk
      .replace(/[Oo]/g, "0")
      .replace(/[IlĮ]/g, "1")
      .replace(/[Ss]/g, "5")
      .replace(/[Bb]/g, "8"),
  );
}

// Keywords thường đứng trước/cùng dòng với tổng tiền — boost score.
const TOTAL_KEYWORDS = [
  "tong cong",
  "tong tien thanh toan",
  "thanh toan",
  "tong cong tien",
  "tong tien",
  "total payment",
  "total amount",
  "amount",
  "cong tien hang",
  "grand total",
];

function noDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

/**
 * Parse 1 chuỗi số VN → number. Quy tắc:
 *   - Nếu có cả "." và ","  → ký tự xuất hiện CUỐI là decimal separator.
 *   - Nếu chỉ 1 loại + lặp 3 chữ số mỗi nhóm → là thousands separator.
 *   - Nếu chỉ 1 dấu "." hoặc "," + theo sau ≤ 2 chữ số → có thể là decimal.
 */
export function parseVNNumber(raw: string): number | null {
  const s = raw.replace(/\s+/g, "");
  if (!/[\d]/.test(s)) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  let normalized: string;
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandSep = decimalSep === "." ? "," : ".";
    normalized = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const parts = s.split(sep);
    // Thousands nếu mỗi part sau dấu đầu tiên có đúng 3 chữ số
    const isThousands = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    if (isThousands) {
      normalized = parts.join("");
    } else if (parts.length === 2 && parts[1].length <= 2) {
      // Có thể decimal (vd "100,5")
      normalized = parts.join(".");
    } else {
      normalized = parts.join("");
    }
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * OCR file (image hoặc 1 trang đầu PDF) và đoán số tiền tổng.
 * Chiến lược 2 lớp:
 *   1) Tìm số nằm CÙNG DÒNG hoặc DÒNG SAU keyword "tổng cộng"/"thanh toán" → ưu tiên cao nhất.
 *   2) Fallback: lấy số có separator lớn nhất ≤ MAX_AMOUNT.
 */
export async function ocrInvoiceAmount(file: File): Promise<OcrAmountResult> {
  if (file.type === "application/pdf") {
    return { detected: null, candidates: [], rawText: "" };
  }

  const { data } = await Tesseract.recognize(file, "vie+eng");
  const rawText = (data.text || "").slice(0, 4000);
  const text = normalizeOcrDigits(rawText);

  // Parse tất cả số có separator hợp lệ → candidates fallback (loại STK liền)
  const allMatches = text.match(NUMBER_RE) ?? [];
  const allNumbers = allMatches
    .map(parseVNNumber)
    .filter((n): n is number => n != null && n >= MIN_AMOUNT && n <= MAX_AMOUNT);
  const candidates = [...new Set(allNumbers)].sort((a, b) => b - a).slice(0, MAX_CANDIDATES);

  // Strategy 1: số gần keyword tổng tiền — dùng LOOSE_NUMBER_RE chấp nhận
  // cả số liền (Tesseract hay đọc mất separator). Window chật nên ít rủi ro.
  const lines = text.split(/\r?\n/);
  const normLines = lines.map(noDiacritics);
  let bestKeywordAmount: number | null = null;
  for (let i = 0; i < normLines.length; i++) {
    const hit = TOTAL_KEYWORDS.some((kw) => normLines[i].includes(kw));
    if (!hit) continue;
    const window = (lines[i] || "") + " " + (lines[i + 1] || "");
    const winMatches = window.match(LOOSE_NUMBER_RE) ?? [];
    const winNumbers = winMatches
      .map(parseVNNumber)
      .filter((n): n is number => n != null && n >= MIN_AMOUNT && n <= MAX_AMOUNT);
    if (winNumbers.length > 0) {
      const max = Math.max(...winNumbers);
      if (bestKeywordAmount == null || max > bestKeywordAmount) {
        bestKeywordAmount = max;
      }
    }
  }

  const detected = bestKeywordAmount ?? candidates[0] ?? null;
  return { detected, candidates, rawText };
}

/** So sánh detected với expected. Khớp khi |diff| ≤ 1₫ hoặc lệch < 0.5%. */
export function isAmountMatch(detected: number | null, expected: number): boolean {
  if (detected == null) return false;
  const diff = Math.abs(detected - expected);
  if (diff <= 1) return true;
  return expected > 0 && diff / expected < 0.005;
}
