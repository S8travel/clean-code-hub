import { describe, it, expect } from "vitest";
import { splitCongNoBadge } from "./cong-no-badge";

describe("splitCongNoBadge", () => {
  it("công nợ còn dư → lấy số CÒN LẠI, không phải số gốc", () => {
    const r = splitCongNoBadge([
      { trang_thai: "con_du", so_tien_goc: 500_000, so_tien_con_lai: 200_000 },
    ]);
    expect(r).toEqual({ conDu: 200_000, daCanTru: 0, hoanTien: 0 });
  });

  it("đã cấn trừ hết → VẪN trả số gốc để badge còn hiện (trước đây mất hẳn)", () => {
    const r = splitCongNoBadge([
      { trang_thai: "da_can_tru", so_tien_goc: 6_150_000, so_tien_con_lai: 0 },
    ]);
    expect(r).toEqual({ conDu: 0, daCanTru: 6_150_000, hoanTien: 0 });
  });

  it("hoàn tiền → tách riêng, lấy số gốc", () => {
    const r = splitCongNoBadge([
      { trang_thai: "da_hoan_tien", so_tien_goc: 1_000_000, so_tien_con_lai: 0 },
    ]);
    expect(r).toEqual({ conDu: 0, daCanTru: 0, hoanTien: 1_000_000 });
  });

  it("một khách sạn có cả ba loại → ba số tách bạch, không cộng chồng", () => {
    const r = splitCongNoBadge([
      { trang_thai: "con_du", so_tien_goc: 500_000, so_tien_con_lai: 300_000 },
      { trang_thai: "da_can_tru", so_tien_goc: 6_150_000, so_tien_con_lai: 0 },
      { trang_thai: "da_hoan_tien", so_tien_goc: 1_000_000, so_tien_con_lai: 0 },
    ]);
    expect(r).toEqual({ conDu: 300_000, daCanTru: 6_150_000, hoanTien: 1_000_000 });
  });

  it("nhiều công nợ cùng loại → cộng dồn", () => {
    const r = splitCongNoBadge([
      { trang_thai: "da_can_tru", so_tien_goc: 6_150_000 },
      { trang_thai: "da_can_tru", so_tien_goc: 140_000 },
    ]);
    expect(r.daCanTru).toBe(6_290_000);
  });

  it("trạng thái lạ / thiếu số → bỏ qua, không nổ", () => {
    const r = splitCongNoBadge([
      { trang_thai: "trang_thai_moi", so_tien_goc: 999 },
      { trang_thai: "con_du" },
      { trang_thai: "da_can_tru", so_tien_goc: null },
    ]);
    expect(r).toEqual({ conDu: 0, daCanTru: 0, hoanTien: 0 });
  });

  it("danh sách rỗng → tất cả 0", () => {
    expect(splitCongNoBadge([])).toEqual({ conDu: 0, daCanTru: 0, hoanTien: 0 });
  });
});
