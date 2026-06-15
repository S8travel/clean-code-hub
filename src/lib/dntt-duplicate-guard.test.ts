import { describe, it, expect } from "vitest";
import { wouldOverCommit } from "./dntt-duplicate-guard";

describe("wouldOverCommit", () => {
  it("ĐNTT đầu tiên (chưa có gì) → không cảnh báo", () => {
    expect(wouldOverCommit(0, 4_860_000, 4_860_000)).toBe(false);
  });

  it("vết INDIGO: đã có 1 ĐNTT full, tạo thêm 1 full nữa → cảnh báo", () => {
    expect(wouldOverCommit(4_860_000, 4_860_000, 4_860_000)).toBe(true);
  });

  it("cọc + còn lại đúng tổng → không cảnh báo", () => {
    // cọc 375k rồi còn lại 375k, cost 750k
    expect(wouldOverCommit(375_000, 375_000, 750_000)).toBe(false);
  });

  it("phần đề nghị cuối khớp vừa đủ chi phí → không cảnh báo", () => {
    expect(wouldOverCommit(2_000_000, 1_000_000, 3_000_000)).toBe(false);
  });

  it("lệch trong tolerance làm tròn → không cảnh báo", () => {
    expect(wouldOverCommit(750_000, 1, 750_000)).toBe(false); // 750001 > 750001? không
    expect(wouldOverCommit(750_000, 2, 750_000)).toBe(true); // 750002 > 750001 → có
  });

  it("vượt rõ rệt → cảnh báo", () => {
    expect(wouldOverCommit(10_000_000, 5_000_000, 10_000_000)).toBe(true);
  });
});
