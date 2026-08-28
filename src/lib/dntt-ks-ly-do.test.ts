import { describe, it, expect } from "vitest";
import { computeLyDoDNTTKS } from "./dntt-ks-ly-do";

describe("computeLyDoDNTTKS", () => {
  const doan = { tenDoan: "DOAN-TEST-01", soKhach: 17 };

  it("1 dịch vụ, cọc → nêu tên khách sạn", () => {
    expect(computeLyDoDNTTKS({ ...doan, tenKS: "Du thuyền A", laCoc: true })).toBe(
      "Đề nghị thanh toán tiền cọc khách sạn Du thuyền A cho đoàn DOAN-TEST-01 - 17 khách",
    );
  });

  it("1 dịch vụ, trả đủ → bỏ chữ cọc", () => {
    expect(computeLyDoDNTTKS({ ...doan, tenKS: "Du thuyền A" })).toBe(
      "Đề nghị thanh toán tiền khách sạn Du thuyền A cho đoàn DOAN-TEST-01 - 17 khách",
    );
  });

  it("phiếu gộp nhiều dịch vụ → KHÔNG nêu tên dịch vụ nào", () => {
    // Du thuyền + tàu hoả trên cùng 1 phiếu: chú giải cũ chỉ ghi tên
    // dịch vụ đầu tiên → sai.
    const lyDo = computeLyDoDNTTKS({
      ...doan,
      tenKS: "Du thuyền A",
      laCoc: true,
      gopNhieuDichVu: true,
    });
    expect(lyDo).toBe("Đề nghị thanh toán tiền cho đoàn DOAN-TEST-01 - 17 khách");
    expect(lyDo).not.toContain("Du thuyền");
    expect(lyDo).not.toContain("khách sạn");
  });

  it("không có số khách → bỏ hậu tố", () => {
    expect(computeLyDoDNTTKS({ tenDoan: "ABC", soKhach: 0, gopNhieuDichVu: true })).toBe(
      "Đề nghị thanh toán tiền cho đoàn ABC",
    );
  });

  it("thiếu tên khách sạn → bỏ luôn cụm 'khách sạn'", () => {
    expect(computeLyDoDNTTKS({ ...doan, tenKS: "  ", laCoc: true })).toBe(
      "Đề nghị thanh toán tiền cọc cho đoàn DOAN-TEST-01 - 17 khách",
    );
  });
});
