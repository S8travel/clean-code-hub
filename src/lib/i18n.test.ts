import { describe, it, expect, afterEach } from "vitest";
import { isZhTW, t, notifyLanguageChange } from "@/lib/i18n";

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const key = c.split("=")[0].trim();
    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
  notifyLanguageChange();
}

describe("isZhTW", () => {
  afterEach(clearCookies);

  it("returns false when googtrans cookie is not set", () => {
    expect(isZhTW()).toBe(false);
  });

  it("returns true when googtrans=/vi/zh-TW cookie is set", () => {
    document.cookie = "googtrans=/vi/zh-TW";
    expect(isZhTW()).toBe(true);
  });

  it("returns false when a different googtrans value is set", () => {
    document.cookie = "googtrans=/vi/en";
    expect(isZhTW()).toBe(false);
  });
});

describe("t", () => {
  afterEach(clearCookies);

  it("returns the Vietnamese string unchanged when not in ZH-TW mode", () => {
    expect(t("Lock Phòng")).toBe("Lock Phòng");
  });

  it("returns the override value in ZH-TW mode for a known key (synchronous)", () => {
    document.cookie = "googtrans=/vi/zh-TW";
    // Direct map lookup — không cần đợi async như i18next cũ.
    expect(t("Lock Phòng")).toBe("鎖房");
    expect(t("Danh sách đoàn")).toBe("團表");
  });

  it("returns the original string in ZH-TW mode when key has no override", () => {
    document.cookie = "googtrans=/vi/zh-TW";
    expect(t("Some unknown key xyz123")).toBe("Some unknown key xyz123");
  });
});
