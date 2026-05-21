import { describe, it, expect } from "vitest";
import { errMsg } from "./error";

describe("errMsg", () => {
  it("trả về message của Error", () => {
    expect(errMsg(new Error("boom"))).toBe("boom");
  });

  it("trả về chính chuỗi khi err là string", () => {
    expect(errMsg("plain text")).toBe("plain text");
  });

  it("trả về message của object kiểu lỗi Supabase {message}", () => {
    expect(errMsg({ message: "x" })).toBe("x");
  });

  it("trả về '' khi err là null", () => {
    expect(errMsg(null)).toBe("");
  });

  it("trả về '' khi err là undefined", () => {
    expect(errMsg(undefined)).toBe("");
  });

  it("trả về '' khi object không có message", () => {
    expect(errMsg({ code: "42501" })).toBe("");
  });

  it("trả về '' khi message không phải string", () => {
    expect(errMsg({ message: 123 })).toBe("");
  });
});
