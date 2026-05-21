import { describe, it, expect } from "vitest";
import {
  isKSRoomRow,
  calcRowFocBreakdown,
  calcTotalKS,
  calcFocSuggestion,
  resolveKSFoc,
  calcSoKhachThucTe,
  resolveNHFoc,
  resolveNHChietKhau,
  type KSFocRow,
} from "./foc-calc";

// Helper dựng KSFocRow đủ field bắt buộc; override phần cần test.
const ksRow = (p: Partial<KSFocRow>): KSFocRow => ({
  so_phong: 0,
  so_dem: 1,
  gia_phong: 0,
  ...p,
});

// ─── isKSRoomRow ─────────────────────────────────────────────────────────────

describe("isKSRoomRow", () => {
  it("không có loai_row → là phòng (legacy)", () => {
    expect(isKSRoomRow({})).toBe(true);
  });
  it("loai_row rỗng → là phòng", () => {
    expect(isKSRoomRow({ loai_row: "" })).toBe(true);
  });
  it("loai_row 'phong' → là phòng", () => {
    expect(isKSRoomRow({ loai_row: "phong" })).toBe(true);
  });
  it("loai_row dịch vụ → KHÔNG phải phòng", () => {
    expect(isKSRoomRow({ loai_row: "dich_vu_an" })).toBe(false);
    expect(isKSRoomRow({ loai_row: "dich_vu_ve" })).toBe(false);
    expect(isKSRoomRow({ loai_row: "dich_vu_khac" })).toBe(false);
  });
});

// ─── calcRowFocBreakdown ─────────────────────────────────────────────────────

describe("calcRowFocBreakdown", () => {
  it("foc_count 0 → không trừ gì", () => {
    expect(calcRowFocBreakdown(ksRow({ foc_count: 0, gia_phong: 1_000_000 }), [], null, null))
      .toEqual({ rowFocDeduction: 0, rowFocCount: 0 });
  });
  it("foc_count undefined → không trừ gì", () => {
    expect(calcRowFocBreakdown(ksRow({ gia_phong: 1_000_000 }), [], null, null))
      .toEqual({ rowFocDeduction: 0, rowFocCount: 0 });
  });
  it("foc_count âm → clamp về 0", () => {
    expect(calcRowFocBreakdown(ksRow({ foc_count: -3, gia_phong: 1_000_000 }), [], null, null))
      .toEqual({ rowFocDeduction: 0, rowFocCount: 0 });
  });
  it("foc_count 2 × giá 1.000.000 → trừ 2.000.000", () => {
    expect(calcRowFocBreakdown(ksRow({ foc_count: 2, gia_phong: 1_000_000 }), [], null, null))
      .toEqual({ rowFocDeduction: 2_000_000, rowFocCount: 2 });
  });
  it("foc_count thập phân 0.5 (foc_mien lẻ) → làm tròn deduction", () => {
    expect(calcRowFocBreakdown(ksRow({ foc_count: 0.5, gia_phong: 2_650_000 }), [], null, null))
      .toEqual({ rowFocDeduction: 1_325_000, rowFocCount: 0.5 });
  });
  it("deduction được Math.round (giá lẻ)", () => {
    expect(calcRowFocBreakdown(ksRow({ foc_count: 1, gia_phong: 333.33 }), [], null, null))
      .toEqual({ rowFocDeduction: 333, rowFocCount: 1 });
  });
  it("gia_phong NaN → deduction 0 nhưng vẫn giữ rowFocCount", () => {
    expect(calcRowFocBreakdown(ksRow({ foc_count: 1, gia_phong: NaN }), [], null, null))
      .toEqual({ rowFocDeduction: 0, rowFocCount: 1 });
  });
});

// ─── calcTotalKS ─────────────────────────────────────────────────────────────

describe("calcTotalKS", () => {
  it("rows rỗng → 0", () => {
    expect(calcTotalKS([], null, null)).toBe(0);
  });
  it("1 row phòng: (so_phong - foc_count) × giá × so_dem", () => {
    // (10 - 2) × 1.000.000 × 3 = 24.000.000
    const rows = [ksRow({ loai_row: "phong", so_phong: 10, foc_count: 2, gia_phong: 1_000_000, so_dem: 3 })];
    expect(calcTotalKS(rows, null, null)).toBe(24_000_000);
  });
  it("row dịch vụ → so_dem bị bỏ qua (luôn = 1)", () => {
    // (5 - 1) × 200.000 × 1 = 800.000 (so_dem 99 không ảnh hưởng)
    const rows = [ksRow({ loai_row: "dich_vu_an", so_phong: 5, foc_count: 1, gia_phong: 200_000, so_dem: 99 })];
    expect(calcTotalKS(rows, null, null)).toBe(800_000);
  });
  it("billed clamp ≥ 0 khi foc_count > so_phong", () => {
    const rows = [ksRow({ loai_row: "phong", so_phong: 2, foc_count: 5, gia_phong: 1_000_000, so_dem: 1 })];
    expect(calcTotalKS(rows, null, null)).toBe(0);
  });
  it("so_dem 0 → mặc định 1", () => {
    const rows = [ksRow({ loai_row: "phong", so_phong: 4, foc_count: 0, gia_phong: 500_000, so_dem: 0 })];
    expect(calcTotalKS(rows, null, null)).toBe(2_000_000);
  });
  it("cộng dồn nhiều row (phòng + dịch vụ)", () => {
    const rows = [
      ksRow({ loai_row: "phong", so_phong: 10, foc_count: 1, gia_phong: 1_000_000, so_dem: 2 }), // 9×1M×2 = 18M
      ksRow({ loai_row: "dich_vu_an", so_phong: 8, foc_count: 0, gia_phong: 150_000, so_dem: 1 }), // 8×150k = 1.2M
    ];
    expect(calcTotalKS(rows, null, null)).toBe(19_200_000);
  });
});

// ─── calcFocSuggestion ───────────────────────────────────────────────────────

describe("calcFocSuggestion", () => {
  it("rows rỗng → totalRooms 0, suggest 0", () => {
    expect(calcFocSuggestion([], 16, 1)).toEqual({ totalRooms: 0, suggestedFoc: 0 });
  });
  it("focKhach null → suggest 0", () => {
    expect(calcFocSuggestion([{ so_phong: 32 }], null, 1)).toEqual({ totalRooms: 32, suggestedFoc: 0 });
  });
  it("focMien null → suggest 0", () => {
    expect(calcFocSuggestion([{ so_phong: 32 }], 16, null)).toEqual({ totalRooms: 32, suggestedFoc: 0 });
  });
  it("focKhach 0 → suggest 0", () => {
    expect(calcFocSuggestion([{ so_phong: 32 }], 0, 1)).toEqual({ totalRooms: 32, suggestedFoc: 0 });
  });
  it("totalRooms < focKhach → suggest 0", () => {
    expect(calcFocSuggestion([{ so_phong: 10 }], 16, 1)).toEqual({ totalRooms: 10, suggestedFoc: 0 });
  });
  it("16免1: 32 phòng → suggest 2", () => {
    expect(calcFocSuggestion([{ so_phong: 20 }, { so_phong: 12 }], 16, 1))
      .toEqual({ totalRooms: 32, suggestedFoc: 2 });
  });
  it("16免1: 30 phòng → floor(30/16)=1 → suggest 1", () => {
    expect(calcFocSuggestion([{ so_phong: 30 }], 16, 1)).toEqual({ totalRooms: 30, suggestedFoc: 1 });
  });
  it("totalRooms = focKhach → suggest đúng focMien", () => {
    expect(calcFocSuggestion([{ so_phong: 16 }], 16, 1)).toEqual({ totalRooms: 16, suggestedFoc: 1 });
  });
  it("foc_mien thập phân 0.5", () => {
    expect(calcFocSuggestion([{ so_phong: 32 }], 16, 0.5)).toEqual({ totalRooms: 32, suggestedFoc: 1 });
  });
});

// ─── resolveKSFoc ────────────────────────────────────────────────────────────

describe("resolveKSFoc", () => {
  const master = { foc_khach: 16, foc_mien: 1 };

  it("không row nào có snapshot → dùng master", () => {
    expect(resolveKSFoc([{ foc_khach_snapshot: null, foc_mien_snapshot: null }], master))
      .toEqual({ foc_khach: 16, foc_mien: 1 });
  });
  it("rows rỗng → dùng master", () => {
    expect(resolveKSFoc([], master)).toEqual({ foc_khach: 16, foc_mien: 1 });
  });
  it("master null/undefined → {null, null}", () => {
    expect(resolveKSFoc([], null)).toEqual({ foc_khach: null, foc_mien: null });
    expect(resolveKSFoc([], undefined)).toEqual({ foc_khach: null, foc_mien: null });
  });
  it("có row mang snapshot → ưu tiên snapshot, BỎ master", () => {
    const rows = [
      { foc_khach_snapshot: null, foc_mien_snapshot: null },
      { foc_khach_snapshot: 20, foc_mien_snapshot: 2 },
    ];
    expect(resolveKSFoc(rows, master)).toEqual({ foc_khach: 20, foc_mien: 2 });
  });
  it("chỉ foc_mien_snapshot có → vẫn nhận là 'có snapshot', foc_khach = null", () => {
    expect(resolveKSFoc([{ foc_khach_snapshot: null, foc_mien_snapshot: 2 }], master))
      .toEqual({ foc_khach: null, foc_mien: 2 });
  });
  it("snapshot = 0 là hợp lệ → trust snapshot, không fallback master", () => {
    expect(resolveKSFoc([{ foc_khach_snapshot: 0, foc_mien_snapshot: 0 }], master))
      .toEqual({ foc_khach: 0, foc_mien: 0 });
  });
});

// ─── calcSoKhachThucTe ───────────────────────────────────────────────────────

describe("calcSoKhachThucTe", () => {
  it("focKhach null → giữ nguyên số khách", () => {
    expect(calcSoKhachThucTe(20, null, 1)).toBe(20);
  });
  it("focMien null → giữ nguyên số khách", () => {
    expect(calcSoKhachThucTe(20, 16, null)).toBe(20);
  });
  it("focKhach 0 → giữ nguyên số khách", () => {
    expect(calcSoKhachThucTe(20, 0, 1)).toBe(20);
  });
  it("20 khách, 16免1 → 19 khách tính tiền", () => {
    expect(calcSoKhachThucTe(20, 16, 1)).toBe(19);
  });
  it("32 khách, 16免1 → 30 khách tính tiền", () => {
    expect(calcSoKhachThucTe(32, 16, 1)).toBe(30);
  });
  it("15 khách < focKhach 16 → không trừ ai", () => {
    expect(calcSoKhachThucTe(15, 16, 1)).toBe(15);
  });
  it("48 khách, 16免2 → 48 - 6 = 42", () => {
    expect(calcSoKhachThucTe(48, 16, 2)).toBe(42);
  });
  it("foc_mien thập phân 0.5: 32 khách → 31", () => {
    expect(calcSoKhachThucTe(32, 16, 0.5)).toBe(31);
  });
});

// ─── resolveNHFoc ────────────────────────────────────────────────────────────

describe("resolveNHFoc", () => {
  const nh = { foc_khach: 10, foc_mien: 1 };

  it("row null → dùng master", () => {
    expect(resolveNHFoc(null, nh)).toEqual({ foc_khach: 10, foc_mien: 1 });
  });
  it("row không có snapshot → dùng master", () => {
    expect(resolveNHFoc({ foc_khach_snapshot: null, foc_mien_snapshot: null }, nh))
      .toEqual({ foc_khach: 10, foc_mien: 1 });
  });
  it("master null → {null, null}", () => {
    expect(resolveNHFoc(null, null)).toEqual({ foc_khach: null, foc_mien: null });
  });
  it("row có snapshot → ưu tiên snapshot", () => {
    expect(resolveNHFoc({ foc_khach_snapshot: 12, foc_mien_snapshot: 2 }, nh))
      .toEqual({ foc_khach: 12, foc_mien: 2 });
  });
  it("chỉ foc_khach_snapshot có → foc_mien = null", () => {
    expect(resolveNHFoc({ foc_khach_snapshot: 12, foc_mien_snapshot: null }, nh))
      .toEqual({ foc_khach: 12, foc_mien: null });
  });
  it("snapshot = 0 hợp lệ → trust snapshot", () => {
    expect(resolveNHFoc({ foc_khach_snapshot: 0, foc_mien_snapshot: 0 }, nh))
      .toEqual({ foc_khach: 0, foc_mien: 0 });
  });
});

// ─── resolveNHChietKhau ──────────────────────────────────────────────────────

describe("resolveNHChietKhau", () => {
  it("row null → dùng master", () => {
    expect(resolveNHChietKhau(null, { chiet_khau_phan_tram: 5 })).toBe(5);
  });
  it("row không có snapshot → dùng master", () => {
    expect(resolveNHChietKhau({ chiet_khau_phan_tram_snapshot: null }, { chiet_khau_phan_tram: 5 })).toBe(5);
  });
  it("master null → 0", () => {
    expect(resolveNHChietKhau(null, null)).toBe(0);
    expect(resolveNHChietKhau({ chiet_khau_phan_tram_snapshot: null }, { chiet_khau_phan_tram: null })).toBe(0);
  });
  it("row có snapshot → ưu tiên snapshot", () => {
    expect(resolveNHChietKhau({ chiet_khau_phan_tram_snapshot: 10 }, { chiet_khau_phan_tram: 5 })).toBe(10);
  });
  it("snapshot = 0 hợp lệ (OP clear ô) → trả 0, KHÔNG fallback master", () => {
    expect(resolveNHChietKhau({ chiet_khau_phan_tram_snapshot: 0 }, { chiet_khau_phan_tram: 5 })).toBe(0);
  });
});
