import { describe, it, expect } from "vitest";
import { resolveVpScope, doanInVpScope } from "@/hooks/use-doan-scope";

// Logic scope văn phòng — phải khớp helper SQL current_user_vp_scope() +
// can_access_van_phong() trong migration 20260609_van_phong_hard_scope.

describe("resolveVpScope", () => {
  it("van_phong_ids NULL, home=2 → [2]", () => {
    expect(resolveVpScope(null, 2)).toEqual([2]);
  });

  it("van_phong_ids=[3], home=2 → gộp [3,2] (VP nhà luôn có)", () => {
    expect(resolveVpScope([3], 2).sort()).toEqual([2, 3]);
  });

  it("home đã nằm trong van_phong_ids → không lặp", () => {
    expect(resolveVpScope([2, 3], 2).sort()).toEqual([2, 3]);
  });

  it("cả hai NULL → [] (không thấy đoàn nào)", () => {
    expect(resolveVpScope(null, null)).toEqual([]);
  });

  it("van_phong_ids rỗng, home=1 → [1]", () => {
    expect(resolveVpScope([], 1)).toEqual([1]);
  });
});

describe("doanInVpScope", () => {
  const scope = [2, 3];

  it("đoàn VP trong scope → true", () => {
    expect(doanInVpScope(2, scope)).toBe(true);
    expect(doanInVpScope(3, scope)).toBe(true);
  });

  it("đoàn VP ngoài scope → false", () => {
    expect(doanInVpScope(1, scope)).toBe(false);
  });

  it("đoàn van_phong_id NULL → false (chỉ cross-VP thấy, non-cross bị ẩn)", () => {
    expect(doanInVpScope(null, scope)).toBe(false);
    expect(doanInVpScope(undefined, scope)).toBe(false);
  });

  it("scope rỗng → mọi đoàn false", () => {
    expect(doanInVpScope(2, [])).toBe(false);
  });
});
