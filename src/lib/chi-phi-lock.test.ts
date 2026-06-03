import { describe, it, expect } from "vitest";
import { isChiPhiLocked } from "./chi-phi-lock";

describe("isChiPhiLocked", () => {
  const qtSet = new Set([10, 20]);

  it("admin → KHÔNG khóa dù đoàn đã quyết toán", () => {
    expect(isChiPhiLocked("admin", qtSet, 10)).toBe(false);
  });

  it("non-admin + đoàn đã quyết toán → khóa", () => {
    expect(isChiPhiLocked("dieu_hanh", qtSet, 10)).toBe(true);
    expect(isChiPhiLocked("ke_toan", qtSet, 20)).toBe(true);
  });

  it("giám đốc cũng bị khóa (chỉ admin mới mở)", () => {
    expect(isChiPhiLocked("giam_doc", qtSet, 10)).toBe(true);
  });

  it("đoàn CHƯA quyết toán → không khóa", () => {
    expect(isChiPhiLocked("dieu_hanh", qtSet, 99)).toBe(false);
  });

  it("doanId null/undefined → không khóa", () => {
    expect(isChiPhiLocked("dieu_hanh", qtSet, null)).toBe(false);
    expect(isChiPhiLocked("dieu_hanh", qtSet, undefined)).toBe(false);
  });

  it("qtPaidSet null/undefined → không khóa", () => {
    expect(isChiPhiLocked("dieu_hanh", null, 10)).toBe(false);
    expect(isChiPhiLocked("dieu_hanh", undefined, 10)).toBe(false);
  });

  it("role null/undefined + đã quyết toán → khóa (không phải admin)", () => {
    expect(isChiPhiLocked(null, qtSet, 10)).toBe(true);
    expect(isChiPhiLocked(undefined, qtSet, 10)).toBe(true);
  });
});
