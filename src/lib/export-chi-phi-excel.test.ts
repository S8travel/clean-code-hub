import { describe, it, expect } from "vitest";
import { getSoKhachText } from "./export-chi-phi-excel";
import type { ExportDoan } from "./export-chi-phi-excel";

const doan = (p: Partial<ExportDoan>): ExportDoan => p;

describe("getSoKhachText", () => {
  it("ghép đủ breakdown NL · TE 50% · TE free · TL + tổng (khớp trang điều tour)", () => {
    // Ca thực tế đoàn SHI-PQC6D-260604: NL 42, TE 50% 5, TE free 1, TL 1 → tổng 49
    expect(
      getSoKhachText(
        doan({ so_khach_lon: 42, so_khach_em1: 5, so_khach_em2: 1, so_khach_tl: 1 })
      )
    ).toBe("49 khách (42 NL, 5 TE 50%, 1 TE free, 1 TL)");
  });

  it("bỏ qua category = 0 cho gọn", () => {
    expect(getSoKhachText(doan({ so_khach_lon: 30, so_khach_tl: 1 }))).toBe(
      "31 khách (30 NL, 1 TL)"
    );
  });

  it("không có breakdown chi tiết → fallback dùng so_khach tổng", () => {
    expect(getSoKhachText(doan({ so_khach: 20 }))).toBe("20 khách");
  });

  it("rỗng → 0 khách (không crash)", () => {
    expect(getSoKhachText(doan({}))).toBe("0 khách");
  });
});
