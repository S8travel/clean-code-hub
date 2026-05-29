import { describe, it, expect } from "vitest";
import { matchPaymentSource, PAYMENT_SOURCES, PAYMENT_SOURCE_LABELS } from "./payment-sources";

describe("matchPaymentSource", () => {
  it("khớp số TK liền trong text OCR → VTB", () => {
    const text = "CONG TY TNHH DU LICH S8\n111600925668\nCHUYEN DEN ...";
    expect(matchPaymentSource(text)).toBe("VTB-111600925668 (Công ty)");
  });

  it("khớp dù số TK có separator/space (OCR giữ khoảng trắng) → TCB", () => {
    // TCB accountDigits = "1902018645012" — text có space giữa các cụm.
    const text = "Tài khoản nguồn: 1902 0186 4550 12 (Cá nhân)";
    expect(matchPaymentSource(text)).toBe("TCB-1902 0186 4550 12 (Cá nhân)");
  });

  it("khớp MB Long", () => {
    expect(matchPaymentSource("STK 0967686594 Long")).toBe("MB-0967686594 (Long)");
  });

  it("không có số TK nguồn nào trong list → null (để user chọn tay)", () => {
    // Số TK người nhận (NCC) — không nằm trong PAYMENT_SOURCES.
    expect(matchPaymentSource("Chuyen den 0101002336789 VCB Tan Phu Hung")).toBeNull();
  });

  it("text rỗng / không digits → null", () => {
    expect(matchPaymentSource("")).toBeNull();
    expect(matchPaymentSource("không có số nào")).toBeNull();
  });

  it("labels khớp số lượng sources", () => {
    expect(PAYMENT_SOURCE_LABELS).toHaveLength(PAYMENT_SOURCES.length);
  });
});
