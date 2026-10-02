import { describe, it, expect } from "vitest";
import { taoHangDoiLuu } from "./hang-doi-luu";

describe("taoHangDoiLuu", () => {
  it("rảnh → chạy ngay; xong mà không ai chờ → không chạy lại", () => {
    const h = taoHangDoiLuu();
    expect(h.batDau()).toBe(true);
    expect(h.dangLuu).toBe(true);
    expect(h.ketThuc()).toBe(false);
    expect(h.dangLuu).toBe(false);
  });

  it("đang lưu → yêu cầu mới KHÔNG chạy chồng, được hẹn chạy lại đúng một lần", () => {
    const h = taoHangDoiLuu();
    h.batDau();
    expect(h.batDau()).toBe(false);
    expect(h.batDau()).toBe(false); // 3 yêu cầu dồn lại...
    expect(h.ketThuc()).toBe(true); // ...gộp thành MỘT lượt chạy lại
    expect(h.batDau()).toBe(true);
    expect(h.ketThuc()).toBe(false); // lượt chạy lại xong, không còn gì chờ
  });

  it("lượt chạy lại cũng chặn chồng như lượt đầu", () => {
    const h = taoHangDoiLuu();
    h.batDau();
    h.batDau();
    expect(h.ketThuc()).toBe(true);
    expect(h.batDau()).toBe(true);
    expect(h.batDau()).toBe(false);
    expect(h.ketThuc()).toBe(true);
  });

  it("OP sửa thêm trong lúc lưu → coSuaSau báo có (màn hình mới hơn bản vừa ghi)", () => {
    const h = taoHangDoiLuu();
    h.daSua();
    h.batDau();
    const moc = h.moc;
    expect(h.coSuaSau(moc)).toBe(false);
    h.daSua();
    expect(h.coSuaSau(moc)).toBe(true);
  });

  it("không sửa gì thêm → lượt lưu xong là hết sửa dở", () => {
    const h = taoHangDoiLuu();
    h.daSua();
    h.daSua();
    const moc = h.moc;
    h.batDau();
    h.ketThuc();
    expect(h.coSuaSau(moc)).toBe(false);
  });
});
