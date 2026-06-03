import { describe, it, expect } from "vitest";
import { mergeConsecutiveKSNights, addDaysIso, type KSRoomNight } from "./ks-dntt-merge";

const night = (p: Partial<KSRoomNight> & { name: string; ngayDate: string }): KSRoomNight => ({
  so_luong: 1,
  don_gia: 1_000_000,
  foc_count: 0,
  so_dem: 1,
  ...p,
});

describe("addDaysIso", () => {
  it("+1 ngày", () => expect(addDaysIso("2026-06-18", 1)).toBe("2026-06-19"));
  it("+2 ngày qua tháng", () => expect(addDaysIso("2026-06-29", 2)).toBe("2026-07-01"));
  it("+0 ngày giữ nguyên", () => expect(addDaysIso("2026-06-18", 0)).toBe("2026-06-18"));
});

describe("mergeConsecutiveKSNights", () => {
  it("2 đêm liền nhau cùng cơ cấu phòng → 1 dòng so_dem=2", () => {
    const out = mergeConsecutiveKSNights([
      night({ name: "FAMILY SUITE", don_gia: 2_070_000, ngayDate: "2026-06-18" }),
      night({ name: "FAMILY SUITE", don_gia: 2_070_000, ngayDate: "2026-06-19" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "FAMILY SUITE", ngayDate: "2026-06-18", so_dem: 2 });
  });

  it("nhiều phòng xen kẽ qua 2 đêm → gộp đúng từng phòng (case g8 trong ảnh)", () => {
    const out = mergeConsecutiveKSNights([
      night({ name: "FAMILY SUITE", don_gia: 2_070_000, ngayDate: "2026-06-18" }),
      night({ name: "TRIP", don_gia: 1_150_000, ngayDate: "2026-06-18" }),
      night({ name: "TWIN/DBL/SGL", so_luong: 7, don_gia: 800_000, ngayDate: "2026-06-18" }),
      night({ name: "FAMILY SUITE", don_gia: 2_070_000, ngayDate: "2026-06-19" }),
      night({ name: "TRIP", don_gia: 1_150_000, ngayDate: "2026-06-19" }),
      night({ name: "TWIN/DBL/SGL", so_luong: 7, don_gia: 800_000, ngayDate: "2026-06-19" }),
    ]);
    expect(out).toHaveLength(3);
    // tất cả gộp so_dem=2, check-in 18/6
    expect(out.every((r) => r.so_dem === 2 && r.ngayDate === "2026-06-18")).toBe(true);
    expect(out.map((r) => r.name)).toEqual(["FAMILY SUITE", "TRIP", "TWIN/DBL/SGL"]);
  });

  it("tổng tiền không đổi sau gộp", () => {
    const nights = [
      night({ name: "TWIN", so_luong: 7, don_gia: 800_000, ngayDate: "2026-06-18" }),
      night({ name: "TWIN", so_luong: 7, don_gia: 800_000, ngayDate: "2026-06-19" }),
    ];
    const billed = (r: KSRoomNight) => r.don_gia * (r.so_luong - r.foc_count) * r.so_dem;
    const before = nights.reduce((s, r) => s + billed(r), 0);
    const after = mergeConsecutiveKSNights(nights).reduce((s, r) => s + billed(r), 0);
    expect(after).toBe(before);
    expect(after).toBe(7 * 800_000 * 2);
  });

  it("tên phòng lệch dấu cách cuối → vẫn gộp (bug g8 VDA061805JX6)", () => {
    // OP gõ 'TWIN/DBL/SGL ' (đêm 18) và 'TWIN/DBL/SGL' (đêm 19) — trước đây không gộp
    const out = mergeConsecutiveKSNights([
      night({ name: "TWIN/DBL/SGL ", so_luong: 7, don_gia: 800_000, ngayDate: "2026-06-18" }),
      night({ name: "TWIN/DBL/SGL", so_luong: 7, don_gia: 800_000, ngayDate: "2026-06-19" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].so_dem).toBe(2);
  });

  it("tên phòng lệch dấu cách GIỮA → vẫn gộp", () => {
    const out = mergeConsecutiveKSNights([
      night({ name: "FAMILY SUITE ( TWIN+DBL) ", don_gia: 2_070_000, ngayDate: "2026-06-18" }),
      night({ name: "FAMILY SUITE (TWIN+DBL)", don_gia: 2_070_000, ngayDate: "2026-06-19" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].so_dem).toBe(2);
  });

  it("khác đơn giá → KHÔNG gộp", () => {
    const out = mergeConsecutiveKSNights([
      night({ name: "TWIN", don_gia: 800_000, ngayDate: "2026-06-18" }),
      night({ name: "TWIN", don_gia: 900_000, ngayDate: "2026-06-19" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("khác FOC → KHÔNG gộp", () => {
    const out = mergeConsecutiveKSNights([
      night({ name: "TWIN", so_luong: 7, foc_count: 1, ngayDate: "2026-06-18" }),
      night({ name: "TWIN", so_luong: 7, foc_count: 0, ngayDate: "2026-06-19" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("đêm có gap (không liền nhau) → KHÔNG gộp", () => {
    const out = mergeConsecutiveKSNights([
      night({ name: "TWIN", ngayDate: "2026-06-18" }),
      night({ name: "TWIN", ngayDate: "2026-06-20" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("3 đêm liền nhau → so_dem=3", () => {
    const out = mergeConsecutiveKSNights([
      night({ name: "TWIN", ngayDate: "2026-06-18" }),
      night({ name: "TWIN", ngayDate: "2026-06-19" }),
      night({ name: "TWIN", ngayDate: "2026-06-20" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].so_dem).toBe(3);
  });

  it("ngày rỗng → giữ riêng, không crash", () => {
    const out = mergeConsecutiveKSNights([
      night({ name: "TWIN", ngayDate: "" }),
      night({ name: "TWIN", ngayDate: "" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("input rỗng → []", () => {
    expect(mergeConsecutiveKSNights([])).toEqual([]);
  });
});
