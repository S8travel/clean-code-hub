import { describe, it, expect } from "vitest";
import {
  dnttDichVuLabel,
  formatHoaDonLechMoTa,
  calcHoaDonExpectedTotal,
  calcHoaDonLech,
} from "./hoa-don-lech";

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

describe("calcHoaDonExpectedTotal / calcHoaDonLech", () => {
  it("không tách cọc (cocSibling=0) → mốc = chính so_tien", () => {
    expect(calcHoaDonExpectedTotal(159_400_000)).toBe(159_400_000);
    expect(calcHoaDonLech(159_400_000, 159_400_000)).toBe(0);
  });

  it("ca thực tế Ambassador Cruise: 159.4M còn lại + 164M cọc, HĐ gộp 323.4M → KHỚP", () => {
    const soTien = 159_400_000;
    const daCoc = 164_000_000;
    expect(calcHoaDonExpectedTotal(soTien, daCoc)).toBe(323_400_000);
    expect(calcHoaDonLech(323_400_000, soTien, daCoc)).toBe(0);
  });

  it("nhập đúng phần ĐNTT còn lại (bỏ qua cọc) → vẫn lệch âm = phần cọc", () => {
    expect(calcHoaDonLech(159_400_000, 159_400_000, 164_000_000)).toBe(-164_000_000);
  });

  it("HĐ gộp lớn hơn tổng → lệch dương", () => {
    expect(calcHoaDonLech(330_000_000, 159_400_000, 164_000_000)).toBe(6_600_000);
  });

  it("sibling gồm CỌC + BỔ SUNG (phát sinh), không chỉ cọc → mốc đủ", () => {
    // Dòng đang nhập HĐ nhỏ; anh em cùng nhóm = cọc + [Bổ sung] phát sinh.
    const soTien = 1_650_000;
    const sibling = 10_000_000 + 108_260_000; // gồm bổ sung — trước đây bỏ sót
    expect(calcHoaDonExpectedTotal(soTien, sibling)).toBe(119_910_000);
    expect(calcHoaDonLech(119_910_000, soTien, sibling)).toBe(0);
    expect(calcHoaDonLech(119_860_000, soTien, sibling)).toBe(-50_000); // không phải +108tr giả
  });

  it("cocSibling âm (dữ liệu rác) bị clamp về 0", () => {
    expect(calcHoaDonExpectedTotal(100_000, -50_000)).toBe(100_000);
  });

  it("làm tròn 2 vế trước khi trừ (tránh sai số thập phân)", () => {
    expect(calcHoaDonLech(100_000.4, 100_000.2, 0)).toBe(0);
  });
});
