import { describe, it, expect } from "vitest";
import { getDefaultDeadline, blockWeekendDate, normalizeEmails, cn } from "@/lib/utils";

describe("getDefaultDeadline", () => {
  it("returns empty string for empty input", () => {
    expect(getDefaultDeadline("")).toBe("");
  });

  it("returns empty string for invalid date string", () => {
    expect(getDefaultDeadline("not-a-date")).toBe("");
  });

  it("subtracts 7 days from a weekday service date", () => {
    // 2025-04-30 (Wednesday) - 7 = 2025-04-23 (Wednesday)
    expect(getDefaultDeadline("2025-04-30")).toBe("2025-04-23");
  });

  it("snaps to Friday when result lands on Saturday", () => {
    // 2025-05-03 (Saturday) - 7 = 2025-04-26 (Saturday) → Friday 2025-04-25
    expect(getDefaultDeadline("2025-05-03")).toBe("2025-04-25");
  });

  it("snaps to Friday when result lands on Sunday", () => {
    // 2025-05-04 (Sunday) - 7 = 2025-04-27 (Sunday) → Friday 2025-04-25
    expect(getDefaultDeadline("2025-05-04")).toBe("2025-04-25");
  });

  it("does not adjust when result is already a Friday", () => {
    // 2025-05-02 (Friday) - 7 = 2025-04-25 (Friday)
    expect(getDefaultDeadline("2025-05-02")).toBe("2025-04-25");
  });
});

describe("blockWeekendDate", () => {
  it("returns empty string for empty input", () => {
    expect(blockWeekendDate("")).toBe("");
  });

  it("returns the original value on invalid input", () => {
    expect(blockWeekendDate("not-a-date")).toBe("not-a-date");
  });

  it("passes through a weekday date unchanged", () => {
    expect(blockWeekendDate("2025-04-23")).toBe("2025-04-23"); // Wednesday
  });

  it("snaps Saturday to the previous Friday", () => {
    expect(blockWeekendDate("2025-04-26")).toBe("2025-04-25"); // Sat → Fri
  });

  it("snaps Sunday to the previous Friday (two days back)", () => {
    expect(blockWeekendDate("2025-04-27")).toBe("2025-04-25"); // Sun → Fri
  });
});

describe("normalizeEmails", () => {
  it("returns empty string for null", () => {
    expect(normalizeEmails(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeEmails(undefined)).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(normalizeEmails("")).toBe("");
  });

  it("normalizes comma-separated emails", () => {
    expect(normalizeEmails("a@x.com,b@y.com")).toBe("a@x.com, b@y.com");
  });

  it("normalizes semicolon-separated emails", () => {
    expect(normalizeEmails("a@x.com;b@y.com")).toBe("a@x.com, b@y.com");
  });

  it("normalizes whitespace-separated emails", () => {
    expect(normalizeEmails("a@x.com b@y.com")).toBe("a@x.com, b@y.com");
  });

  it("normalizes newline-separated emails", () => {
    expect(normalizeEmails("a@x.com\nb@y.com")).toBe("a@x.com, b@y.com");
  });

  it("strips tokens that are not email addresses", () => {
    expect(normalizeEmails("a@x.com, not-an-email, b@y.com")).toBe("a@x.com, b@y.com");
  });

  it("is idempotent on already-normalized input", () => {
    const input = "a@x.com, b@y.com";
    expect(normalizeEmails(input)).toBe(input);
  });

  it("handles mixed delimiters", () => {
    expect(normalizeEmails("a@x.com; b@y.com\nc@z.com")).toBe("a@x.com, b@y.com, c@z.com");
  });

  it("tách 'Tên người <email>' → chỉ lấy email (Resend reject token có < >)", () => {
    expect(normalizeEmails("BW PREMIER MANAGER <sales10@bwpremier.com>, DIRECTOR <cdos@bwpremier.com>"))
      .toBe("sales10@bwpremier.com, cdos@bwpremier.com");
    expect(normalizeEmails("<sales10@bwpremier.com>, <reservation@bwpremier.com>"))
      .toBe("sales10@bwpremier.com, reservation@bwpremier.com");
  });

  it("bỏ dấu nháy + loại email trùng", () => {
    expect(normalizeEmails('"Lê Thị" <a@x.com>, a@x.com, b@y.com')).toBe("a@x.com, b@y.com");
  });
});

describe("cn", () => {
  it("returns a single class unchanged", () => {
    expect(cn("p-4")).toBe("p-4");
  });

  it("merges conflicting Tailwind classes (last wins)", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("drops falsy conditional values", () => {
    expect(cn("base", false)).toBe("base");
    expect(cn("base", undefined)).toBe("base");
  });

  it("includes truthy conditional values", () => {
    expect(cn("base", "active")).toBe("base active");
  });
});
