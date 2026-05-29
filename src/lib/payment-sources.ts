// Danh sách nguồn thanh toán (tài khoản công ty/cá nhân chi tiền) dùng chung
// cho trang Thanh toán Hóa đơn & UNC. Thêm option mới ở đây để xuất hiện trong
// mọi dropdown chọn nguồn + tự match khi OCR ảnh UNC.
export interface PaymentSource {
  /** Nhãn hiển thị + lưu vào payments.nguon. */
  label: string;
  /** Số tài khoản (chỉ digits) để dò trong text OCR của UNC → auto chọn nguồn. */
  accountDigits: string;
  /**
   * Từ khoá tên ngân hàng (không dấu, lowercase) để dò khi OCR đọc SỐ TK sai
   * (vd "111" → "T11"/"ST 1"). CHỈ dùng khi duy nhất 1 nguồn khớp keyword
   * (1 NH = 1 TK) → tránh nhầm khi có nhiều TK cùng ngân hàng.
   */
  bankKeywords?: string[];
}

export const PAYMENT_SOURCES: PaymentSource[] = [
  { label: "MB-6612388123 (Cá nhân)", accountDigits: "6612388123" },
  { label: "MB-0967686594 (Long)", accountDigits: "0967686594" },
  { label: "TECH-1231236868 (Công ty)", accountDigits: "1231236868" },
  // App chuyển tiền của S8 là VietinBank eFAST → tên NH luôn đọc đúng dù số TK lỗi.
  { label: "VTB-111600925668 (Công ty)", accountDigits: "111600925668", bankKeywords: ["vietinbank", "vietin", "efast"] },
  { label: "TCB-1902 0186 4550 12 (Cá nhân)", accountDigits: "19020186455012" },
];

/** Mọi label — tiện cho dropdown (giữ tương thích code cũ dùng string[]). */
export const PAYMENT_SOURCE_LABELS: string[] = PAYMENT_SOURCES.map((s) => s.label);

/**
 * Dò nguồn thanh toán từ text OCR của ảnh UNC.
 * Nối toàn bộ digits trong text rồi tìm số TK của từng nguồn (substring).
 * Số TK 10-13 chữ số → khả năng false-match cực thấp.
 * Người NHẬN (NCC) không nằm trong PAYMENT_SOURCES nên không gây nhầm.
 * @returns label nguồn khớp, hoặc null nếu không đọc được.
 */
export function matchPaymentSource(ocrText: string): string | null {
  if (!ocrText) return null;
  // 1) Khớp số TK (chính xác nhất) — nối mọi digits trong text rồi tìm substring.
  const digits = ocrText.replace(/\D/g, "");
  if (digits) {
    for (const s of PAYMENT_SOURCES) {
      if (digits.includes(s.accountDigits)) return s.label;
    }
  }
  // 2) Fallback theo TÊN NGÂN HÀNG khi OCR đọc số TK sai (vd "111"→"T11"/"ST 1").
  //    Chỉ nhận khi DUY NHẤT 1 nguồn khớp keyword (1 NH = 1 TK) — tránh nhầm.
  const lower = ocrText
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const hits = PAYMENT_SOURCES.filter(
    (s) => (s.bankKeywords ?? []).some((kw) => lower.includes(kw)),
  );
  return hits.length === 1 ? hits[0].label : null;
}
