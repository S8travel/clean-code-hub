import { describe, it, expect } from "vitest";
import { tourProfile } from "./tour-profile";

describe("tourProfile", () => {
  it("null/undefined/giá trị lạ → inbound (giữ hành vi cũ)", () => {
    expect(tourProfile(null).key).toBe("inbound");
    expect(tourProfile(undefined).key).toBe("inbound");
    expect(tourProfile("xyz").key).toBe("inbound"); // string lạ từ DB → inbound
    expect(tourProfile("inbound").key).toBe("inbound");
  });

  it("inbound: hiện visa, ẩn vé máy bay, tip mặc định NDT", () => {
    const p = tourProfile("inbound");
    expect(p.showVisa).toBe(true);
    expect(p.showVeMayBay).toBe(false);
    expect(p.defaultTipCurrency).toBe("NDT");
  });

  it("outbound: hiện visa + vé máy bay", () => {
    const p = tourProfile("outbound");
    expect(p.showVisa).toBe(true);
    expect(p.showVeMayBay).toBe(true);
  });

  it("noi_dia: ẩn visa, hiện vé máy bay, tip mặc định VND", () => {
    const p = tourProfile("noi_dia");
    expect(p.showVisa).toBe(false);
    expect(p.showVeMayBay).toBe(true);
    expect(p.defaultTipCurrency).toBe("VND");
  });
});
