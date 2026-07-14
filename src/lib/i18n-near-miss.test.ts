import { describe, it, expect } from "vitest";
import { normalizeKey, findNearMiss } from "./i18n-near-miss";

describe("normalizeKey", () => {
  it("ellipsis “…” và “...” quy về một", () => {
    expect(normalizeKey("Chọn nhà cung cấp…")).toBe(normalizeKey("Chọn nhà cung cấp..."));
  });
  it("gạch ngang dài và gạch nối quy về một", () => {
    expect(normalizeKey("A — B")).toBe(normalizeKey("A - B"));
    expect(normalizeKey("A – B")).toBe(normalizeKey("A - B"));
  });
  it("nháy cong và nháy thẳng quy về một", () => {
    expect(normalizeKey("“X”")).toBe(normalizeKey('"X"'));
    expect(normalizeKey("‘X’")).toBe(normalizeKey("'X'"));
  });
  it("nbsp và khoảng trắng thường quy về một", () => {
    expect(normalizeKey("A\u00A0B")).toBe(normalizeKey("A B"));
  });
  it("gom khoảng trắng thừa + trim", () => {
    expect(normalizeKey("  A   B  ")).toBe("A B");
  });
  it("chuỗi khác nghĩa thì KHÔNG quy về một", () => {
    expect(normalizeKey("Chọn nhà cung cấp")).not.toBe(normalizeKey("Chọn khách sạn"));
  });
});

describe("findNearMiss", () => {
  // Đây là ca THẬT làm main đỏ 13/07/2026 (PR #267).
  it("bắt đúng ca #267: source dùng “…”, file dịch có “...”", () => {
    const hit = findNearMiss("Chọn nhà cung cấp…", ["Chọn nhà cung cấp...", "Khách sạn"]);
    expect(hit?.keyDaCo).toBe("Chọn nhà cung cấp...");
    expect(hit?.khacBiet).toContain("ba chấm");
  });

  it("bắt lệch gạch ngang dài", () => {
    const hit = findNearMiss("A — B", ["A - B"]);
    expect(hit?.keyDaCo).toBe("A - B");
    expect(hit?.khacBiet).toContain("gạch ngang");
  });

  it("bắt lệch nháy cong", () => {
    expect(findNearMiss('Bấm “Gửi”', ['Bấm "Gửi"'])?.khacBiet).toContain("nháy kép");
  });

  it("bắt lệch khoảng trắng", () => {
    const hit = findNearMiss("A  B", ["A B"]);
    expect(hit?.keyDaCo).toBe("A B");
    expect(hit?.khacBiet).toContain("khoảng trắng");
  });

  // Key mới thật sự → phải trả null để người dịch biết là PHẢI thêm bản dịch,
  // chứ không phải sửa ký tự.
  it("key mới hoàn toàn → null (không có gần giống)", () => {
    expect(findNearMiss("Một chuỗi hoàn toàn mới", ["Chọn nhà cung cấp..."])).toBeNull();
  });

  it("danh sách rỗng → null", () => {
    expect(findNearMiss("X…", [])).toBeNull();
  });

  it("không tự khớp với chính nó", () => {
    expect(findNearMiss("A…", ["A…"])).toBeNull();
  });
});
