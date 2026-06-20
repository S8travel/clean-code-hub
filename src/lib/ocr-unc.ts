// OCR giấy báo chuyển tiền (UNC) — ảnh chụp app ngân hàng (VietinBank eFAST...).
// Mục tiêu: trích SỐ TIỀN + TOÀN VĂN nội dung để ghép tự động vào ĐNTT theo
// mã đoàn + số tiền. Tái dùng Tesseract.js + parser của ocr-invoice.

import Tesseract from "tesseract.js";
import { parseVNNumber, normalizeOcrDigits } from "./ocr-invoice";

export interface OcrUncResult {
  /** Số tiền chuyển (đồng) — null nếu không đoán được. */
  amount: number | null;
  /** Toàn văn OCR (đã chuẩn hoá), dùng dò mã đoàn. */
  text: string;
}

const MIN_AMOUNT = 1000;
const MAX_AMOUNT = 10_000_000_000;

// Số đứng ngay trước "VND"/"VNĐ"/"đồng" → là tiền (loại STK, mã GD, SĐT).
// KHÔNG cho khoảng trắng TRONG số (tránh dính "7" của "Nhanh 24/7" vào
// "10,000,000" → 710,000,000). Chỉ chấp nhận cụm nghìn . hoặc , hoặc số
// liền ≥4 chữ số. Lookbehind chặn bắt giữa chừng 1 số dài.
// {1,4} cho phép OCR thiếu separator đầu (vd "7128,000 VND" thay vì "7.128,000").
const MONEY_RE = /(?<![\d.,])(\d{1,4}(?:[.,]\d{3})+|\d{4,12})\s*(?:VN[DĐ]|VND|đồng|dong)/gi;
// Fallback: số có separator nghìn (không bắt chuỗi liền = STK; không có \s).
const SEP_NUMBER_RE = /(?<![\d.,])\d{1,4}(?:[.,]\d{3})+(?:[.,]\d{1,2})?/g;

/** Chuẩn hoá để so khớp mã đoàn: HOA, bỏ mọi ký tự không phải chữ/số. */
export function normCode(s: string): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d");
}

// Đọc "Số tiền bằng chữ" sang số. Chứng từ ngân hàng LUÔN có dòng này và OCR
// chữ tiếng Việt ổn định hơn chữ số (số hay bị thêm/mất "1" do viền bảng) →
// dùng làm số tiền chuẩn. Trả null nếu không thấy / không parse được.
const VN_UNIT: Record<string, number> = {
  khong: 0, mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, lam: 5, nham: 5,
  sau: 6, bay: 7, tam: 8, chin: 9,
};
// Toàn bộ từ-số hợp lệ (đơn vị + bậc). OCR hay sai 1 ký tự (sáu→sóu,
// nghìn→nghin…) → map token lạ về từ gần nhất (Levenshtein ≤ 1).
const VN_VOCAB = [
  ...Object.keys(VN_UNIT),
  "muoi", "muop", "tram", "nghin", "ngan", "trieu", "ty", "ti",
  "dong", "chan", "linh", "le",
];

function lev1(a: string, b: string): boolean {
  if (a === b) return true;
  const dl = a.length - b.length;
  if (dl > 1 || dl < -1) return false;
  if (a.length === b.length) {
    let diff = 0;
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k] && ++diff > 1) return false;
    return diff === 1;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a]; // s ngắn hơn 1
  for (let k = 0, j = 0; k < l.length; k++) {
    if (s[j] === l[k]) j++;
    else if (k - j > 0) return false; // đã bỏ 1 ký tự rồi
  }
  return true;
}

// token → từ-số chuẩn gần nhất (sai ≤1 ký tự). >=3 ký tự mới fuzzy để tránh
// "ba"/"tu" ngắn map lung tung. Không khớp → trả nguyên (bị bỏ qua khi parse).
function fuzzyNumWord(tok: string): string {
  if (VN_VOCAB.includes(tok)) return tok;
  if (tok.length < 3) return tok;
  for (const w of VN_VOCAB) if (w.length >= 3 && lev1(tok, w)) return w;
  return tok;
}

function vnWordsToNumber(phrase: string): number | null {
  const toks = stripDiacritics(phrase)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(fuzzyNumWord)
    .filter((w) => w !== "linh" && w !== "le"); // lẻ/linh = 0 chục — bỏ
  let total = 0;
  let group = 0;
  // cur = null khi CHƯA gặp chữ số (vd "trăm" đứng 1 mình do OCR rớt số → ngầm 1).
  // cur = 0 khi gặp "không" (vd "không trăm" = 0 trăm, KHÔNG phải 1 trăm). Dùng
  // (cur ?? 1) thay (cur || 1) để phân biệt 2 ca này — nếu không "không trăm" ra 100.
  let cur: number | null = null;
  let sawAny = false;
  for (const w of toks) {
    if (w in VN_UNIT) { cur = VN_UNIT[w]; sawAny = true; }
    else if (w === "muoi" || w === "muop") { group += (cur ?? 1) * 10; cur = null; sawAny = true; }
    else if (w === "tram") { group += (cur ?? 1) * 100; cur = null; sawAny = true; }
    else if (w === "nghin" || w === "ngan") { total += (group + (cur ?? 0)) * 1_000; group = 0; cur = null; }
    else if (w === "trieu") { total += (group + (cur ?? 0)) * 1_000_000; group = 0; cur = null; }
    else if (w === "ty" || w === "ti") { total += (group + (cur ?? 0)) * 1_000_000_000; group = 0; cur = null; }
    else if (w === "dong" || w === "chan" || w === "vnd" || w === "vnđ") break;
  }
  total += group + (cur ?? 0);
  return sawAny && total > 0 ? total : null;
}

/** Tìm "...bằng chữ: <...> đồng" trong text OCR → số. */
export function parseAmountInWords(text: string): number | null {
  // Strip diacritics rồi tìm + cắt TRÊN CÙNG chuỗi (NFD đổi độ dài → không
  // được lấy index của chuỗi này cắt chuỗi kia).
  const flat = stripDiacritics(text).toLowerCase();
  const i = flat.indexOf("bang chu");
  if (i < 0) return null;
  // Cửa sổ ~220 ký tự sau "bằng chữ", GỘP xuống dòng thành cách (OCR hay tự
  // wrap giữa câu chữ → cắt ở \n đầu sẽ cụt số). vnWordsToNumber tự dừng ở "đồng".
  const after = flat.slice(i + 8, i + 8 + 220).replace(/[\r\n]+/g, " ");
  return vnWordsToNumber(after);
}

/**
 * Trích amount từ chuỗi tiếng Việt trước "đồng" (KHÔNG cần label "bằng chữ").
 * UNC eFAST không có label nhưng luôn có dòng số viết bằng chữ → bắt theo
 * "đồng" + walk back tìm chuỗi number words. Tách riêng với parseAmountInWords
 * vì rule cũ vẫn áp dụng cho Giấy báo nợ.
 *
 * Tokenize toàn bộ + walk back từ "dong" lấy CHỈ chuỗi VN-word liên tiếp.
 * Tránh trường hợp text "17974,500 VND <words> đồng" — "vnd" và "17974" ở
 * giữa sẽ làm vnWordsToNumber break sớm hoặc parse sai.
 */
export function parseAmountFromDongWord(text: string): number | null {
  const flat = stripDiacritics(text).toLowerCase().replace(/[\r\n]+/g, " ");
  // Tokenize RAW (KHÔNG fuzzy) để tìm "dong" thật. fuzzy("cong"→"dong") sẽ map
  // "CÔNG TY" thành "dong" → lastIndexOf trả vị trí sai.
  const rawToks = flat
    .replace(/[.,/]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const lastDongIdx = rawToks.lastIndexOf("dong");
  if (lastDongIdx < 0) return null;

  // Walk back từ "dong" lấy chuỗi VN-word liên tiếp (sau fuzzy). Dừng khi gặp
  // non-VN-word (vd "vnd", "17974", "tp", "efast") để không bị lẫn.
  let startIdx = lastDongIdx;
  while (startIdx > 0) {
    const fuzzed = fuzzyNumWord(rawToks[startIdx - 1]);
    if (!isVnNumberWord(fuzzed)) break;
    startIdx--;
  }
  if (startIdx === lastDongIdx) return null;

  // Phrase: fuzzy từng token để bắt OCR sai chính tả ("sóu"→"sáu", "trdm"→"tram")
  const phrase = rawToks.slice(startIdx, lastDongIdx + 1).map(fuzzyNumWord).join(" ");
  return vnWordsToNumber(phrase);
}

/** Token có phải là từ trong vocab số tiếng Việt không (sau fuzzy). */
function isVnNumberWord(tok: string): boolean {
  if (tok in VN_UNIT) return true;
  const VN_FN_WORDS = new Set([
    "muoi", "muop", "tram", "nghin", "ngan", "trieu", "ty", "ti",
    "linh", "le",
  ]);
  return VN_FN_WORDS.has(tok);
}

export async function ocrUncSlip(file: File): Promise<OcrUncResult> {
  if (file.type === "application/pdf") return { amount: null, text: "" };

  const { data } = await Tesseract.recognize(file, "vie+eng");
  const raw = (data.text || "").slice(0, 4000);
  const text = normalizeOcrDigits(raw);
  // Log để soi khi OCR sai — mở DevTools (F12) → Console.
  // eslint-disable-next-line no-console
  console.log(`[OCR UNC] ${file.name}\n` + raw);

  // 1) Số cạnh "VND"/"đồng" → loại 0 (phí giao dịch), lấy lớn nhất.
  const moneyNums: number[] = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const n = parseVNNumber(m[1]);
    if (n != null && n >= MIN_AMOUNT && n <= MAX_AMOUNT) moneyNums.push(n);
  }
  let amount: number | null =
    moneyNums.length > 0 ? Math.max(...moneyNums) : null;

  // 2) Fallback: số có separator lớn nhất hợp lệ.
  if (amount == null) {
    const sep = (text.match(SEP_NUMBER_RE) ?? [])
      .map(parseVNNumber)
      .filter((n): n is number => n != null && n >= MIN_AMOUNT && n <= MAX_AMOUNT)
      .sort((a, b) => b - a);
    amount = sep[0] ?? null;
  }

  // 3) Số tiền bằng CHỮ là số tiền CHUẨN — OCR chữ tiếng Việt ổn định hơn chữ số
  // (chữ số hay bị viền/nhiễu đọc nhầm: 3↔5, thêm/mất "1"). Thử nhãn "Số tiền bằng
  // chữ:" (Giấy báo nợ) trước, rồi tới "<words> đồng" (UNC eFAST KHÔNG có nhãn nhưng
  // luôn có dòng số viết bằng chữ kết bằng "đồng"). Đọc được CHỮ hợp lệ → ƯU TIÊN,
  // ghi đè số đọc ở (1)/(2) — KỂ CẢ khi 2 bên LỆCH nhau (đó chính là lúc chữ số OCR
  // sai). Không đọc được chữ → giữ số ở (1)/(2).
  const wordsAmount = parseAmountInWords(raw) ?? parseAmountFromDongWord(raw);
  if (wordsAmount != null && wordsAmount >= MIN_AMOUNT && wordsAmount <= MAX_AMOUNT) {
    amount = wordsAmount;
  }

  return { amount, text };
}
