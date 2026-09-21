import { describe, it, expect } from "vitest";
import { resolveAgentScope, doanInAgentScope, duongDanChoPhepAgent } from "./agent-scope";

describe("resolveAgentScope", () => {
  it("null / rỗng = tài khoản thường, không giới hạn", () => {
    expect(resolveAgentScope(null)).toBeNull();
    expect(resolveAgentScope(undefined)).toBeNull();
    expect(resolveAgentScope([])).toBeNull();
  });

  it("bỏ trùng", () => {
    expect(resolveAgentScope([2, 2, 5])).toEqual([2, 5]);
  });
});

describe("doanInAgentScope", () => {
  it("scope null → mọi đoàn đều qua", () => {
    expect(doanInAgentScope(7, null)).toBe(true);
    expect(doanInAgentScope(null, null)).toBe(true);
  });

  it("chỉ đoàn của agent trong scope", () => {
    expect(doanInAgentScope(2, [2])).toBe(true);
    expect(doanInAgentScope(3, [2])).toBe(false);
  });

  it("đoàn chưa gán agent → ẩn với tài khoản giới hạn", () => {
    expect(doanInAgentScope(null, [2])).toBe(false);
    expect(doanInAgentScope(undefined, [2])).toBe(false);
  });
});

describe("duongDanChoPhepAgent", () => {
  it("mở danh sách đoàn, chi tiết đoàn, thông báo", () => {
    expect(duongDanChoPhepAgent("/doan")).toBe(true);
    expect(duongDanChoPhepAgent("/doan/")).toBe(true);
    expect(duongDanChoPhepAgent("/doan/123")).toBe(true);
    expect(duongDanChoPhepAgent("/thong-bao")).toBe(true);
  });

  it("chặn danh mục, ĐNTT, UNC, công nợ, trang chủ", () => {
    for (const p of [
      "/", "/my-job", "/dashboard", "/de-nghi-thanh-toan", "/hoa-don-unc", "/cong-no",
      "/thanh-toan-dinh-ky", "/hoan-ung", "/quan-ly/khach-san", "/quan-ly/nha-hang",
      "/quan-ly/nha-cung-cap", "/bao-gia", "/leads", "/doan/abc", "/doan/1/x",
    ]) {
      expect(duongDanChoPhepAgent(p), p).toBe(false);
    }
  });
});
