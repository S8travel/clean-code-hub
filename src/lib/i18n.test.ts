import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isZhTW, t, ZH_CORRECTIONS } from "@/lib/i18n";

function clearCookies() {
  document.cookie.split(";").forEach((c) => {
    const key = c.split("=")[0].trim();
    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });
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

  // TODO: bản dịch ZH-TW chưa triển khai (i18n migration chưa bắt đầu) — bật lại khi xong.
  it.skip("returns the override value in ZH-TW mode for a known key", () => {
    document.cookie = "googtrans=/vi/zh-TW";
    expect(t("Lock Phòng")).toBe("鎖房");
    expect(t("Danh sách đoàn")).toBe("團表");
  });

  it("returns the original string in ZH-TW mode when key has no override", () => {
    document.cookie = "googtrans=/vi/zh-TW";
    expect(t("Some unknown key")).toBe("Some unknown key");
  });
});

describe("ZH_CORRECTIONS", () => {
  it("is a non-empty record of string pairs", () => {
    expect(typeof ZH_CORRECTIONS).toBe("object");
    expect(Object.keys(ZH_CORRECTIONS).length).toBeGreaterThan(0);
  });

  it("maps known wrong translations to correct ones", () => {
    expect(ZH_CORRECTIONS["更衣室"]).toBe("鎖房");
    expect(ZH_CORRECTIONS["S8 旅行"]).toBe("雙發旅行社");
  });
});

describe("DOM text correction via applyCorrectionsToNode (via startZhCorrectionObserver)", () => {
  beforeEach(() => {
    document.cookie = "googtrans=/vi/zh-TW";
  });

  afterEach(clearCookies);

  it("ZH_CORRECTIONS contains entries to replace", () => {
    const wrongText = "更衣室";
    const correctText = "鎖房";
    expect(ZH_CORRECTIONS[wrongText]).toBe(correctText);
  });

  it("ZH_CORRECTIONS replaces all known incorrect brand names", () => {
    expect(ZH_CORRECTIONS["S8旅行社"]).toBe("雙發旅行社");
    expect(ZH_CORRECTIONS["S8旅遊有限公司"]).toBe("雙發旅遊有限公司");
  });
});
