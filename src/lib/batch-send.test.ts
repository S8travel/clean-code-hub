import { describe, it, expect } from "vitest";
import { sendSequential } from "./batch-send";

describe("sendSequential", () => {
  it("gửi tuần tự đúng thứ tự, đếm ok/fail, lỗi không dừng batch", async () => {
    const order: number[] = [];
    const results: { i: number; ok: boolean }[] = [];
    const r = await sendSequential(
      [1, 2, 3],
      async (item, i) => {
        order.push(item);
        if (i === 1) throw new Error("boom");
      },
      { delayMs: 0, onResult: (i, ok) => results.push({ i, ok }) },
    );
    expect(order).toEqual([1, 2, 3]); // item 2 lỗi vẫn chạy tiếp item 3
    expect(r).toEqual({ ok: 2, fail: 1 });
    expect(results).toEqual([{ i: 0, ok: true }, { i: 1, ok: false }, { i: 2, ok: true }]);
  });

  it("onStart gọi trước từng item; mảng rỗng → 0/0", async () => {
    const starts: number[] = [];
    await sendSequential([9], async () => {}, { delayMs: 0, onStart: (i) => starts.push(i) });
    expect(starts).toEqual([0]);
    expect(await sendSequential([], async () => {}, { delayMs: 0 })).toEqual({ ok: 0, fail: 0 });
  });
});
