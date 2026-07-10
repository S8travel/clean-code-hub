import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDoanList, useCreateDoan, useUpdateDoan, useDeleteDoan, useCancelDoan } from "@/hooks/use-doan";

// Supabase chainable builder factory
function makeBuilder(resolved: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  const chainMethods = ["select", "insert", "update", "delete", "upsert", "eq", "not", "gte", "lte", "order", "filter", "limit", "in", "is"];
  for (const method of chainMethods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }
  builder.single = vi.fn().mockResolvedValue(resolved);
  builder.maybeSingle = vi.fn().mockResolvedValue(resolved);
  builder.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(resolved).then(resolve, reject);
  return builder;
}

const mockFrom = vi.fn();

vi.mock("@/lib/supabase-external", () => ({
  externalSupabase: {
    get from() { return mockFrom; },
    auth: {
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  },
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useDoanList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns data from Supabase on success", async () => {
    const mockData = [{ id: 1, ten_doan: "Tour A" }];
    mockFrom.mockReturnValue(makeBuilder({ data: mockData, error: null }));

    const { result } = renderHook(() => useDoanList(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it("enters error state when Supabase returns an error", async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: "DB error" } }));

    const { result } = renderHook(() => useDoanList(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreateDoan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with the created record on success", async () => {
    const newDoan = { id: 99, ten_doan: "New Tour" };
    mockFrom.mockReturnValue(makeBuilder({ data: newDoan, error: null }));

    const { result } = renderHook(() => useCreateDoan(), { wrapper: makeWrapper() });
    result.current.mutate({ ten_doan: "New Tour" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(newDoan);
  });

  it("enters error state when Supabase returns an error", async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: "Insert failed" } }));

    const { result } = renderHook(() => useCreateDoan(), { wrapper: makeWrapper() });
    result.current.mutate({ ten_doan: "Fail Tour" });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateDoan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves on successful update", async () => {
    const updated = { id: 1, ten_doan: "Updated Tour" };
    mockFrom.mockReturnValue(makeBuilder({ data: updated, error: null }));

    const { result } = renderHook(() => useUpdateDoan(), { wrapper: makeWrapper() });
    result.current.mutate({ id: 1, ten_doan: "Updated Tour" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("enters error state when update fails", async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: "Update failed" } }));

    const { result } = renderHook(() => useUpdateDoan(), { wrapper: makeWrapper() });
    result.current.mutate({ id: 1, ten_doan: "Fail" });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDeleteDoan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves when deletion succeeds", async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: null }));

    const { result } = renderHook(() => useDeleteDoan(), { wrapper: makeWrapper() });
    result.current.mutate(42);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("enters error state when deletion fails", async () => {
    mockFrom.mockReturnValue(makeBuilder({ data: null, error: { message: "Delete failed" } }));

    const { result } = renderHook(() => useDeleteDoan(), { wrapper: makeWrapper() });
    result.current.mutate(42);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCancelDoan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ghi trang_thai + ly_do_huy (đã trim) khi hủy", async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCancelDoan(), { wrapper: makeWrapper() });
    result.current.mutate({ id: 5, lyDoHuy: "  khách hủy do bão  " });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(builder.update).toHaveBeenCalledWith({ trang_thai: "huy", ly_do_huy: "khách hủy do bão" });
  });

  it("ghi agent_huy_id khi được truyền; null = xoá agent hủy cũ", async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCancelDoan(), { wrapper: makeWrapper() });
    result.current.mutate({ id: 5, lyDoHuy: "agent báo hủy", agentHuyId: 7 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(builder.update).toHaveBeenCalledWith({ trang_thai: "huy", ly_do_huy: "agent báo hủy", agent_huy_id: 7 });
  });

  it("KHÔNG đụng cột agent_huy_id khi bỏ trống", async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCancelDoan(), { wrapper: makeWrapper() });
    result.current.mutate({ id: 5, lyDoHuy: "lý do" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const payload = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).not.toHaveProperty("agent_huy_id");
  });

  // Chặn tầng 2: UI đã disable nút, nhưng hook có thể bị gọi thẳng.
  it("lý do rỗng / chỉ khoảng trắng → lỗi, KHÔNG ghi DB", async () => {
    const builder = makeBuilder({ data: null, error: null });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useCancelDoan(), { wrapper: makeWrapper() });
    result.current.mutate({ id: 5, lyDoHuy: "   " });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(builder.update).not.toHaveBeenCalled();
  });
});
