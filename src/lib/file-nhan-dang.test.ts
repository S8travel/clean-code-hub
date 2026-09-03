import { describe, it, expect } from "vitest";
import { nhanDangTheoByte, loiNhanDinhDang } from "./file-nhan-dang";

/** Dựng buffer từ chữ ký + phần đuôi (chuỗi ASCII hoặc mảng byte). */
function buf(...phan: (string | number[])[]): ArrayBuffer {
  const bytes: number[] = [];
  for (const p of phan) {
    if (typeof p === "string") bytes.push(...[...p].map((c) => c.charCodeAt(0)));
    else bytes.push(...p);
  }
  return new Uint8Array(bytes).buffer;
}

const OLE2 = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
const ZIP = [0x50, 0x4B, 0x03, 0x04];
/** Tên stream trong OLE2 nằm dạng UTF-16LE. */
const utf16 = (s: string): number[] => [...s].flatMap((c) => [c.charCodeAt(0), 0]);
const dem = (n: number) => new Array(n).fill(0);

describe("nhanDangTheoByte — tin ruột file, không tin đuôi tên", () => {
  it("docx đổi đuôi thành .doc vẫn nhận ra là docx", () => {
    expect(nhanDangTheoByte(buf(ZIP, "[Content_Types].xml", dem(20), "word/document.xml"))).toBe("docx");
  });

  it("xlsx nhận ra qua thư mục xl/, không nhầm sang docx", () => {
    expect(nhanDangTheoByte(buf(ZIP, "[Content_Types].xml", dem(20), "xl/workbook.xml"))).toBe("xlsx");
  });

  it("zip không phải Office → khac, KHÔNG đoán bừa", () => {
    expect(nhanDangTheoByte(buf(ZIP, "anh/chup-man-hinh.png", dem(40)))).toBe("khac");
  });

  it("Word 97 nhị phân thật → doc97", () => {
    expect(nhanDangTheoByte(buf(OLE2, dem(64), utf16("WordDocument"), dem(16)))).toBe("doc97");
  });

  it("Excel 97 nhị phân (cùng chữ ký OLE2) KHÔNG bị nhận nhầm thành Word", () => {
    expect(nhanDangTheoByte(buf(OLE2, dem(64), utf16("Workbook"), dem(16)))).toBe("xls97");
  });

  it("OLE2 không có stream nào quen → khac", () => {
    expect(nhanDangTheoByte(buf(OLE2, dem(200)))).toBe("khac");
  });

  it("nhận ra PDF và RTF đổi đuôi", () => {
    expect(nhanDangTheoByte(buf("%PDF-1.7", dem(20)))).toBe("pdf");
    expect(nhanDangTheoByte(buf("{\\rtf1\\ansi\\ansicpg950", dem(20)))).toBe("rtf");
  });

  it("file rỗng / quá ngắn không làm nổ", () => {
    expect(nhanDangTheoByte(new ArrayBuffer(0))).toBe("khac");
    expect(nhanDangTheoByte(buf([0x50, 0x4B]))).toBe("khac");
  });
});

describe("loiNhanDinhDang", () => {
  it("nói đúng thứ file đó là, kèm cách chữa cụ thể", () => {
    expect(loiNhanDinhDang("doc97")).toContain(".docx");
    expect(loiNhanDinhDang("rtf")).toContain("RTF");
    expect(loiNhanDinhDang("khac")).toContain("dán");
  });
});
