import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import React from "react";
import { useChoTaiLai } from "@/hooks/use-cho-tai-lai";

// Chạy với React Query THẬT (jsdom có window → observer đặt hẹn giờ hết hạn như trên
// trình duyệt). Hàm thuần buocChoTaiLai có test riêng ở lib/cho-tai-lai.test.ts.

const KEY = ["cho_tai_lai_test", 1];
const KEY2 = ["cho_tai_lai_test", 2];

afterEach(() => { vi.useRealTimers(); });

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function useKichBan(queryFn: () => Promise<number>, staleTime: number) {
  const q = useQuery({ queryKey: KEY, queryFn, staleTime, retry: false });
  const choTaiLai = useChoTaiLai("1|", [q]);
  return { choTaiLai, data: q.data, isStale: q.isStale, isFetchedAfterMount: q.isFetchedAfterMount };
}

function useHaiQuery(fn1: () => Promise<number>, fn2: () => Promise<number>) {
  const q1 = useQuery({ queryKey: KEY, queryFn: fn1, staleTime: 60_000, retry: false });
  const q2 = useQuery({ queryKey: KEY2, queryFn: fn2, staleTime: 60_000, retry: false });
  const choTaiLai = useChoTaiLai("1|", [q1, q2]);
  return { choTaiLai, d1: q1.data, d2: q2.data };
}

/** queryFn treo tới khi test gọi traVe(). */
function taiTreo() {
  let traVe: (v: number) => void = () => {};
  const fn = vi.fn(() => new Promise<number>((resolve) => { traVe = resolve; }));
  return { fn, traVe: (v: number) => traVe(v) };
}

describe("useChoTaiLai (React Query thật)", () => {
  it("HỒI QUY 28/09: mở với cache còn hạn → hết hạn sau staleTime KHÔNG quay lại 'Đang tải'", async () => {
    // Đóng băng Date (setTimeout vẫn thật): khoảng setQueryData → mount không thể vượt
    // staleTime dù máy CI bận; sau đó tự đẩy đồng hồ để cache hết hạn.
    vi.useFakeTimers({ toFake: ["Date"] });
    const qc = new QueryClient();
    qc.setQueryData(KEY, 1); // vd DoanDetail vừa tải doan_chi_phi xong
    const fn = vi.fn(async () => 2);
    const { result } = renderHook(() => useKichBan(fn, 50), { wrapper: makeWrapper(qc) });
    expect(result.current.choTaiLai).toBe(false);

    vi.setSystemTime(Date.now() + 1_000);
    await waitFor(() => expect(result.current.isStale).toBe(true));
    // Đúng thế của sự cố: cổng cũ (isStale && !isFetchedAfterMount) sẽ báo "cache cũ".
    expect(result.current.isFetchedAfterMount).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    expect(result.current.choTaiLai).toBe(false);
  });

  it("HỒI QUY 28/09: mở với cache còn hạn rồi bị invalidate khi bảng đang hiện → không nháy 'Đang tải'", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, 1);
    const tai = taiTreo();
    const { result } = renderHook(() => useKichBan(tai.fn, 60_000), { wrapper: makeWrapper(qc) });
    expect(result.current.choTaiLai).toBe(false);

    act(() => { void qc.invalidateQueries({ queryKey: KEY }); }); // lưu ô KS/DV, realtime
    await waitFor(() => expect(tai.fn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isStale).toBe(true));
    // Đúng thế cổng cũ báo "cache cũ" → tháo bảng, mất ô đang gõ.
    expect(result.current.isFetchedAfterMount).toBe(false);
    expect(result.current.choTaiLai).toBe(false);
  });

  it("#410: mở với cache đã bị đánh dấu cũ (vừa lưu Điều tour) → chờ đúng lượt tải lúc mở", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, 1);
    await qc.invalidateQueries({ queryKey: KEY }); // chưa ai theo dõi → chỉ đánh dấu cũ
    const tai = taiTreo();
    const { result } = renderHook(() => useKichBan(tai.fn, 60_000), { wrapper: makeWrapper(qc) });
    expect(result.current.data).toBe(1); // đang cầm bản cache cũ
    expect(result.current.choTaiLai).toBe(true);

    act(() => tai.traVe(2));
    await waitFor(() => expect(result.current.choTaiLai).toBe(false));
    expect(result.current.data).toBe(2);

    // Tải lại ngầm về sau (lưu ô KS/DV, realtime) → không tháo bảng.
    act(() => { void qc.invalidateQueries({ queryKey: KEY }); });
    await waitFor(() => expect(tai.fn).toHaveBeenCalledTimes(2));
    expect(result.current.choTaiLai).toBe(false);
  });

  it("#410: query tươi lúc mở bị invalidate khi cổng còn chờ query kia → chờ cả hai", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, 1);
    await qc.invalidateQueries({ queryKey: KEY }); // NH: cũ lúc mở
    qc.setQueryData(KEY2, 10); // chi phí: tươi lúc mở
    const tai1 = taiTreo();
    const tai2 = taiTreo();
    const { result } = renderHook(() => useHaiQuery(tai1.fn, tai2.fn), { wrapper: makeWrapper(qc) });
    expect(result.current.choTaiLai).toBe(true);

    // Lượt lưu Điều tour xong đúng lúc đang chờ → chi phí bị invalidate, tải lại.
    act(() => { void qc.invalidateQueries({ queryKey: KEY2 }); });
    await waitFor(() => expect(tai2.fn).toHaveBeenCalledTimes(1));

    act(() => tai1.traVe(2));
    await waitFor(() => expect(result.current.d1).toBe(2));
    expect(result.current.d2).toBe(10); // chi phí vẫn là bản trước khi lưu
    expect(result.current.choTaiLai).toBe(true);

    act(() => tai2.traVe(20));
    await waitFor(() => expect(result.current.choTaiLai).toBe(false));
    expect(result.current.d2).toBe(20);
  });

  it("mở với cache cũ mà lượt tải lúc mở lỗi → thả, không kẹt 'Đang tải'", async () => {
    const qc = new QueryClient();
    qc.setQueryData(KEY, 1);
    await qc.invalidateQueries({ queryKey: KEY });
    const fn = vi.fn(async (): Promise<number> => { throw new Error("mất kết nối"); });
    const { result } = renderHook(() => useKichBan(fn, 60_000), { wrapper: makeWrapper(qc) });
    expect(result.current.choTaiLai).toBe(true);
    await waitFor(() => expect(result.current.choTaiLai).toBe(false));
  });
});
