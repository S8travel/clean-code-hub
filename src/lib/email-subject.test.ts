import { describe, it, expect } from "vitest";
import { sanitizeEmailSubject } from "./email-subject";

describe("sanitizeEmailSubject", () => {
  it("tên danh mục dính xuống dòng ở cuối → Resend không còn trả 422", () => {
    const ten = "Grand Pioneers Halong Bay Cruise\n";
    expect(sanitizeEmailSubject(`[S8 Travel] Đặt phòng – ABC123 – ${ten} – 09/07`))
      .toBe("[S8 Travel] Đặt phòng – ABC123 – Grand Pioneers Halong Bay Cruise – 09/07");
  });

  it("xuống dòng GIỮA tiêu đề → thành dấu cách, không nuốt chữ", () => {
    expect(sanitizeEmailSubject("Đặt phòng\nHạ Long")).toBe("Đặt phòng Hạ Long");
  });

  it("\\r\\n (dán từ Windows) và tab cũng bị gộp", () => {
    expect(sanitizeEmailSubject("A\r\nB\tC")).toBe("A B C");
  });

  it("nhiều khoảng trắng liên tiếp → gộp về một", () => {
    expect(sanitizeEmailSubject("A    B")).toBe("A B");
  });

  it("khoảng trắng thừa hai đầu → cắt", () => {
    expect(sanitizeEmailSubject("  [S8 Travel] Đặt xe  ")).toBe("[S8 Travel] Đặt xe");
  });

  it("tiêu đề sạch → giữ nguyên", () => {
    const s = "[S8 Travel] Đặt phòng – ABC123 – Khách sạn X – 09/07";
    expect(sanitizeEmailSubject(s)).toBe(s);
  });

  it("chuỗi rỗng / toàn khoảng trắng → rỗng", () => {
    expect(sanitizeEmailSubject("")).toBe("");
    expect(sanitizeEmailSubject("  \n\t ")).toBe("");
  });
});
