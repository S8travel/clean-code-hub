import { describe, it, expect } from "vitest";
import { shouldReload } from "./version-check";

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
