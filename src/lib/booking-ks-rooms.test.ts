import { describe, it, expect } from "vitest";
import {
  getBookingRoomDates,
  nextDateStr,
  splitRoomText,
  expandRoomValues,
  serializeRoomValues,
  getRoomInfoForDate,
  getPreferredRoomInfoForDate,
  normalizeRoomValue,
  groupConsecutiveNights,
} from "./booking-ks-rooms";

describe("getBookingRoomDates", () => {
  it("dedupe + sort", () => {
    expect(getBookingRoomDates(["2026-01-03", "2026-01-01", "2026-01-03"])).toEqual([
      "2026-01-01",
      "2026-01-03",
    ]);
  });
  it("loại bỏ falsy ('', undefined cast)", () => {
    expect(getBookingRoomDates(["", "2026-01-01", ""])).toEqual(["2026-01-01"]);
  });
  it("input rỗng → []", () => {
    expect(getBookingRoomDates([])).toEqual([]);
  });
});

describe("nextDateStr", () => {
  it("ngày bình thường +1", () => {
    expect(nextDateStr("2026-01-15")).toBe("2026-01-16");
  });
  it("cuối tháng → sang tháng mới", () => {
    expect(nextDateStr("2026-01-31")).toBe("2026-02-01");
  });
  it("cuối năm → sang năm mới", () => {
    expect(nextDateStr("2026-12-31")).toBe("2027-01-01");
  });
  it("năm nhuận 2024-02-28 → 02-29", () => {
    expect(nextDateStr("2024-02-28")).toBe("2024-02-29");
  });
  it("năm thường 2026-02-28 → 03-01", () => {
    expect(nextDateStr("2026-02-28")).toBe("2026-03-01");
  });
  it("padStart cho tháng/ngày < 10", () => {
    expect(nextDateStr("2026-01-09")).toBe("2026-01-10");
    expect(nextDateStr("2026-09-30")).toBe("2026-10-01");
  });
});

describe("splitRoomText", () => {
  it("null → []", () => {
    expect(splitRoomText(null)).toEqual([]);
  });
  it("undefined → []", () => {
    expect(splitRoomText(undefined)).toEqual([]);
  });
  it("'' → []", () => {
    expect(splitRoomText("")).toEqual([]);
  });
  it("1 dòng", () => {
    expect(splitRoomText("twn")).toEqual(["twn"]);
  });
  it("nhiều dòng \\n", () => {
    expect(splitRoomText("twn\nsgl\ntwn")).toEqual(["twn", "sgl", "twn"]);
  });
  it("nhiều dòng \\r\\n (Windows)", () => {
    expect(splitRoomText("twn\r\nsgl")).toEqual(["twn", "sgl"]);
  });
  it("trim từng dòng", () => {
    expect(splitRoomText("  twn  \n  sgl  ")).toEqual(["twn", "sgl"]);
  });
});

describe("expandRoomValues", () => {
  const dates = ["2026-01-01", "2026-01-02", "2026-01-03"];

  it("raw=null + 3 ngày → ['', '', '']", () => {
    expect(expandRoomValues(null, dates)).toEqual(["", "", ""]);
  });

  it("raw 1 dòng + 3 ngày → fill cùng giá trị (apply-all)", () => {
    expect(expandRoomValues("twn", dates)).toEqual(["twn", "twn", "twn"]);
  });

  it("raw nhiều dòng + 3 ngày → mỗi ngày 1 giá trị", () => {
    expect(expandRoomValues("twn\nsgl\ntwn", dates)).toEqual(["twn", "sgl", "twn"]);
  });

  it("raw ít dòng hơn số ngày → fill '' cho cuối", () => {
    expect(expandRoomValues("twn\nsgl", dates)).toEqual(["twn", "sgl", ""]);
  });

  it("raw nhiều dòng hơn số ngày → cắt theo số ngày", () => {
    expect(expandRoomValues("a\nb\nc\nd\ne", dates)).toEqual(["a", "b", "c"]);
  });

  it("dates rỗng → length=1 (Math.max(0, 1))", () => {
    expect(expandRoomValues("twn", [])).toEqual(["twn"]);
    expect(expandRoomValues(null, [])).toEqual([""]);
  });

  it("dates có duplicate → dedupe trước khi tính length", () => {
    // 4 dates raw nhưng dedupe còn 2 → fill 2 phần tử
    expect(expandRoomValues("a\nb\nc", ["2026-01-01", "2026-01-01", "2026-01-02"])).toEqual([
      "a", "b",
    ]);
  });
});

describe("serializeRoomValues", () => {
  it("tất cả rỗng → ''", () => {
    expect(serializeRoomValues(["", "", ""])).toBe("");
  });

  it("tất cả giống nhau → trả 1 dòng (compact)", () => {
    expect(serializeRoomValues(["twn", "twn", "twn"])).toBe("twn");
  });

  it("khác nhau → join '\\n' (giữ hết)", () => {
    expect(serializeRoomValues(["twn", "sgl", "twn"])).toBe("twn\nsgl\ntwn");
  });

  it("trailing '' → bỏ (giữ tới phần tử cuối có giá trị)", () => {
    expect(serializeRoomValues(["twn", "sgl", "", ""])).toBe("twn\nsgl");
  });

  it("'' ở giữa → giữ", () => {
    expect(serializeRoomValues(["twn", "", "sgl"])).toBe("twn\n\nsgl");
  });

  it("trim từng giá trị trước khi serialize", () => {
    expect(serializeRoomValues(["  twn  ", "  twn  "])).toBe("twn");
  });

  it("chỉ phần tử đầu có giá trị → trả phần tử đó (apply-all được)", () => {
    expect(serializeRoomValues(["twn", "", ""])).toBe("twn");
  });
});

describe("getRoomInfoForDate", () => {
  const dates = ["2026-01-01", "2026-01-02", "2026-01-03"];

  it("apply-all (1 dòng raw) → giá trị giống nhau mọi ngày", () => {
    expect(getRoomInfoForDate("twn", dates, "2026-01-02")).toBe("twn");
  });

  it("per-day → đúng ngày", () => {
    expect(getRoomInfoForDate("a\nb\nc", dates, "2026-01-02")).toBe("b");
  });

  it("ngày không có trong dates → fallback values[0]", () => {
    expect(getRoomInfoForDate("a\nb\nc", dates, "2030-01-01")).toBe("a");
  });

  it("raw null + ngày có trong dates → ''", () => {
    expect(getRoomInfoForDate(null, dates, "2026-01-02")).toBe("");
  });

  it("dates input không sort → vẫn dùng sortedDates (sort tăng dần)", () => {
    // dates: [03, 01, 02] → sort: [01, 02, 03]; raw a/b/c map theo sort
    expect(getRoomInfoForDate("a\nb\nc", ["2026-01-03", "2026-01-01", "2026-01-02"], "2026-01-02")).toBe(
      "b",
    );
  });
});

describe("getPreferredRoomInfoForDate", () => {
  const dates = ["2026-01-01", "2026-01-02"];

  it("final có giá trị → dùng final, bỏ qua đặt trước", () => {
    expect(
      getPreferredRoomInfoForDate("sgl\nsgl", "twn\ntwn", dates, "2026-01-01"),
    ).toBe("sgl");
  });

  it("final null → fallback đặt trước", () => {
    expect(getPreferredRoomInfoForDate(null, "twn\ntwn", dates, "2026-01-01")).toBe("twn");
  });

  it("final='' (empty raw → '') → fallback đặt trước", () => {
    expect(getPreferredRoomInfoForDate("", "twn\ntwn", dates, "2026-01-01")).toBe("twn");
  });

  it("final có nhưng ngày đó '' → fallback đặt trước cho ngày đó", () => {
    // final raw 'twn\n' → ngày 2 = ''; đặt trước 'sgl\nsgl' có giá trị → dùng sgl
    expect(getPreferredRoomInfoForDate("twn\n", "sgl\nsgl", dates, "2026-01-02")).toBe("sgl");
  });

  it("cả hai đều null → ''", () => {
    expect(getPreferredRoomInfoForDate(null, null, dates, "2026-01-01")).toBe("");
  });
});

describe("normalizeRoomValue", () => {
  it("bỏ khoảng trắng giữa + viết hoa", () => {
    expect(normalizeRoomValue("11 TWIN")).toBe("11TWIN");
    expect(normalizeRoomValue("11TWIN")).toBe("11TWIN");
  });
  it("'11 TWIN' và '11TWIN' chuẩn hoá bằng nhau", () => {
    expect(normalizeRoomValue("11 TWIN")).toBe(normalizeRoomValue("11TWIN"));
  });
  it("khác hoa/thường vẫn bằng nhau", () => {
    expect(normalizeRoomValue("2 twn")).toBe(normalizeRoomValue("2 TWN"));
  });
  it("mix loại phòng — bỏ mọi khoảng trắng vẫn so khớp", () => {
    expect(normalizeRoomValue("2 TWN + 1 SGL")).toBe(normalizeRoomValue("2TWN+1SGL"));
  });
});

describe("groupConsecutiveNights", () => {
  it("3 đêm liền nhau cùng loại phòng → 1 lượt", () => {
    const groups = groupConsecutiveNights(
      ["2026-09-17", "2026-09-18", "2026-09-19"],
      ["11 TWIN", "11 TWIN", "11 TWIN"],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ startDate: "2026-09-17", endDate: "2026-09-19", soDem: 3 });
  });

  it("cùng loại phòng nhưng KHÁC khoảng trắng → vẫn gom 1 lượt (bug 26/09)", () => {
    // "11 TWIN" (2 đêm) + "11TWIN" (1 đêm) liền nhau → trước đây tách 2 lượt
    const groups = groupConsecutiveNights(
      ["2026-09-17", "2026-09-18", "2026-09-19"],
      ["11 TWIN", "11 TWIN", "11TWIN"],
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ startDate: "2026-09-17", endDate: "2026-09-19", soDem: 3 });
    expect(groups[0].value).toBe("11 TWIN"); // hiển thị giữ chuỗi gốc đêm đầu
  });

  it("khác loại phòng thật → tách lượt", () => {
    const groups = groupConsecutiveNights(
      ["2026-09-17", "2026-09-18", "2026-09-19"],
      ["11 TWIN", "11 TWIN", "10 TWIN + 1 SGL"],
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ soDem: 2 });
    expect(groups[1]).toMatchObject({ startDate: "2026-09-19", soDem: 1 });
  });

  it("đêm KHÔNG liền nhau (gap) → tách lượt dù cùng loại phòng", () => {
    const groups = groupConsecutiveNights(
      ["2026-09-17", "2026-09-18", "2026-09-20"],
      ["11 TWIN", "11 TWIN", "11 TWIN"],
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ endDate: "2026-09-18", soDem: 2 });
    expect(groups[1]).toMatchObject({ startDate: "2026-09-20", soDem: 1 });
  });

  it("rỗng → []", () => {
    expect(groupConsecutiveNights([], [])).toEqual([]);
  });
});

describe("round-trip: serialize ↔ expand", () => {
  const dates = ["2026-01-01", "2026-01-02", "2026-01-03"];

  it("expand(serialize(values)) === values khi values KHÁC nhau", () => {
    const values = ["twn", "sgl", "twn"];
    expect(expandRoomValues(serializeRoomValues(values), dates)).toEqual(values);
  });

  it("apply-all: serialize([a,a,a])='a' → expand('a', 3 dates) = [a,a,a]", () => {
    const values = ["twn", "twn", "twn"];
    expect(expandRoomValues(serializeRoomValues(values), dates)).toEqual(values);
  });

  it("trailing rỗng: serialize([a, '', '']) = 'a' → expand = [a, a, a] (KHÔNG round-trip exact)", () => {
    // Đây là known behavior: trailing rỗng bị "merge" thành apply-all
    const out = expandRoomValues(serializeRoomValues(["twn", "", ""]), dates);
    expect(out).toEqual(["twn", "twn", "twn"]); // KHÔNG phải ['twn','','']
  });
});
