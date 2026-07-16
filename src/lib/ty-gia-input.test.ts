import { describe, it, expect } from "vitest";
import { isTyGiaHopLe, planSaveTyGia, resolveTyGia } from "./ty-gia-input";

describe("planSaveTyGia — ô trống KHÔNG được xóa tỷ giá đã chốt", () => {
  // ĐÂY LÀ CA GÂY BUG: OP xóa trắng ô để gõ số mới, ô mất focus lúc đang trống
  // → code cũ ghi `0 || null` = NULL đè lên tỷ giá đúng → hôm sau mở ra thấy 800.
  it("ô trống (0) khi DB đã có tỷ giá → KHÔNG ghi gì", () => {
    expect(planSaveTyGia(0, 794)).toEqual({ luu: false, giaTri: 0 });
  });

  it("chuỗi rỗng / NaN → KHÔNG ghi", () => {
    expect(planSaveTyGia("", 794).luu).toBe(false);
    expect(planSaveTyGia(Number.NaN, 794).luu).toBe(false);
    expect(planSaveTyGia(null, 794).luu).toBe(false);
  });

  it("số âm → KHÔNG ghi", () => {
    expect(planSaveTyGia(-5, 794).luu).toBe(false);
  });

  it("số dương mới → ghi", () => {
    expect(planSaveTyGia(790, 794)).toEqual({ luu: true, giaTri: 790 });
  });

  it("đoàn chưa chốt (DB null) + số hợp lệ → ghi", () => {
    expect(planSaveTyGia(790, null)).toEqual({ luu: true, giaTri: 790 });
  });

  it("ô trống + DB cũng chưa chốt → vẫn KHÔNG ghi (đừng đụng vào)", () => {
    expect(planSaveTyGia(0, null).luu).toBe(false);
  });

  it("trùng giá trị DB → KHÔNG ghi (khỏi UPDATE thừa)", () => {
    expect(planSaveTyGia(794, 794).luu).toBe(false);
  });

  // Cột là `numeric` → tùy tầng có thể về dạng chuỗi. So sánh phải ép số, nếu không
  // `794 !== "794"` luôn đúng → blur phát nào cũng UPDATE + invalidate cả danh sách đoàn.
  it("DB trả về dạng chuỗi vẫn so sánh đúng, không ghi thừa", () => {
    expect(planSaveTyGia(794, "794").luu).toBe(false);
    expect(planSaveTyGia(790, "794")).toEqual({ luu: true, giaTri: 790 });
  });
});

describe("resolveTyGia — thứ tự ưu tiên khi hiển thị", () => {
  it("đoàn đã chốt → luôn thắng localStorage", () => {
    expect(resolveTyGia(794, "800")).toBe(794);
  });

  it("đoàn chưa chốt → lấy mặc định của máy", () => {
    expect(resolveTyGia(null, "805")).toBe(805);
  });

  it("đoàn chưa chốt + máy chưa có gì → 800", () => {
    expect(resolveTyGia(null, null)).toBe(800);
  });

  // localStorage bị đầu độc thành "0" chính là cách bug cũ kéo cả máy về 800.
  // Giờ "0" bị coi là rác và bỏ qua — nhưng vì không còn đoàn nào ghi "0" nữa,
  // đây chỉ là lưới an toàn cho các máy đã lỡ dính.
  it('localStorage rác ("0" / "" / "abc") bị bỏ qua, không kéo về 0', () => {
    expect(resolveTyGia(null, "0")).toBe(800);
    expect(resolveTyGia(null, "")).toBe(800);
    expect(resolveTyGia(null, "abc")).toBe(800);
  });

  it("DB dạng chuỗi (numeric) vẫn đọc ra số", () => {
    expect(resolveTyGia("794", null)).toBe(794);
  });

  it("DB = 0 coi như chưa chốt → rơi xuống mặc định máy", () => {
    expect(resolveTyGia(0, "805")).toBe(805);
  });
});

describe("isTyGiaHopLe", () => {
  it("biên", () => {
    expect(isTyGiaHopLe(1)).toBe(true);
    expect(isTyGiaHopLe(0.5)).toBe(false);
    expect(isTyGiaHopLe(0)).toBe(false);
    expect(isTyGiaHopLe(Infinity)).toBe(false);
  });
});
