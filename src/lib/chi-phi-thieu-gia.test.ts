import { describe, it, expect } from "vitest";
import { timDongPhatSinhThieuGia } from "./chi-phi-thieu-gia";

const row = (
  id: number,
  mo_ta: string,
  don_gia: number,
  tien_cong_ty = 0,
  tien_hdv = 0,
) => ({ id, mo_ta, don_gia, tien_cong_ty, tien_hdv });

describe("timDongPhatSinhThieuGia", () => {
  it("bắt dòng phát sinh còn nguyên đơn giá 0 (tạo xong bỏ dở)", () => {
    const rows = [row(101, "[trua] NƯỚC NHÀ HÀNG A", 0)];
    expect(timDongPhatSinhThieuGia(rows)).toEqual([
      { id: 101, nhan: "NƯỚC NHÀ HÀNG A" },
    ]);
  });

  it("bỏ qua dòng phát sinh đã nhập đủ giá", () => {
    const rows = [row(102, "[toi] NƯỚC NHÀ HÀNG B", 28_875, 0, 635_250)];
    expect(timDongPhatSinhThieuGia(rows)).toEqual([]);
  });

  it("bỏ qua dòng chính giá 0 — bữa tự lo / ăn trong vé là bình thường", () => {
    const rows = [
      row(103, "XXX (trưa)", 0),
      row(104, "自理 (trưa)", 0),
      row(105, "Ăn trong vé tham quan (trưa)", 0),
    ];
    expect(timDongPhatSinhThieuGia(rows)).toEqual([]);
  });

  it("bắt cả dòng phát sinh dịch vụ [dvps_]", () => {
    const rows = [row(106, "[dvps_555] Vé cano thêm", 0)];
    expect(timDongPhatSinhThieuGia(rows)).toEqual([{ id: 106, nhan: "Vé cano thêm" }]);
  });

  it("có đơn giá nhưng thành tiền 0 (SL 0) vẫn là dòng hỏng", () => {
    const rows = [row(107, "[toi] NƯỚC NHÀ HÀNG C", 22_000, 0, 0)];
    expect(timDongPhatSinhThieuGia(rows)).toEqual([{ id: 107, nhan: "NƯỚC NHÀ HÀNG C" }]);
  });

  it("bỏ qua dòng phát sinh chưa đặt tên — OP đang gõ dở", () => {
    const rows = [row(108, "[toi] ", 0)];
    expect(timDongPhatSinhThieuGia(rows)).toEqual([]);
  });

  it("dòng công ty trả cũng tính đủ (tien_cong_ty > 0)", () => {
    const rows = [row(109, "[trua] Suất trẻ em", 150_000, 300_000, 0)];
    expect(timDongPhatSinhThieuGia(rows)).toEqual([]);
  });
});
