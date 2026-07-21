import { describe, it, expect } from "vitest";
import { buildRemainingAllocations } from "./alloc-remaining";

describe("buildRemainingAllocations", () => {
  it("chưa cam kết gì → chia pro-rata theo thành tiền", () => {
    const allocs = buildRemainingAllocations(4_200_000, [
      { id: 1, thanh_tien: 1_050_000 },
      { id: 2, thanh_tien: 2_100_000 },
      { id: 3, thanh_tien: 1_050_000 },
    ]);
    expect(allocs).toEqual([
      { chi_phi_id: 1, so_tien: 1_050_000 },
      { chi_phi_id: 2, so_tien: 2_100_000 },
      { chi_phi_id: 3, so_tien: 1_050_000 },
    ]);
  });

  it("ĐNTT khoản còn lại → chỉ gắn vào dòng phát sinh mới (bug rải pro-rata)", () => {
    // Thẻ g8: 2 dòng đã cam kết + trả đủ 3.150.000, thêm dòng mới 1.050.000
    const allocs = buildRemainingAllocations(1_050_000, [
      { id: 13655, thanh_tien: 1_050_000, committed: 1_050_000 },
      { id: 13657, thanh_tien: 2_100_000, committed: 2_100_000 },
      { id: 15291, thanh_tien: 1_050_000, committed: 0 },
    ]);
    expect(allocs).toEqual([{ chi_phi_id: 15291, so_tien: 1_050_000 }]);
  });

  it("nhiều dòng còn dư → chia theo phần còn lại, tổng khớp số tiền ĐNTT", () => {
    const allocs = buildRemainingAllocations(900_000, [
      { id: 1, thanh_tien: 1_000_000, committed: 400_000 },  // còn 600k
      { id: 2, thanh_tien: 1_000_000, committed: 700_000 },  // còn 300k
      { id: 3, thanh_tien: 500_000, committed: 500_000 },    // hết → bỏ
    ]);
    expect(allocs).toEqual([
      { chi_phi_id: 1, so_tien: 600_000 },
      { chi_phi_id: 2, so_tien: 300_000 },
    ]);
    expect(allocs.reduce((s, a) => s + a.so_tien, 0)).toBe(900_000);
  });

  it("cam kết vượt thành tiền (dữ liệu cũ) → dòng đó coi như hết phần còn lại", () => {
    const allocs = buildRemainingAllocations(500_000, [
      { id: 1, thanh_tien: 1_000_000, committed: 1_312_500 },
      { id: 2, thanh_tien: 500_000, committed: 0 },
    ]);
    expect(allocs).toEqual([{ chi_phi_id: 2, so_tien: 500_000 }]);
  });

  it("mọi dòng đã cam kết đủ → fallback chia theo thành tiền (không trả phiếu rỗng)", () => {
    const allocs = buildRemainingAllocations(1_000_000, [
      { id: 1, thanh_tien: 1_000_000, committed: 1_000_000 },
      { id: 2, thanh_tien: 1_000_000, committed: 1_000_000 },
    ]);
    expect(allocs.reduce((s, a) => s + a.so_tien, 0)).toBe(1_000_000);
    expect(allocs).toHaveLength(2);
  });

  it("bỏ dòng FOC (thành tiền = 0) — dntt_allocations CHECK so_tien > 0", () => {
    const allocs = buildRemainingAllocations(800_000, [
      { id: 1, thanh_tien: 0 },
      { id: 2, thanh_tien: 800_000 },
    ]);
    expect(allocs).toEqual([{ chi_phi_id: 2, so_tien: 800_000 }]);
  });

  it("không có dòng nào dương → mảng rỗng", () => {
    expect(buildRemainingAllocations(500_000, [{ id: 1, thanh_tien: 0 }])).toEqual([]);
  });

  it("số lẻ → largest-remainder, tổng vẫn khớp", () => {
    const allocs = buildRemainingAllocations(1_000_000, [
      { id: 1, thanh_tien: 1_000_000, committed: 0 },
      { id: 2, thanh_tien: 1_000_000, committed: 0 },
      { id: 3, thanh_tien: 1_000_000, committed: 0 },
    ]);
    expect(allocs.reduce((s, a) => s + a.so_tien, 0)).toBe(1_000_000);
  });
});
