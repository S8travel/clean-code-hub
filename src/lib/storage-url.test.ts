import { describe, it, expect } from "vitest";
import { parseStorageUrl, needsSigning } from "./storage-url";

const BASE = "https://lflsbwoqzmbknzdpaequ.supabase.co/storage/v1/object";

describe("parseStorageUrl — tách bucket + path từ URL đã lưu trong DB", () => {
  it("đọc được URL công khai (dạng các cột *_url trong DB đang lưu)", () => {
    expect(parseStorageUrl(`${BASE}/public/dntt-documents/170/unc.pdf`)).toEqual({
      bucket: "dntt-documents",
      path: "170/unc.pdf",
    });
  });

  it("đọc được cả URL đã ký (để ký lại link hết hạn không bị lồng bucket)", () => {
    expect(parseStorageUrl(`${BASE}/sign/dntt-documents/92/hoa-don.pdf?token=abc.def`)).toEqual({
      bucket: "dntt-documents",
      path: "92/hoa-don.pdf",
    });
  });

  it("giữ đúng path nhiều cấp và giải mã ký tự đã encode", () => {
    expect(parseStorageUrl(`${BASE}/public/dntt-documents/doan-220/Hoa%20don%20thang%205.pdf`)).toEqual({
      bucket: "dntt-documents",
      path: "doan-220/Hoa don thang 5.pdf",
    });
  });

  it("bỏ qua query string, không nuốt vào path", () => {
    expect(parseStorageUrl(`${BASE}/public/dntt-documents/a/b.pdf?download=1`)?.path).toBe("a/b.pdf");
  });

  it("trả null cho URL không phải storage (link ngoài dán tay)", () => {
    expect(parseStorageUrl("https://drive.google.com/file/d/abc/view")).toBeNull();
    expect(parseStorageUrl("")).toBeNull();
    expect(parseStorageUrl("khong-phai-url")).toBeNull();
  });
});

describe("needsSigning — chỉ ký cho bucket đã khoá", () => {
  it("bucket chứng từ đã khoá → phải ký", () => {
    expect(needsSigning(`${BASE}/public/dntt-documents/170/unc.pdf`)).toBe(true);
    expect(needsSigning(`${BASE}/public/doan-files/x.pdf`)).toBe(true);
  });

  it("bucket còn public → KHÔNG ký, giữ URL bền cho ảnh nhúng mail", () => {
    // email-images phải giữ public: ảnh nhúng trong mail đã gửi cho nhà cung cấp
    // không thể ký lại, link ký hết hạn là mail hỏng ảnh.
    expect(needsSigning(`${BASE}/public/email-images/email-inline/1.png`)).toBe(false);
    expect(needsSigning(`${BASE}/public/nha-hang-anh/1.jpg`)).toBe(false);
    expect(needsSigning(`${BASE}/public/web-images/banner.png`)).toBe(false);
  });

  it("link ngoài → không đụng vào", () => {
    expect(needsSigning("https://example.com/a.pdf")).toBe(false);
  });
});
