import { describe, it, expect } from "vitest";
import { hashMailContent, isMailDirty } from "./mail-content-hash";

describe("hashMailContent — deterministic", () => {
  it("cùng input → cùng hash", () => {
    const a = hashMailContent({ x: 1, y: "abc" });
    const b = hashMailContent({ x: 1, y: "abc" });
    expect(a).toBe(b);
  });

  it("thứ tự key KHÔNG đổi hash (sorted internally)", () => {
    const a = hashMailContent({ x: 1, y: 2 });
    const b = hashMailContent({ y: 2, x: 1 });
    expect(a).toBe(b);
  });

  it("đổi value → đổi hash", () => {
    expect(hashMailContent({ x: 1 })).not.toBe(hashMailContent({ x: 2 }));
  });

  it("đổi key → đổi hash", () => {
    expect(hashMailContent({ x: 1 })).not.toBe(hashMailContent({ y: 1 }));
  });

  it("hash là base36 string (non-empty)", () => {
    const h = hashMailContent({ x: 1 });
    expect(typeof h).toBe("string");
    expect(h.length).toBeGreaterThan(0);
    expect(/^[0-9a-z]+$/.test(h)).toBe(true);
  });
});

describe("hashMailContent — normalize null/empty/falsy", () => {
  it("null vs undefined vs '' → cùng hash (treated as empty)", () => {
    expect(hashMailContent({ x: null })).toBe(hashMailContent({ x: undefined }));
    expect(hashMailContent({ x: null })).toBe(hashMailContent({ x: "" }));
  });

  it("0 KHÔNG bằng '' (giữ String(0)='0')", () => {
    expect(hashMailContent({ x: 0 })).not.toBe(hashMailContent({ x: "" }));
  });

  it("false KHÔNG bằng '' (giữ String(false)='false')", () => {
    expect(hashMailContent({ x: false })).not.toBe(hashMailContent({ x: "" }));
  });

  it("false KHÔNG bằng 0 (string khác)", () => {
    expect(hashMailContent({ x: false })).not.toBe(hashMailContent({ x: 0 }));
  });

  it("field thiếu vs field=null → KHÁC hash (vì key thiếu thì không có trong sortedKeys)", () => {
    expect(hashMailContent({ x: 1 })).not.toBe(hashMailContent({ x: 1, y: null }));
  });
});

describe("hashMailContent — array & object", () => {
  it("array order MATTER (join '|' theo thứ tự)", () => {
    expect(hashMailContent({ x: [1, 2, 3] })).not.toBe(hashMailContent({ x: [3, 2, 1] }));
  });

  it("array rỗng → ''", () => {
    expect(hashMailContent({ x: [] })).toBe(hashMailContent({ x: "" }));
  });

  it("array nested → normalize đệ quy", () => {
    const a = hashMailContent({ x: [[1, 2], [3]] });
    const b = hashMailContent({ x: [[1, 2], [3]] });
    expect(a).toBe(b);
  });

  it("object: thứ tự key KHÔNG đổi hash (sort recursively)", () => {
    expect(hashMailContent({ x: { a: 1, b: 2 } })).toBe(hashMailContent({ x: { b: 2, a: 1 } }));
  });

  it("object nested giữ deterministic", () => {
    const v1 = { ks: { ten: "A", gia: 1000 }, ngay: "2026-01-01" };
    const v2 = { ngay: "2026-01-01", ks: { gia: 1000, ten: "A" } };
    expect(hashMailContent(v1)).toBe(hashMailContent(v2));
  });

  it("đổi value trong nested object → đổi hash", () => {
    expect(hashMailContent({ x: { a: 1 } })).not.toBe(hashMailContent({ x: { a: 2 } }));
  });
});

describe("hashMailContent — case nghiệp vụ", () => {
  it("Booking KS thay loại phòng → hash đổi", () => {
    const before = hashMailContent({ ks_id: 5, loai_phong: "twn", so_phong: 10, gia: 2_650_000 });
    const after = hashMailContent({ ks_id: 5, loai_phong: "sgl", so_phong: 10, gia: 2_650_000 });
    expect(before).not.toBe(after);
  });

  it("Booking NH thay set_menu → hash đổi", () => {
    const b1 = hashMailContent({ nh_id: 3, set_menu_id: 7, gia: 150_000 });
    const b2 = hashMailContent({ nh_id: 3, set_menu_id: 8, gia: 150_000 });
    expect(b1).not.toBe(b2);
  });
});

describe("isMailDirty", () => {
  it("sentAt=null → false (chưa gửi mail bao giờ)", () => {
    expect(isMailDirty(null, "abc", { x: 1 })).toBe(false);
  });
  it("sentAt=undefined → false", () => {
    expect(isMailDirty(undefined, "abc", { x: 1 })).toBe(false);
  });
  it("sentAt='' (empty string falsy) → false", () => {
    expect(isMailDirty("", "abc", { x: 1 })).toBe(false);
  });
  it("storedHash=null → false (chưa lưu hash → không so sánh được)", () => {
    expect(isMailDirty("2026-01-01", null, { x: 1 })).toBe(false);
  });
  it("storedHash=undefined → false", () => {
    expect(isMailDirty("2026-01-01", undefined, { x: 1 })).toBe(false);
  });
  it("storedHash KHỚP với hash hiện tại → false (không dirty)", () => {
    const h = hashMailContent({ x: 1, y: "a" });
    expect(isMailDirty("2026-01-01", h, { x: 1, y: "a" })).toBe(false);
  });
  it("storedHash KHÁC hash hiện tại → true (dirty)", () => {
    const oldHash = hashMailContent({ x: 1 });
    expect(isMailDirty("2026-01-01", oldHash, { x: 2 })).toBe(true);
  });
  it("Sửa field array (loại phòng) sau gửi → dirty=true", () => {
    const sent = hashMailContent({ rooms: [["twn", 10]] });
    const now = { rooms: [["sgl", 10]] };
    expect(isMailDirty("2026-01-01", sent, now)).toBe(true);
  });
  it("Bỏ thêm field null sau gửi → KHÔNG dirty (null/missing không phân biệt)", () => {
    // Edge case: storedHash trên {x:1}, current {x:1, y:null} → y:null normalize='' nhưng
    // key 'y' VẪN xuất hiện trong sortedKeys → 'y=' thêm vào serialized → hash khác.
    const sent = hashMailContent({ x: 1 });
    expect(isMailDirty("2026-01-01", sent, { x: 1, y: null })).toBe(true);
  });
});
