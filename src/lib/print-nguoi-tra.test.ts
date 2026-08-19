import { describe, it, expect } from "vitest";
import { resolveNguoiTra, laDongHdvTra } from "./print-nguoi-tra";

describe("resolveNguoiTra", () => {
  it("dòng nước phát sinh do HDV ứng tiền mặt: tien_hdv > 0, tien_cong_ty = 0 → hdv", () => {
    expect(resolveNguoiTra({ tien_hdv: 560_000, tien_cong_ty: 0 })).toBe("hdv");
    expect(laDongHdvTra({ tien_hdv: 560_000, tien_cong_ty: 0 })).toBe(true);
  });

  it("dòng công ty trả → cong_ty", () => {
    expect(resolveNguoiTra({ tien_hdv: 0, tien_cong_ty: 7_800_000 })).toBe("cong_ty");
    expect(laDongHdvTra({ tien_hdv: 0, tien_cong_ty: 7_800_000 })).toBe(false);
  });

  it("chuỗi số từ PostgREST (numeric trả về string) vẫn đọc đúng", () => {
    expect(resolveNguoiTra({ tien_hdv: "560000", tien_cong_ty: "0" } as never)).toBe("hdv");
  });

  it("cả hai vế = 0 (dòng giá 0 / chưa lưu) → giữ fallback của màn hình", () => {
    expect(resolveNguoiTra({ tien_hdv: 0, tien_cong_ty: 0 }, "hdv")).toBe("hdv");
    expect(resolveNguoiTra({ tien_hdv: 0, tien_cong_ty: 0 })).toBe("cong_ty");
  });

  it("không đọc được dòng DB (undefined/null) → fallback, KHÔNG tự coi là HDV trả", () => {
    expect(resolveNguoiTra(undefined)).toBe("cong_ty");
    expect(laDongHdvTra(null)).toBe(false);
    expect(resolveNguoiTra(undefined, "hdv")).toBe("hdv");
  });

  it("công ty đã trả một phần thì thắng (không loại dòng khỏi bản in)", () => {
    expect(resolveNguoiTra({ tien_hdv: 100_000, tien_cong_ty: 200_000 })).toBe("cong_ty");
  });
});
