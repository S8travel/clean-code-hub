import { describe, it, expect } from "vitest";
import { dnttDichVuLabel, formatHoaDonLechMoTa } from "./hoa-don-lech";

describe("dnttDichVuLabel", () => {
  it("ghép nhãn loại + mô tả", () => {
    expect(dnttDichVuLabel("dich_vu", "Vinwonder Nam Hội An")).toBe("Dịch vụ: Vinwonder Nam Hội An");
  });
  it("loại lạ → giữ nguyên giá trị", () => {
    expect(dnttDichVuLabel("xyz", "abc")).toBe("xyz: abc");
  });
  it("không mô tả → fallback tên NCC", () => {
    expect(dnttDichVuLabel("nha_hang", null, "Nhà hàng ABC")).toBe("Nhà hàng: Nhà hàng ABC");
  });
  it("cắt mô tả quá dài (… ở cuối)", () => {
    const long = "x".repeat(200);
    const out = dnttDichVuLabel("dich_vu", long);
    expect(out.length).toBeLessThanOrEqual(90);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("formatHoaDonLechMoTa", () => {
  it("ca thực tế ĐNTT #604: có dịch vụ, lệch âm, marker + đoàn", () => {
    const s = formatHoaDonLechMoTa({
      id: 604,
      hoaDon: 3_400_000,
      dnttSoTien: 3_600_000,
      loai: "dich_vu",
      dnttMoTa: "Vinwonder Nam Hội An - vé vào cửa",
      tenDoan: "VDC053005BR6",
    });
    expect(s).toContain("[HĐ#604]");
    expect(s).toContain("Dịch vụ: Vinwonder Nam Hội An - vé vào cửa");
    expect(s).toContain("3.400.000 ₫ ≠ số tiền ĐNTT 3.600.000 ₫");
    expect(s).toContain("(lệch -200.000 ₫)");
    expect(s).toContain("· Đoàn VDC053005BR6");
  });

  it("lệch dương có dấu +", () => {
    const s = formatHoaDonLechMoTa({ id: 1, hoaDon: 500_000, dnttSoTien: 300_000, loai: "xe" });
    expect(s).toContain("(lệch +200.000 ₫)");
    expect(s).toContain("Xe");
  });

  it("không có dịch vụ/đoàn → message vẫn hợp lệ, vẫn có marker", () => {
    const s = formatHoaDonLechMoTa({ id: 7, hoaDon: 100_000, dnttSoTien: 100_001 });
    expect(s.startsWith("[HĐ#7] Hóa đơn nhập")).toBe(true);
    expect(s).not.toContain("· Đoàn");
  });
});
