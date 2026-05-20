import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { usePermission, useRoleAtLeast, useBoPhan } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/supabase-external", () => {
  const builder: any = {};
  const chainMethods = ["select", "insert", "update", "delete", "upsert", "eq", "not", "gte", "lte", "order", "filter", "limit"];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.single = vi.fn().mockResolvedValue({ data: null, error: null });
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  builder.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return {
    externalSupabase: {
      from: vi.fn().mockReturnValue(builder),
      auth: { signOut: vi.fn() },
      channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    },
  };
});

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("usePermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null });
  });

  it("returns false when user is null", () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => usePermission("doan", "view"), { wrapper: makeWrapper() });
    expect(result.current).toBe(false);
  });

  it("returns true for admin on any resource and action", () => {
    mockUseAuth.mockReturnValue({ user: { role: "admin" } });
    const { result: r1 } = renderHook(() => usePermission("doan", "delete"), { wrapper: makeWrapper() });
    expect(r1.current).toBe(true);

    const { result: r2 } = renderHook(() => usePermission("nguoi_dung", "create"), { wrapper: makeWrapper() });
    expect(r2.current).toBe(true);
  });

  it("returns true for any role on danh_muc resource", () => {
    mockUseAuth.mockReturnValue({ user: { role: "nhan_vien" } });
    const { result } = renderHook(() => usePermission("danh_muc", "view"), { wrapper: makeWrapper() });
    expect(result.current).toBe(true);
  });

  it("returns false when no matching permission row exists", () => {
    mockUseAuth.mockReturnValue({ user: { role: "nhan_vien" } });
    // Supabase mock returns [] so no matching row
    const { result } = renderHook(() => usePermission("doan", "edit"), { wrapper: makeWrapper() });
    expect(result.current).toBe(false);
  });
});

describe("useRoleAtLeast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when user is null", () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useRoleAtLeast("nhan_vien"), { wrapper: makeWrapper() });
    expect(result.current).toBe(false);
  });

  it("returns true when user role equals the minimum required role", () => {
    mockUseAuth.mockReturnValue({ user: { role: "truong_phong" } });
    const { result } = renderHook(() => useRoleAtLeast("truong_phong"), { wrapper: makeWrapper() });
    expect(result.current).toBe(true);
  });

  it("returns true when user role is higher than minimum", () => {
    mockUseAuth.mockReturnValue({ user: { role: "admin" } });
    const { result } = renderHook(() => useRoleAtLeast("nhan_vien"), { wrapper: makeWrapper() });
    expect(result.current).toBe(true);
  });

  it("returns false when user role is lower than minimum", () => {
    mockUseAuth.mockReturnValue({ user: { role: "nhan_vien" } });
    const { result } = renderHook(() => useRoleAtLeast("truong_phong"), { wrapper: makeWrapper() });
    expect(result.current).toBe(false);
  });

  it("treats unknown roles as level 0 (returns false for any minRole)", () => {
    mockUseAuth.mockReturnValue({ user: { role: "unknown_role" } });
    const { result } = renderHook(() => useRoleAtLeast("nhan_vien"), { wrapper: makeWrapper() });
    expect(result.current).toBe(false);
  });
});

describe("useBoPhan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when user is null", () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useBoPhan("ke_toan"), { wrapper: makeWrapper() });
    expect(result.current).toBe(false);
  });

  it("returns true for admin regardless of boPhan", () => {
    mockUseAuth.mockReturnValue({ user: { role: "admin", bo_phan: "other" } });
    const { result } = renderHook(() => useBoPhan("ke_toan"), { wrapper: makeWrapper() });
    expect(result.current).toBe(true);
  });

  it("returns true when user bo_phan matches", () => {
    mockUseAuth.mockReturnValue({ user: { role: "nhan_vien", bo_phan: "ke_toan" } });
    const { result } = renderHook(() => useBoPhan("ke_toan"), { wrapper: makeWrapper() });
    expect(result.current).toBe(true);
  });

  it("returns false when user bo_phan does not match", () => {
    mockUseAuth.mockReturnValue({ user: { role: "nhan_vien", bo_phan: "sale" } });
    const { result } = renderHook(() => useBoPhan("ke_toan"), { wrapper: makeWrapper() });
    expect(result.current).toBe(false);
  });
});
