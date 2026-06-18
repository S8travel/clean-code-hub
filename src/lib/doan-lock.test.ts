import { describe, it, expect } from "vitest";
import { isDoanLocked } from "./doan-lock";

describe("isDoanLocked", () => {
  const lockedSet = new Set([10, 20]);

  it("admin → KHÔNG khóa dù đoàn đã KTT-duyệt quyết toán", () => {
    expect(isDoanLocked("admin", lockedSet, 10)).toBe(false);
  });

  it("non-admin + đoàn đã khóa → khóa", () => {
    expect(isDoanLocked("dieu_hanh", lockedSet, 10)).toBe(true);
    expect(isDoanLocked("ke_toan", lockedSet, 20)).toBe(true);
  });

  it("giám đốc cũng bị khóa (chỉ admin mới mở)", () => {
    expect(isDoanLocked("giam_doc", lockedSet, 10)).toBe(true);
  });

  it("đoàn KHÔNG nằm trong locked set → không khóa", () => {
    expect(isDoanLocked("dieu_hanh", lockedSet, 99)).toBe(false);
  });

  it("doanId null/undefined → không khóa", () => {
    expect(isDoanLocked("dieu_hanh", lockedSet, null)).toBe(false);
    expect(isDoanLocked("dieu_hanh", lockedSet, undefined)).toBe(false);
  });

  it("lockedSet null/undefined → không khóa", () => {
    expect(isDoanLocked("dieu_hanh", null, 10)).toBe(false);
    expect(isDoanLocked("dieu_hanh", undefined, 10)).toBe(false);
  });

  it("role null/undefined + đã khóa → khóa (không phải admin)", () => {
    expect(isDoanLocked(null, lockedSet, 10)).toBe(true);
    expect(isDoanLocked(undefined, lockedSet, 10)).toBe(true);
  });
});
