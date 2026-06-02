import { describe, it, expect } from "vitest";
import { dvGroupName } from "./use-dieu-tour";

// Gom Booking DV theo NHÀ CUNG CẤP: có NCC → tên NCC; chưa gắn → fallback tên dịch vụ.
describe("dvGroupName", () => {
  it("có NCC → dùng tên nhà cung cấp", () => {
    const m = new Map([[27, "San Hô Đỏ Travel"]]);
    expect(dvGroupName({ nha_cung_cap_id: 27, ten: "Cano San Hô Đỏ" }, m)).toBe("San Hô Đỏ Travel");
  });

  it("chưa gắn NCC (null) → fallback tên dịch vụ", () => {
    expect(dvGroupName({ nha_cung_cap_id: null, ten: "Cầu kính Sapa" }, new Map())).toBe("Cầu kính Sapa");
  });

  it("có nha_cung_cap_id nhưng map thiếu / tên rỗng → fallback tên dịch vụ", () => {
    expect(dvGroupName({ nha_cung_cap_id: 99, ten: "Vé tàu" }, new Map())).toBe("Vé tàu");
    expect(dvGroupName({ nha_cung_cap_id: 99, ten: "Vé tàu" }, new Map([[99, "   "]]))).toBe("Vé tàu");
  });

  it("2 dịch vụ cùng NCC → cùng 1 nhóm (cùng tên NCC)", () => {
    const m = new Map([[5, "NCC A"]]);
    const k1 = dvGroupName({ nha_cung_cap_id: 5, ten: "Dịch vụ 1" }, m);
    const k2 = dvGroupName({ nha_cung_cap_id: 5, ten: "Dịch vụ 2" }, m);
    expect(k1).toBe(k2);
    expect(k1).toBe("NCC A");
  });
});
