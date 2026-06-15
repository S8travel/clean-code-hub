import { describe, it, expect } from "vitest";
import {
  addDaysISO,
  subDaysISO,
  shiftWeekendToFriday,
  computeDeadline,
} from "./lock-phong-deadline";

describe("addDaysISO / subDaysISO", () => {
  it("cộng/trừ ngày, qua tháng", () => {
    expect(addDaysISO("2026-07-01", 1)).toBe("2026-07-02");
    expect(addDaysISO("2026-07-31", 1)).toBe("2026-08-01");
    expect(subDaysISO("2026-08-01", 1)).toBe("2026-07-31");
  });
  it("input rỗng / days=0 → rỗng", () => {
    expect(addDaysISO("", 5)).toBe("");
    expect(subDaysISO("2026-07-01", 0)).toBe("");
  });
});

describe("shiftWeekendToFriday", () => {
  it("Thứ Bảy → thứ Sáu (−1)", () => {
    // 2026-07-04 là thứ Bảy
    expect(shiftWeekendToFriday("2026-07-04")).toBe("2026-07-03");
  });
  it("Chủ Nhật → thứ Sáu (−2)", () => {
    // 2026-07-05 là Chủ Nhật
    expect(shiftWeekendToFriday("2026-07-05")).toBe("2026-07-03");
  });
  it("ngày trong tuần giữ nguyên", () => {
    // 2026-07-02 là thứ Năm, 2026-07-03 là thứ Sáu, 2026-07-06 là thứ Hai
    expect(shiftWeekendToFriday("2026-07-02")).toBe("2026-07-02");
    expect(shiftWeekendToFriday("2026-07-03")).toBe("2026-07-03");
    expect(shiftWeekendToFriday("2026-07-06")).toBe("2026-07-06");
  });
  it("kết quả luôn là thứ Sáu (DOW 5) khi input là cuối tuần", () => {
    const sat = shiftWeekendToFriday("2026-07-04");
    const sun = shiftWeekendToFriday("2026-07-05");
    const dow = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    };
    expect(dow(sat)).toBe(5);
    expect(dow(sun)).toBe(5);
  });
});

describe("computeDeadline", () => {
  it("check-in − N ngày, rồi né cuối tuần về thứ Sáu", () => {
    // check-in 2026-08-03 (thứ Hai) − 30 ngày = 2026-07-04 (T7) → 2026-07-03 (T6)
    expect(computeDeadline("2026-08-03", 30)).toBe("2026-07-03");
  });
  it("nếu kết quả đã là ngày thường thì giữ nguyên", () => {
    // check-in 2026-08-01 (T7) − 30 = 2026-07-02 (T5) → giữ nguyên
    expect(computeDeadline("2026-08-01", 30)).toBe("2026-07-02");
  });
  it("thiếu input → rỗng", () => {
    expect(computeDeadline("", 30)).toBe("");
    expect(computeDeadline("2026-08-01", 0)).toBe("");
  });
});
