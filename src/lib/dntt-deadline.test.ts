import { describe, it, expect } from "vitest";
import { ngayCanTTClass } from "./dntt-deadline";

const TODAY = "2026-07-08";

describe("ngayCanTTClass", () => {
  it("quá hạn → đỏ", () => {
    expect(ngayCanTTClass("2026-07-07", { today: TODAY })).toContain("text-red-600");
  });
  it("hôm nay + trong 3 ngày → cam", () => {
    expect(ngayCanTTClass("2026-07-08", { today: TODAY })).toContain("text-amber-600");
    expect(ngayCanTTClass("2026-07-11", { today: TODAY })).toContain("text-amber-600");
  });
  it("xa hơn 3 ngày → mờ", () => {
    expect(ngayCanTTClass("2026-07-12", { today: TODAY })).toBe("text-muted-foreground");
  });
  it("đã trả hoặc không có hạn → mờ (hạn hết ý nghĩa)", () => {
    expect(ngayCanTTClass("2026-07-01", { today: TODAY, paid: true })).toBe("text-muted-foreground");
    expect(ngayCanTTClass(null, { today: TODAY })).toBe("text-muted-foreground");
  });
});
