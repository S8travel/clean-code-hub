import { describe, it, expect } from "vitest";
import { chonFocChoDong, cungFoc, focDangLuuDaVe, type FocDangLuu } from "./nh-foc-dong-bo";

const foc = (k: number | null, m: number | null) => ({ foc_khach_snapshot: k, foc_mien_snapshot: m });
const dangLuu = (k: number, m: number, xongLuc: number | null = null): FocDangLuu => ({ ...foc(k, m), xongLuc });

describe("cungFoc", () => {
  it("null và vắng field coi như nhau", () => {
    expect(cungFoc({}, foc(null, null))).toBe(true);
    expect(cungFoc(foc(16, 1), foc(16, 1))).toBe(true);
  });
  it("0 khác null (0 = OP xóa FOC, null = chưa từng đặt → lấy danh mục)", () => {
    expect(cungFoc(foc(0, 0), foc(null, null))).toBe(false);
  });
});

describe("chonFocChoDong", () => {
  it("HỒI QUY 28/09: dòng DB đã có FOC mới (ô FOC ghi thẳng DB) → bảng làm việc theo DB", () => {
    expect(chonFocChoDong(foc(null, null), foc(16, 1), null)).toEqual(foc(16, 1));
  });
  it("OP xóa FOC (DB 0/0) → theo DB, không giữ số cũ", () => {
    expect(chonFocChoDong(foc(16, 1), foc(0, 0), null)).toEqual(foc(0, 0));
  });
  it("ô FOC đang lưu → giữ số OP vừa gõ dù bản DB về trước đó còn số cũ", () => {
    expect(chonFocChoDong(foc(16, 1), foc(null, null), dangLuu(16, 1))).toEqual(foc(16, 1));
  });
  it("dòng chưa có trong DB (chưa lưu lần nào) → giữ nguyên state", () => {
    expect(chonFocChoDong(foc(20, 1), null, null)).toEqual(foc(20, 1));
    expect(chonFocChoDong({}, null, null)).toEqual(foc(null, null));
  });
});

describe("focDangLuuDaVe", () => {
  it("dòng DB đã mang đúng số vừa lưu → xong", () => {
    expect(focDangLuuDaVe(dangLuu(16, 1), foc(16, 1), 0)).toBe(true);
  });
  it("chưa lưu xong, bản DB còn số cũ → chưa (giữ số vừa gõ)", () => {
    expect(focDangLuuDaVe(dangLuu(16, 1), foc(null, null), 5_000)).toBe(false);
  });
  it("đã lưu xong nhưng bản tải về vẫn là bản trước lúc lưu → chưa", () => {
    expect(focDangLuuDaVe(dangLuu(16, 1, 5_000), foc(null, null), 4_000)).toBe(false);
  });
  it("bản tải SAU lúc lưu xong mà vẫn khác → người khác vừa sửa, theo DB", () => {
    expect(focDangLuuDaVe(dangLuu(16, 1, 5_000), foc(20, 2), 6_000)).toBe(true);
  });
  it("chưa có dòng DB → chỉ xong khi đã có bản tải sau lúc lưu", () => {
    expect(focDangLuuDaVe(dangLuu(16, 1), null, 9_000)).toBe(false);
    expect(focDangLuuDaVe(dangLuu(16, 1, 5_000), null, 9_000)).toBe(true);
  });
});
