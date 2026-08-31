import { describe, it, expect, afterEach } from "vitest";
import { isZhTW, t, notifyLanguageChange, getLang, getDateLocale } from "@/lib/i18n";

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

describe("getLang", () => {
  afterEach(clearCookies);

  it("defaults to vi when no cookie is set", () => {
    expect(getLang()).toBe("vi");
  });

  it("reads zh-TW and en from the googtrans cookie", () => {
    document.cookie = "googtrans=/vi/zh-TW";
    expect(getLang()).toBe("zh-TW");
    clearCookies();
    document.cookie = "googtrans=/vi/en";
    expect(getLang()).toBe("en");
  });
});

describe("t — EN mode", () => {
  afterEach(clearCookies);

  it("returns the English translation for a key present in en.json", () => {
    document.cookie = "googtrans=/vi/en";
    expect(t("Quản lý Lead")).toBe("Lead management");
    expect(t("Thông báo")).toBe("Notifications");
    // Label động (LEAD_TRANG_THAI_OPTS) — hiển thị qua t(o.label).
    expect(t("Đã liên hệ")).toBe("Contacted");
  });

  it("falls back to Vietnamese when en.json has no entry (locale partial)", () => {
    document.cookie = "googtrans=/vi/en";
    expect(t("Some unknown key xyz123")).toBe("Some unknown key xyz123");
  });

  it("does not leak zh-TW values into EN mode", () => {
    document.cookie = "googtrans=/vi/en";
    expect(t("Lock Phòng")).toBe("Room lock");
  });
});

describe("getDateLocale", () => {
  afterEach(clearCookies);

  it("picks the date-fns locale matching the current language", () => {
    expect(getDateLocale().code).toBe("vi");
    document.cookie = "googtrans=/vi/en";
    expect(getDateLocale().code).toBe("en-US");
    clearCookies();
    document.cookie = "googtrans=/vi/zh-TW";
    expect(getDateLocale().code).toBe("zh-TW");
  });
});
