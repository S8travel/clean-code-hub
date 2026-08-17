import { describe, it, expect } from "vitest";
import { parseSoLuongBaoHiem } from "./bao-hiem-calc";

describe("parseSoLuongBaoHiem", () => {
  it("SL 0 là hợp lệ — đoàn không mua bảo hiểm", () => {
    expect(parseSoLuongBaoHiem("0")).toEqual({ ok: true, value: 0 });
  });
  it("ô để trống = 0 (xoá trắng để bỏ bảo hiểm)", () => {
    expect(parseSoLuongBaoHiem("")).toEqual({ ok: true, value: 0 });
    expect(parseSoLuongBaoHiem("   ")).toEqual({ ok: true, value: 0 });
  });
  it("số dương giữ nguyên, bỏ khoảng trắng thừa", () => {
    expect(parseSoLuongBaoHiem("28")).toEqual({ ok: true, value: 28 });
    expect(parseSoLuongBaoHiem(" 28 ")).toEqual({ ok: true, value: 28 });
  });
  it("số âm không hợp lệ → chặn lưu", () => {
    expect(parseSoLuongBaoHiem("-1").ok).toBe(false);
  });
  it("chữ / rác không hợp lệ → chặn lưu", () => {
    expect(parseSoLuongBaoHiem("abc").ok).toBe(false);
    expect(parseSoLuongBaoHiem("1a").ok).toBe(false);
  });
  it("thập phân hợp lệ (SL có thể lẻ khi tính tay)", () => {
    expect(parseSoLuongBaoHiem("3.5")).toEqual({ ok: true, value: 3.5 });
  });
});
