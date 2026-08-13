import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { fileKind, imageMime, extractItineraryText, unsupportedFileInfo } from "./itinerary-file";

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

describe("unsupportedFileInfo — báo lý do + cách chữa", () => {
  it("file đọc được → null", () => {
    for (const n of ["ct.pdf", "ct.docx", "gia.xlsx", "gia.xls", "a.png", "b.JPG"]) {
      expect(unsupportedFileInfo(n)).toBeNull();
    }
  });
  it(".doc Word cũ → chỉ đúng cách chữa là lưu thành .docx", () => {
    const info = unsupportedFileInfo("chuong-trinh-VN04.doc");
    expect(info).not.toBeNull();
    expect(info!.badge).toContain(".docx");
    expect(info!.help).toContain(".docx");
  });
  it(".DOC viết hoa cũng nhận ra (không rơi vào nhánh chung)", () => {
    expect(unsupportedFileInfo("CT.DOC")!.badge).toBe(unsupportedFileInfo("ct.doc")!.badge);
  });
  it("định dạng lạ → hướng dẫn chung, KHÔNG bảo lưu thành .docx", () => {
    const info = unsupportedFileInfo("ghi-chu.txt");
    expect(info).not.toBeNull();
    expect(info!.badge).not.toContain("Word bản cũ");
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
