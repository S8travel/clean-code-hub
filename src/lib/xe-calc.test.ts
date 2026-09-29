import { describe, it, expect } from "vitest";
import { applyVat, calcXeThanhTien, XE_VAT_DEFAULT, resolveXeNccId, resolveXeTaiKhoan, xepDongXeTheoNhom } from "./xe-calc";

describe("applyVat", () => {
  it("VAT 8% mặc định", () => {
    expect(applyVat(1_000_000, 8)).toBe(1_080_000);
  });
  it("VAT 0% → giữ nguyên (dòng cũ)", () => {
    expect(applyVat(1_000_000, 0)).toBe(1_000_000);
  });
  it("VAT 10%", () => {
    expect(applyVat(2_500_000, 10)).toBe(2_750_000);
  });
  it("làm tròn về số nguyên đồng", () => {
    // 333_333 * 1.08 = 359_999.64 → 360_000
    expect(applyVat(333_333, 8)).toBe(360_000);
  });
  it("clamp đơn giá âm về 0", () => {
    expect(applyVat(-5000, 8)).toBe(0);
  });
  it("clamp VAT âm về 0", () => {
    expect(applyVat(1_000_000, -5)).toBe(1_000_000);
  });
  it("NaN → 0", () => {
    expect(applyVat(NaN, 8)).toBe(0);
    expect(applyVat(1_000_000, NaN)).toBe(1_000_000);
  });
});

describe("calcXeThanhTien", () => {
  it("SL × đơn giá đã VAT", () => {
    // 2 xe × (1_000_000 + 8%) = 2 × 1_080_000
    expect(calcXeThanhTien(2, 1_000_000, 8)).toBe(2_160_000);
  });
  it("VAT 0% (dòng cũ) — bằng SL × đơn giá", () => {
    expect(calcXeThanhTien(3, 1_500_000, 0)).toBe(4_500_000);
  });
  it("SL = 0 → 0", () => {
    expect(calcXeThanhTien(0, 1_000_000, 8)).toBe(0);
  });
  it("SL âm clamp về 0", () => {
    expect(calcXeThanhTien(-2, 1_000_000, 8)).toBe(0);
  });
});

describe("XE_VAT_DEFAULT", () => {
  it("mặc định 8", () => {
    expect(XE_VAT_DEFAULT).toBe(8);
  });
});

describe("resolveXeNccId", () => {
  const xe1 = { id: 51, nha_xe: { nha_cung_cap_id: 419 } };
  const xe2 = { id: 50, nha_xe: { nha_cung_cap_id: 426 } };

  it("dòng có nha_cung_cap_id → giữ nguyên (snapshot có chủ đích thắng)", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: 999, xe_id: 51 }, [xe1, xe2])).toBe(999);
  });

  it("dòng null + xe_id khớp xe 1 → NCC nhà xe master 1", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 51 }, [xe1, xe2])).toBe(419);
  });

  it("dòng null + xe_id khớp xe 2 → NCC nhà xe master 2", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 50 }, [xe1, xe2])).toBe(426);
  });

  it("dòng null + xe_id không khớp master nào → null", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 77 }, [xe1, xe2])).toBe(null);
  });

  it("dòng null + xe_id null → null", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: null }, [xe1, xe2])).toBe(null);
  });

  it("master thiếu nha_xe / nha_cung_cap_id → null", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 51 }, [{ id: 51, nha_xe: null }])).toBe(null);
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 51 }, [{ id: 51, nha_xe: { nha_cung_cap_id: null } }])).toBe(null);
  });

  it("master null/undefined trong mảng → bỏ qua an toàn", () => {
    expect(resolveXeNccId({ nha_cung_cap_id: null, xe_id: 51 }, [null, undefined, xe1])).toBe(419);
  });
});

describe("resolveXeTaiKhoan", () => {
  // Nhà xe CÓ tài khoản nhưng KHÔNG gắn NCC (case ÁNH MINH — đoàn 186).
  const anhMinh = { id: 43, nha_xe: { nha_cung_cap_id: null, tai_khoan_thanh_toan: "Chủ TK: Việt Dương Phát\nSố TK: 118002620035\nNgân hàng: VietinBank" } };
  const coNcc = { id: 51, nha_xe: { nha_cung_cap_id: 419, tai_khoan_thanh_toan: "HOÀNG HẬU\nSố TK: 1051764751" } };

  it("nhà xe có TK nhưng KHÔNG NCC → vẫn trả TK (fix chính)", () => {
    expect(resolveXeTaiKhoan({ xe_id: 43 }, [anhMinh])).toContain("118002620035");
  });

  it("nhà xe có NCC + TK → trả TK", () => {
    expect(resolveXeTaiKhoan({ xe_id: 51 }, [anhMinh, coNcc])).toContain("1051764751");
  });

  it("xe_id không khớp master → null", () => {
    expect(resolveXeTaiKhoan({ xe_id: 99 }, [anhMinh, coNcc])).toBe(null);
  });

  it("xe_id null → null", () => {
    expect(resolveXeTaiKhoan({ xe_id: null }, [anhMinh])).toBe(null);
  });

  it("master không có nha_xe / TK rỗng → null", () => {
    expect(resolveXeTaiKhoan({ xe_id: 43 }, [{ id: 43, nha_xe: null }])).toBe(null);
    expect(resolveXeTaiKhoan({ xe_id: 43 }, [{ id: 43, nha_xe: { tai_khoan_thanh_toan: "   " } }])).toBe(null);
  });

  it("master null/undefined trong mảng → bỏ qua an toàn", () => {
    expect(resolveXeTaiKhoan({ xe_id: 43 }, [null, undefined, anhMinh])).toContain("VietinBank");
  });
});

describe("xepDongXeTheoNhom", () => {
  // Nhà xe A = xe 1 (id 17), nhà xe B = xe 2 (id 54); dòng phụ bấm "+" trên dòng
  // nhà xe A SAU khi đã thêm dòng xe 2 → id lớn nhất.
  const rows = [
    { id: 26792, xe_id: 17, mo_ta: "Nhà xe A · 45 chỗ" },
    { id: 26794, xe_id: 54, mo_ta: "Nhà xe B · 7 chỗ" },
    { id: 26796, xe_id: 17, mo_ta: "Phụ phí" },
  ];

  it("dòng phụ đứng ngay dưới dòng cùng nhà xe, không nằm sau xe 2", () => {
    const out = xepDongXeTheoNhom(rows, 17, 54);
    expect(out.map((d) => [d.row.id, d.dauNhom, d.slot])).toEqual([
      [26792, true, 1],
      [26796, false, 1],
      [26794, true, 2],
    ]);
  });

  it("xe 1 luôn đứng trước xe 2 dù dòng xe 2 tạo trước", () => {
    const out = xepDongXeTheoNhom(
      [{ id: 1, xe_id: 54 }, { id: 2, xe_id: 17 }],
      17, 54,
    );
    expect(out.map((d) => d.row.id)).toEqual([2, 1]);
  });

  it("trong nhóm giữ thứ tự id, không phụ thuộc thứ tự đầu vào", () => {
    const out = xepDongXeTheoNhom(
      [{ id: 30, xe_id: 17 }, { id: 10, xe_id: 17 }, { id: 20, xe_id: 17 }],
      17, null,
    );
    expect(out.map((d) => [d.row.id, d.dauNhom])).toEqual([[10, true], [20, false], [30, false]]);
  });

  it("xe không còn gắn với đoàn (đã đổi xe): slot null, vẫn gom nhóm, đứng sau xe 1/xe 2", () => {
    const out = xepDongXeTheoNhom(
      [{ id: 1, xe_id: 99 }, { id: 2, xe_id: 17 }, { id: 3, xe_id: 99 }],
      17, null,
    );
    expect(out.map((d) => [d.row.id, d.dauNhom, d.slot])).toEqual([
      [2, true, 1],
      [1, true, null],
      [3, false, null],
    ]);
  });

  it("dòng chưa gắn xe: mỗi dòng tự đứng đầu (không biết cùng nhà xe), xếp cuối", () => {
    const out = xepDongXeTheoNhom(
      [{ id: 1, xe_id: null }, { id: 2 }, { id: 3, xe_id: 17 }],
      17, null,
    );
    expect(out.map((d) => [d.row.id, d.dauNhom, d.slot])).toEqual([
      [3, true, 1],
      [1, true, null],
      [2, true, null],
    ]);
  });

  it("đoàn chưa chọn xe (xe1Id null) → không dòng nào nhận slot 1", () => {
    const out = xepDongXeTheoNhom([{ id: 1, xe_id: 17 }], null, null);
    expect(out[0].slot).toBeNull();
  });

  it("danh sách rỗng", () => {
    expect(xepDongXeTheoNhom([], 17, 54)).toEqual([]);
  });
});
