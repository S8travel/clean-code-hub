import { describe, it, expect } from "vitest";
import { errMsg, isFkViolation } from "./error";

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

describe("isFkViolation", () => {
  it("true khi err có code 23503", () => {
    expect(isFkViolation({ code: "23503", message: "fk" })).toBe(true);
  });

  it("false với mã lỗi khác / null / không có code", () => {
    expect(isFkViolation({ code: "23505" })).toBe(false);
    expect(isFkViolation(null)).toBe(false);
    expect(isFkViolation(new Error("boom"))).toBe(false);
  });
});
