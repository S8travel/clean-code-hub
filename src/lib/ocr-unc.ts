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
const MONEY_RE = /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+|\d{4,12})\s*(?:VN[DĐ]|VND|đồng|dong)/gi;
// Fallback: số có separator nghìn (không bắt chuỗi liền = STK; không có \s).
const SEP_NUMBER_RE = /(?<![\d.,])\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?/g;

/** Chuẩn hoá để so khớp mã đoàn: HOA, bỏ mọi ký tự không phải chữ/số. */
export function normCode(s: string): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
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

  return { amount, text };
}
