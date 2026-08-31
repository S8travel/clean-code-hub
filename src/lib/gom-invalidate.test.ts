import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gomLaiMotLan } from "./gom-invalidate";

describe("gomLaiMotLan — chặn bão realtime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("187 sự kiện dồn dập chỉ chạy MỘT lần", () => {
    const chay = vi.fn();
    const goi = gomLaiMotLan(chay, 800);
    for (let i = 0; i < 187; i++) goi();
    expect(chay).not.toHaveBeenCalled();   // chưa chạy ngay
    vi.advanceTimersByTime(800);
    expect(chay).toHaveBeenCalledTimes(1);
  });

  it("hai đợt cách xa nhau thì chạy hai lần — không nuốt mất cập nhật thật", () => {
    const chay = vi.fn();
    const goi = gomLaiMotLan(chay, 800);
    goi();
    vi.advanceTimersByTime(800);
    goi();
    vi.advanceTimersByTime(800);
    expect(chay).toHaveBeenCalledTimes(2);
  });

  it("sự kiện tới liên tục thì dời hẹn, chạy sau khi lặng", () => {
    const chay = vi.fn();
    const goi = gomLaiMotLan(chay, 800);
    for (let i = 0; i < 5; i++) {
      goi();
      vi.advanceTimersByTime(500);   // chưa đủ lặng
    }
    expect(chay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(chay).toHaveBeenCalledTimes(1);
  });

  it("một sự kiện lẻ vẫn chạy, chỉ chậm đúng khoảng chờ", () => {
    const chay = vi.fn();
    gomLaiMotLan(chay, 800)();
    vi.advanceTimersByTime(799);
    expect(chay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(chay).toHaveBeenCalledTimes(1);
  });
});
