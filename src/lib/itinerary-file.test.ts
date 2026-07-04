import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { fileKind, imageMime, extractItineraryText } from "./itinerary-file";

describe("fileKind — phân loại file lịch trình", () => {
  it("pdf", () => {
    expect(fileKind("chuong-trinh.pdf")).toBe("pdf");
    expect(fileKind("A.PDF")).toBe("pdf");
  });
  it("ảnh", () => {
    for (const n of ["a.png", "b.JPG", "c.jpeg", "d.webp", "e.gif"]) expect(fileKind(n)).toBe("image");
  });
  it("word .docx (không tính .doc cũ)", () => {
    expect(fileKind("ct.docx")).toBe("docx");
    expect(fileKind("ct.doc")).toBe("other");
  });
  it("excel .xlsx/.xls", () => {
    expect(fileKind("gia.xlsx")).toBe("xlsx");
    expect(fileKind("gia.xls")).toBe("xlsx");
  });
  it("khác → other", () => {
    expect(fileKind("a.txt")).toBe("other");
    expect(fileKind("noext")).toBe("other");
  });
});

describe("imageMime", () => {
  it("map đúng MIME ảnh", () => {
    expect(imageMime("a.png")).toBe("image/png");
    expect(imageMime("b.jpeg")).toBe("image/jpeg");
    expect(imageMime("b.jpg")).toBe("image/jpeg");
    expect(imageMime("c.webp")).toBe("image/webp");
    expect(imageMime("x.pdf")).toBe("");
  });
});

describe("extractItineraryText — Excel → text (round-trip thật)", () => {
  it("đọc các sheet thành CSV text", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Ngày", "Hạng mục", "Giá"],
      [1, "Tây Hồ", 120000],
      [1, "Ăn trưa", 300000],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lịch trình");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const text = await extractItineraryText(buf, "xlsx");
    expect(text).toContain("Lịch trình");
    expect(text).toContain("Tây Hồ");
    expect(text).toContain("120000");
    expect(text).toContain("Ăn trưa");
  });

  it("kind không hỗ trợ → throw", async () => {
    await expect(extractItineraryText(new ArrayBuffer(0), "other")).rejects.toThrow();
  });
});
