import { describe, it, expect } from "vitest";
import { hashPassword } from "@/lib/crypto";

describe("hashPassword", () => {
  it("returns a lowercase hex string of exactly 64 characters", async () => {
    const hash = await hashPassword("hello");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the correct SHA-256 for a known input", async () => {
    // SHA-256("password") = 5e884898...
    const hash = await hashPassword("password");
    expect(hash).toBe("5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8");
  });

  it("hashes the empty string to the known SHA-256 value", async () => {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const hash = await hashPassword("");
    expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb924" + "27ae41e4649b934ca495991b7852b855");
  });

  it("is deterministic — same input always produces same hash", async () => {
    const a = await hashPassword("test-input");
    const b = await hashPassword("test-input");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await hashPassword("abc");
    const b = await hashPassword("abd");
    expect(a).not.toBe(b);
  });
});
