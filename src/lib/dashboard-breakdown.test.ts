import { describe, it, expect } from "vitest";
import {
  buildMonthCols,
  monthIndexOf,
  countVisibleMonths,
  buildBreakdown,
  sumRows,
  rowTotalKhach,
} from "./dashboard-breakdown";

// Mốc cố định: 2026-05-15 → tháng này = 05/2026
const TODAY = new Date(2026, 4, 15);

interface D {
  agent: number | null;
  mien: string;
  ngay_di: string | null;
  khach: number;
  huy?: boolean;
}

describe("buildMonthCols", () => {
  it("tạo đúng số cột bắt đầu từ tháng hiện tại", () => {
    const cols = buildMonthCols(TODAY, 4);
    expect(cols.map((c) => c.key)).toEqual(["05/2026", "06/2026", "07/2026", "08/2026"]);
  });

  it("start/end bao trọn tháng", () => {
    const [m0] = buildMonthCols(TODAY, 1);
    expect(m0.start).toBe("2026-05-01");
    expect(m0.end).toBe("2026-05-31");
  });
});

describe("monthIndexOf", () => {
  const cols = buildMonthCols(TODAY, 4);
  it("map ngày vào đúng cột", () => {
    expect(monthIndexOf("2026-05-01", cols)).toBe(0);
    expect(monthIndexOf("2026-06-30", cols)).toBe(1);
    expect(monthIndexOf("2026-08-31", cols)).toBe(3);
  });
  it("ngoài phạm vi / null → -1", () => {
    expect(monthIndexOf("2026-04-30", cols)).toBe(-1); // tháng trước
    expect(monthIndexOf("2026-09-01", cols)).toBe(-1); // sau cùng
    expect(monthIndexOf(null, cols)).toBe(-1);
  });
});

describe("buildBreakdown — gom nhóm theo key", () => {
  const cols = buildMonthCols(TODAY, 4);
  const rows: D[] = [
    { agent: 1, mien: "Bắc", ngay_di: "2026-05-10", khach: 10 },
    { agent: 1, mien: "Bắc", ngay_di: "2026-05-20", khach: 5 },
    { agent: 1, mien: "Bắc", ngay_di: "2026-06-01", khach: 7 },
    { agent: 2, mien: "Nam", ngay_di: "2026-07-15", khach: 3 },
    { agent: null, mien: "Nam", ngay_di: "2026-05-01", khach: 99 }, // key null → bỏ
    { agent: 3, mien: "Bắc", ngay_di: null, khach: 50 },            // ngày null → bỏ
    { agent: 4, mien: "Trung", ngay_di: "2026-05-05", khach: 8, huy: true }, // huy → skip
  ];

  const result = buildBreakdown(rows, cols, {
    getKey: (d) => d.agent,
    getName: (d) => `A${d.agent}`,
    getNgayDi: (d) => d.ngay_di,
    getKhach: (d) => d.khach,
    skip: (d) => !!d.huy,
  });

  it("cộng dồn đoàn & khách theo tháng", () => {
    const a1 = result.find((r) => r.name === "A1")!;
    expect(a1.cells[0]).toEqual({ doan: 2, khach: 15 }); // 05: 2 đoàn, 15 khách
    expect(a1.cells[1]).toEqual({ doan: 1, khach: 7 });  // 06
    expect(a1.cells[2]).toEqual({ doan: 0, khach: 0 });  // 07
  });

  it("bỏ key null, ngày null, và row skip", () => {
    expect(result.map((r) => r.name).sort()).toEqual(["A1", "A2"]);
  });
});

describe("sumRows + rowTotalKhach", () => {
  const cols = buildMonthCols(TODAY, 3);
  const rows: D[] = [
    { agent: 1, mien: "Bắc", ngay_di: "2026-05-10", khach: 10 },
    { agent: 2, mien: "Nam", ngay_di: "2026-05-12", khach: 20 },
    { agent: 2, mien: "Nam", ngay_di: "2026-06-12", khach: 5 },
  ];
  const breakdown = buildBreakdown(rows, cols, {
    getKey: (d) => d.agent,
    getName: (d) => `A${d.agent}`,
    getNgayDi: (d) => d.ngay_di,
    getKhach: (d) => d.khach,
  });

  it("Tổng cộng từng cột", () => {
    const total = sumRows(breakdown, cols.length);
    expect(total.cells[0]).toEqual({ doan: 2, khach: 30 }); // 05: 2 đoàn 30 khách
    expect(total.cells[1]).toEqual({ doan: 1, khach: 5 });  // 06
    expect(total.cells[2]).toEqual({ doan: 0, khach: 0 });  // 07
  });

  it("rowTotalKhach cộng mọi tháng", () => {
    const a2 = breakdown.find((r) => r.name === "A2")!;
    expect(rowTotalKhach(a2)).toBe(25);
  });
});

describe("countVisibleMonths — trim tháng cuối rỗng, giữ tối thiểu", () => {
  const cols = buildMonthCols(TODAY, 4);
  const getNgayDi = (d: D) => d.ngay_di;
  const skip = (d: D) => !!d.huy;

  it("data tới tháng 06 → trim còn 3 (min=3)", () => {
    const rows: D[] = [
      { agent: 1, mien: "Bắc", ngay_di: "2026-05-10", khach: 10 },
      { agent: 1, mien: "Bắc", ngay_di: "2026-06-10", khach: 10 },
    ];
    expect(countVisibleMonths(rows, cols, getNgayDi, skip, 3)).toBe(3);
  });

  it("data tới tháng 08 → giữ đủ 4", () => {
    const rows: D[] = [
      { agent: 1, mien: "Bắc", ngay_di: "2026-05-10", khach: 10 },
      { agent: 2, mien: "Nam", ngay_di: "2026-08-10", khach: 10 },
    ];
    expect(countVisibleMonths(rows, cols, getNgayDi, skip, 3)).toBe(4);
  });

  it("không bao giờ xuống dưới min ngay cả khi rỗng hoàn toàn", () => {
    expect(countVisibleMonths([], cols, getNgayDi, skip, 3)).toBe(3);
  });

  it("đoàn huy không tính là có data", () => {
    const rows: D[] = [
      { agent: 1, mien: "Bắc", ngay_di: "2026-05-10", khach: 10 },
      { agent: 2, mien: "Nam", ngay_di: "2026-08-10", khach: 10, huy: true },
    ];
    expect(countVisibleMonths(rows, cols, getNgayDi, skip, 3)).toBe(3);
  });
});
