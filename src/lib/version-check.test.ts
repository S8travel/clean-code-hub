import { describe, it, expect } from "vitest";
import { shouldReload, formatCountdown } from "./version-check";

describe("shouldReload", () => {
  it("true khi latest khác current", () => {
    expect(shouldReload("100", "200")).toBe(true);
  });

  it("false khi latest trùng current", () => {
    expect(shouldReload("100", "100")).toBe(false);
  });

  it("false khi latest rỗng / không hợp lệ (tránh reload nhầm khi fetch lỗi)", () => {
    expect(shouldReload("100", "")).toBe(false);
    expect(shouldReload("100", null)).toBe(false);
    expect(shouldReload("100", undefined)).toBe(false);
    expect(shouldReload("100", 200)).toBe(false);
  });
});

describe("formatCountdown", () => {
  it("ân hạn 5 phút hiển thị 5:00", () => {
    expect(formatCountdown(300)).toBe("5:00");
  });

  it("pad giây < 10", () => {
    expect(formatCountdown(249)).toBe("4:09");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(5)).toBe("0:05");
  });

  it("0 và âm → 0:00 (không hiện số âm lúc reload)", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-3)).toBe("0:00");
  });

  it("làm tròn xuống giây lẻ", () => {
    expect(formatCountdown(90.9)).toBe("1:30");
  });
});
